import type { MapStation, Today, WeatherDay, WeatherHour } from '@vayu/contracts';
import { NoAirError, todayDataFromApi } from '../air/fromApi';
import type { AirSource, HourPm } from '../air/types';
import type { Pin } from '../data/pins';
import { distanceKm } from '../exposure/geo';
import type { Recorded, RecordedDay, RecordedStation } from './types';

const HOUR_MS = 3_600_000;

/** A monitor farther than this from a place is not that place's monitor. */
export const MAX_KM = 40;
/** A monitor whose newest hour is older than this has stopped reporting. */
const STALE_HOURS = 6;
/** How far ahead of the demo moment the recorded hours are shown, as the forecast: five days, as the model gives. */
const AHEAD_HOURS = 120;

/** The chance of rain the app shows for an hour in which this much rain really fell. */
export function rainChanceFor(mm: number): number {
  if (mm >= 2) return 90;
  if (mm >= 0.5) return 65;
  if (mm >= 0.1) return 40;
  return 5;
}

/** The same for a whole day's rain. */
export function dayRainChanceFor(mm: number): number {
  if (mm >= 10) return 95;
  if (mm >= 2.5) return 85;
  if (mm >= 0.5) return 65;
  if (mm > 0) return 40;
  return 5;
}

const r1 = (x: number): number => Math.round(x * 10) / 10;
/** Whether a recorded hour has a value. */
const has = (value: number | null | undefined): value is number =>
  value !== null && value !== undefined;
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
const iso = (ms: number): string => new Date(ms).toISOString();
const dateOf = (ms: number): string => iso(ms + 5.5 * HOUR_MS).slice(0, 10);

/** What a recorded day can say about the air at a place: its monitor, and which hour is now. */
interface Basis {
  readonly station: RecordedStation;
  readonly km: number;
  readonly pm25: readonly (number | null)[];
  readonly pm10: readonly (number | null)[];
  /** The newest finished hour with a reading, as an index into the series. */
  readonly last: number;
}

/**
 * The recorded day as the app's own air source: the same shapes our API answers with, built from what four Delhi
 * monitors measured on that day and the weather and fires recorded for it. Nothing is made up: an hour with no reading
 * has none, and a place with no monitor within reach has no air. The hours after the demo moment are what was recorded
 * next, shown as the forecast would be.
 */
export function recordedSource(recorded: Recorded, day: RecordedDay): AirSource {
  const fromMs = Date.parse(`${day.seriesFrom}T00:00:00+05:30`);
  const asOfMs = Date.parse(day.asOf);
  /** The hour in progress at the demo moment, as an index into every series. */
  const now = Math.floor((asOfMs - fromMs) / HOUR_MS);
  const at = (i: number): number => fromMs + i * HOUR_MS;

  const basisFor = (pin: Pin): Basis | undefined => {
    let best: Basis | undefined;
    for (const station of recorded.stations) {
      const series = day.air[station.id];
      if (series === undefined) continue;
      const km = distanceKm(pin, station);
      if (km > MAX_KM || (best !== undefined && km >= best.km)) continue;
      let last = -1;
      for (let i = now - 1; i >= Math.max(0, now - STALE_HOURS); i--) {
        if (series.pm25[i] !== null && series.pm25[i] !== undefined) {
          last = i;
          break;
        }
      }
      if (last >= 0) best = { station, km, pm25: series.pm25, pm10: series.pm10, last };
    }
    return best;
  };

  const weatherHours = (): readonly WeatherHour[] => {
    const out: WeatherHour[] = [];
    const w = day.weather;
    for (let i = Math.max(0, now - 24); i < Math.min(day.hours, now + AHEAD_HOURS); i++) {
      const temp = w.temperatureC[i];
      const wind = w.windKmh[i];
      const code = w.code[i];
      if (!has(temp) || !has(wind) || !has(code)) continue;
      const mm = w.precipitationMm[i] ?? 0;
      out.push({
        t: iso(at(i)),
        tempC: temp,
        rhPct: w.humidityPct[i] ?? 50,
        windKmh: wind,
        windFromDeg: w.windFromDeg[i] ?? 0,
        rainPct: rainChanceFor(mm),
        rainMm: mm,
        code,
        isDay: (w.isDay[i] ?? 1) === 1,
        uv: 0,
      });
    }
    return out;
  };

  const weatherDays = (): readonly WeatherDay[] => {
    const w = day.weather;
    const out: WeatherDay[] = [];
    const firstDay = Math.floor(now / 24);
    for (let d = firstDay; d * 24 < day.hours && d < firstDay + 5; d++) {
      const range = Array.from({ length: 24 }, (_, k) => d * 24 + k).filter((i) => i < day.hours);
      const pick = (series: readonly (number | null)[]): number[] =>
        range.flatMap((i) => {
          const v = series[i];
          return has(v) ? [v] : [];
        });
      const temps = pick(w.temperatureC);
      const winds = pick(w.windKmh);
      if (temps.length === 0 || winds.length === 0) continue;
      const rain = sum(pick(w.precipitationMm));
      // The sky of the day: the hour it rained hardest, or else the commonest sky in daylight.
      const wettest = range.reduce(
        (best, i) => ((w.precipitationMm[i] ?? 0) > (w.precipitationMm[best] ?? 0) ? i : best),
        range[0] ?? d * 24,
      );
      const daylight = range.filter((i) => i % 24 >= 6 && i % 24 < 18).map((i) => w.code[i] ?? 0);
      const counts = new Map<number, number>();
      for (const c of daylight) counts.set(c, (counts.get(c) ?? 0) + 1);
      const common = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
      const code = rain >= 0.5 ? (w.code[wettest] ?? common) : common;
      const midnight = at(d * 24);
      const rises = w.sunrise[d];
      const sets = w.sunset[d];
      out.push({
        date: iso(midnight),
        tMaxC: Math.max(...temps),
        tMinC: Math.min(...temps),
        windKmh: Math.max(...winds),
        windFromDeg: w.windFromDeg[range[12] ?? range[0] ?? 0] ?? 0,
        rhPct: sum(pick(w.humidityPct)) / Math.max(1, pick(w.humidityPct).length),
        rainPct: dayRainChanceFor(rain),
        code,
        sunrise: iso(Date.parse(`${rises ?? `${dateOf(midnight)}T06:30`}:00+05:30`)),
        sunset: iso(Date.parse(`${sets ?? `${dateOf(midnight)}T18:00`}:00+05:30`)),
      });
    }
    return out;
  };

  const todayFor = (pin: Pin): Today | undefined => {
    const basis = basisFor(pin);
    if (basis === undefined) return undefined;
    const list: Today['hours'][number][] = [];
    for (let i = 0; i < Math.min(day.hours, now + AHEAD_HOURS); i++) {
      const pm25 = basis.pm25[i];
      if (pm25 === null || pm25 === undefined) continue;
      list.push({ t: iso(at(i)), pm25, kind: i < now ? 'observed' : 'forecast' });
    }
    const model = (series: readonly (number | null)[]): number | null =>
      series[now] === undefined ? null : series[now];
    const pm10 = basis.pm10[basis.last];
    const observedEnd = at(basis.last + 1);
    return {
      schemaVersion: 1,
      place: { id: pin.id, name: pin.name, kind: 'other', lat: pin.lat, lng: pin.lng },
      asOf: day.asOf,
      mode: 'replay',
      hours: list,
      weather: { hours: [...weatherHours()], days: [...weatherDays()] },
      gases: {
        at: iso(at(now)),
        pm10: pm10 ?? null,
        o3: model(day.gases.o3),
        no2: model(day.gases.no2),
        so2: model(day.gases.so2),
        co: model(day.gases.co),
      },
      windows: [],
      headline: '',
      prov: {
        mode: 'replay',
        label: 'Nearby station',
        source: 'station',
        stationId: basis.station.id,
        stationName: basis.station.name,
        distanceKm: r1(basis.km),
        observedAt: iso(observedEnd),
        fetchedAt: day.asOf,
        asOf: day.asOf,
        ageMinutes: Math.max(0, Math.round((asOfMs - observedEnd) / 60_000)),
      },
    };
  };

  const noAir = (pin: Pin): NoAirError =>
    new NoAirError(
      `This recorded day has no monitor reporting within ${String(MAX_KM)} km of ${pin.name}. The recording holds four monitors in Delhi.`,
    );

  const todays = new Map<string, ReturnType<typeof todayDataFromApi> | undefined>();
  const todayData = (pin: Pin): ReturnType<typeof todayDataFromApi> | undefined => {
    if (!todays.has(pin.id)) {
      const raw = todayFor(pin);
      todays.set(pin.id, raw === undefined ? undefined : todayDataFromApi(pin, raw));
    }
    return todays.get(pin.id);
  };

  const historyOf = (pin: Pin): readonly HourPm[] | undefined => {
    const basis = basisFor(pin);
    if (basis === undefined) return undefined;
    const out: HourPm[] = [];
    for (let i = 0; i < now; i++) {
      const pm25 = basis.pm25[i];
      out.push({ t: iso(at(i)), pm25: pm25 ?? null });
    }
    return out;
  };

  const stationsNow = (): readonly MapStation[] =>
    recorded.stations.flatMap((station): MapStation[] => {
      const series = day.air[station.id];
      if (series === undefined) return [];
      for (let i = now - 1; i >= Math.max(0, now - STALE_HOURS); i--) {
        const pm25 = series.pm25[i];
        if (pm25 !== null && pm25 !== undefined) return [{ ...station, pm25, at: iso(at(i + 1)) }];
      }
      return [];
    });

  return {
    kind: 'live',
    peekToday: (pin) => todayData(pin),
    peekHistory: (pin) => historyOf(pin),
    peekStations: () => stationsNow(),
    today(pin) {
      const data = todayData(pin);
      return data === undefined ? Promise.reject(noAir(pin)) : Promise.resolve(data);
    },
    history(pin) {
      const hours = historyOf(pin);
      return hours === undefined ? Promise.reject(noAir(pin)) : Promise.resolve(hours);
    },
    stations: () => Promise.resolve(stationsNow()),
  };
}
