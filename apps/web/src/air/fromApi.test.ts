import { Today, type WeatherDay, type WeatherHour } from '@vayu/contracts';
import { describe, expect, it } from 'vitest';
import type { Pin } from '../data/pins';
import { NoAirError, conditionFor, todayDataFromApi } from './fromApi';

const pin: Pin = { id: '28.59,77.05', name: 'Home', detail: 'Delhi NCR', lat: 28.59, lng: 77.05 };
// 10 Oct 2026, 17:30 India time.
const AS_OF = '2026-10-10T12:00:00.000Z';
const HOUR = 3_600_000;
const hourStart = (offset: number): string =>
  new Date(Date.parse('2026-10-10T11:30:00.000Z') + offset * HOUR).toISOString();

const weatherHour = (offset: number, patch: Partial<WeatherHour> = {}): WeatherHour => ({
  t: hourStart(offset),
  tempC: 29.6,
  rhPct: 48,
  windKmh: 8.4,
  windFromDeg: 300,
  rainPct: 10,
  rainMm: 0,
  code: 2,
  isDay: true,
  uv: 1.4,
  ...patch,
});
const weatherDay = (date: string, patch: Partial<WeatherDay> = {}): WeatherDay => ({
  date,
  tMaxC: 33.4,
  tMinC: 22.1,
  windKmh: 12,
  windFromDeg: 120,
  rhPct: 55,
  rainPct: 30,
  code: 3,
  sunrise: '2026-10-10T00:51:00.000Z',
  sunset: '2026-10-10T12:27:00.000Z',
  ...patch,
});

/** Observed hours up to the last one that ended, then forecast hours for four days. */
function fixture(
  options: {
    mode?: 'live' | 'model';
    weather?: boolean;
    pm25?: (offset: number) => number | null;
  } = {},
): Today {
  const pm = options.pm25 ?? ((o: number) => 60 + o * 0.5);
  const hours = Array.from({ length: 48 + 96 }, (_, i) => {
    const offset = i - 48; // 0 is the hour that began 30 minutes before AS_OF's hour... see hourStart
    return {
      t: hourStart(offset - 1),
      pm25: pm(offset),
      kind: offset <= 0 ? ('observed' as const) : ('forecast' as const),
    };
  });
  const live = (options.mode ?? 'live') === 'live';
  return Today.parse({
    schemaVersion: 1,
    place: { id: 'gps', name: 'Your location', kind: 'other', lat: 28.59, lng: 77.05 },
    asOf: AS_OF,
    mode: live ? 'live' : 'model',
    hours: live ? hours : hours.map((h) => ({ ...h, kind: 'forecast' })),
    ...(options.weather === false
      ? {}
      : {
          weather: {
            hours: Array.from({ length: 48 }, (_, i) => weatherHour(i - 1)),
            days: [
              weatherDay('2026-10-09T18:30:00.000Z'),
              weatherDay('2026-10-10T18:30:00.000Z', { code: 61, rainPct: 70 }),
              weatherDay('2026-10-11T18:30:00.000Z'),
              weatherDay('2026-10-12T18:30:00.000Z'),
              weatherDay('2026-10-13T18:30:00.000Z'),
              weatherDay('2026-10-14T18:30:00.000Z'),
              weatherDay('2026-10-15T18:30:00.000Z'),
            ],
          },
        }),
    gases: { at: AS_OF, pm10: 150, o3: 40, no2: null, so2: 12, co: 900 },
    windows: [],
    headline: 'No clean hour today.',
    prov: live
      ? {
          mode: 'live',
          label: 'Nearby station',
          source: 'station',
          stationId: 'openaq-sensor-1',
          stationName: 'GK1',
          distanceKm: 4.2067,
          observedAt: '2026-10-10T11:30:00.000Z',
          fetchedAt: AS_OF,
          asOf: AS_OF,
          ageMinutes: 30,
        }
      : {
          mode: 'model',
          label: 'Estimate',
          source: 'model',
          fetchedAt: AS_OF,
          asOf: AS_OF,
          ageMinutes: 0,
        },
  });
}

describe('the API’s Today as the app’s TodayData', () => {
  it('takes the reading now from the newest observed hour, and works the AQI out from it', () => {
    const data = todayDataFromApi(pin, fixture());
    expect(data.pm25).toBe(60);
    expect(data.aqi).toBe(154); // US EPA: 60 µg/m³ is in the Unhealthy band
    expect(data.hourly[0]).toMatchObject({ at: AS_OF, aqi: 154, pm25: 60 });
    expect(data.place).toEqual({ name: 'Home', region: 'Delhi NCR' });
  });

  it('says where it came from and how old it is (rule I2)', () => {
    const live = todayDataFromApi(pin, fixture()).provenance;
    expect(live).toEqual({
      mode: 'live',
      label: 'Nearby station',
      stationName: 'GK1',
      distanceKm: 4.2067,
      ageMinutes: 30,
    });
    const model = todayDataFromApi(pin, fixture({ mode: 'model' })).provenance;
    expect(model).toMatchObject({ mode: 'model', label: 'Estimate' });
    expect(model.stationName).toBeUndefined();
  });

  it('with no monitor takes the model’s hour in progress, and says so', () => {
    const data = todayDataFromApi(pin, fixture({ mode: 'model' }));
    expect(data.history).toEqual([]);
    expect(data.pm25).toBeGreaterThan(0);
  });

  it('turns the weather model’s hour into the app’s sky words, rounded', () => {
    const data = todayDataFromApi(pin, fixture());
    expect(data.weather).toEqual({
      condition: 'partly-cloudy',
      isDay: true,
      tempC: 30,
      humidityPct: 48,
      windKmh: 8,
      windFromDeg: 300,
      rainChancePct: 10,
      rainMm: 0,
      uvIndex: 1,
    });
    expect(conditionFor(0)).toBe('clear');
    expect(conditionFor(45)).toBe('fog');
    expect(conditionFor(53)).toBe('drizzle');
    expect(conditionFor(63)).toBe('rain');
    expect(conditionFor(81)).toBe('rain');
    expect(conditionFor(96)).toBe('thunderstorm');
    expect(conditionFor(3)).toBe('cloudy');
  });

  it('builds a day’s AQI from that day’s hours, and keeps a day with weather but no air forecast, without an AQI', () => {
    const data = todayDataFromApi(pin, fixture());
    expect(data.daily.length).toBe(7);
    expect(data.daily[0]?.date).toBe('2026-10-09T18:30:00.000Z');
    expect(data.daily[1]?.sky?.condition).toBe('rain');
    const withAir = data.daily.filter((d) => d.aqi !== undefined);
    expect(withAir.length).toBeGreaterThanOrEqual(4);
    for (const day of withAir) expect(day.aqi).toBeGreaterThan(0);
    // The week's far end has weather but no air forecast: it is there, with no AQI, and is never guessed.
    const far = data.daily.find((d) => d.date.startsWith('2026-10-15'));
    expect(far).toBeDefined();
    expect(far?.aqi).toBeUndefined();
    expect(far?.sky?.hiC).toBe(33);
  });

  it('gives the gases the model had and leaves out the one it did not', () => {
    const data = todayDataFromApi(pin, fixture());
    expect(data.pollutants).toEqual({ pm25: 60, pm10: 150, o3: 40, so2: 12, co: 900 });
    expect(data.pollutants.no2).toBeUndefined();
  });

  it('still gives the air when the weather model is down, with no weather rather than a made-up one', () => {
    const data = todayDataFromApi(pin, fixture({ weather: false }));
    expect(data.weather).toBeUndefined();
    expect(data.hourly.every((h) => h.weather === undefined)).toBe(true);
    expect(data.sun).toBeUndefined();
    expect(data.daily.length).toBeGreaterThan(0);
    expect(data.daily.every((d) => d.sky === undefined)).toBe(true);
    expect(data.aqi).toBe(154);
  });

  it('keeps the past two days of observed hours for the history, oldest first, none from the future', () => {
    const data = todayDataFromApi(pin, fixture());
    expect(data.history.length).toBeLessThanOrEqual(48);
    const times = data.history.map((h) => Date.parse(h.at));
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    for (const t of times) expect(t + HOUR).toBeLessThanOrEqual(Date.parse(AS_OF));
  });

  it('refuses to invent a reading: with no hour with a number, it says there is no air data', () => {
    expect(() => todayDataFromApi(pin, fixture({ pm25: () => null }))).toThrow(NoAirError);
    expect(() => todayDataFromApi(pin, fixture({ pm25: () => null }))).toThrow(
      /no air data for Home/u,
    );
  });
});
