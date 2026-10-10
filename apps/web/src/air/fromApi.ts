import { usAqi } from '@vayu/core';
import type { Today, WeatherDay, WeatherHour } from '@vayu/contracts';
import type { Pin } from '../data/pins';
import type {
  Condition,
  DailyPoint,
  HourlyPoint,
  Provenance,
  TodayData,
  Weather,
} from '../today/types';
import { isoDate } from '../today/time';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** WMO weather codes, as Open-Meteo gives them, in the sky words the app draws. */
export function conditionFor(code: number): Condition {
  if (code === 0 || code === 1) return 'clear';
  if (code === 2) return 'partly-cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 86)) return 'rain';
  if (code >= 95) return 'thunderstorm';
  return 'cloudy';
}

const weatherOf = (hour: WeatherHour): Weather => ({
  condition: conditionFor(hour.code),
  isDay: hour.isDay,
  tempC: Math.round(hour.tempC),
  humidityPct: Math.round(hour.rhPct),
  windKmh: Math.round(hour.windKmh),
  windFromDeg: Math.round(hour.windFromDeg) % 360,
  rainChancePct: Math.round(hour.rainPct),
  rainMm: hour.rainMm,
  uvIndex: Math.round(hour.uv),
});

const aqiOf = (pm25: number): number => usAqi(pm25)?.value ?? 0;

/** Thrown when there is nothing to show for a place: no monitor and no model hour. A message a person can read. */
export class NoAirError extends Error {}

/**
 * The API's `/v1/today` as the app's `TodayData`. Everything here is a reshaping: the air numbers are the API's,
 * the AQI is worked out from PM2.5 with the shared EPA table, and anything the API did not have (a weather hour,
 * a gas) is left out and never filled in. A day with fewer than twelve hours of air has no AQI and is left off.
 */
export function todayDataFromApi(pin: Pin, today: Today): TodayData {
  const asOfMs = Date.parse(today.asOf);
  const measured = today.hours.filter((h): h is typeof h & { pm25: number } => h.pm25 !== null);

  // The reading now: the newest observed hour, or, with no monitor, the model's hour in progress.
  const observed = measured.filter((h) => h.kind === 'observed');
  const latest =
    observed.at(-1) ??
    measured.find((h) => Date.parse(h.t) <= asOfMs && asOfMs < Date.parse(h.t) + HOUR_MS);
  if (latest === undefined)
    throw new NoAirError(
      `There is no air data for ${pin.name} yet: no monitor near it has reported, and the regional model has nothing for this hour.`,
    );
  const pm25 = latest.pm25;
  const aqi = aqiOf(pm25);

  const weatherByHour = new Map((today.weather?.hours ?? []).map((w) => [Date.parse(w.t), w]));
  const weatherAt = (ms: number): Weather | undefined => {
    const exact = weatherByHour.get(ms);
    if (exact !== undefined) return weatherOf(exact);
    const containing = (today.weather?.hours ?? []).find(
      (w) => Date.parse(w.t) <= ms && ms < Date.parse(w.t) + HOUR_MS,
    );
    return containing === undefined ? undefined : weatherOf(containing);
  };

  const nowWeather = weatherAt(asOfMs);
  const hourly: HourlyPoint[] = [
    { at: today.asOf, aqi, pm25, ...(nowWeather === undefined ? {} : { weather: nowWeather }) },
    ...measured
      .filter((h) => Date.parse(h.t) >= asOfMs && h.kind !== 'observed')
      .slice(0, 47)
      .map((h): HourlyPoint => {
        const weather = weatherAt(Date.parse(h.t));
        return {
          at: h.t,
          aqi: aqiOf(h.pm25),
          pm25: h.pm25,
          ...(weather === undefined ? {} : { weather }),
        };
      }),
  ];

  const history = observed
    .filter((h) => Date.parse(h.t) + HOUR_MS <= asOfMs)
    .slice(-48)
    .map((h) => ({ at: h.t, aqi: aqiOf(h.pm25), pm25: h.pm25 }));

  // One AQI per India calendar day, from that day's hours, observed and forecast together.
  const byDate = new Map<string, number[]>();
  for (const h of measured) byDate.set(isoDate(h.t), [...(byDate.get(isoDate(h.t)) ?? []), h.pm25]);
  const dayAqi = (dateIso: string): number | undefined => {
    const values = byDate.get(isoDate(dateIso));
    if (values === undefined || values.length < 12) return undefined;
    return aqiOf(values.reduce((a, b) => a + b, 0) / values.length);
  };
  const skyOf = (day: WeatherDay): NonNullable<DailyPoint['sky']> => ({
    hiC: Math.round(day.tMaxC),
    loC: Math.round(day.tMinC),
    windKmh: Math.round(day.windKmh),
    windFromDeg: Math.round(day.windFromDeg) % 360,
    humidityPct: Math.round(day.rhPct),
    rainChancePct: Math.round(day.rainPct),
    condition: conditionFor(day.code),
  });
  const daily: DailyPoint[] = (today.weather?.days ?? []).flatMap((day): DailyPoint[] => {
    const aqiForDay = dayAqi(day.date);
    return aqiForDay === undefined ? [] : [{ date: day.date, aqi: aqiForDay, sky: skyOf(day) }];
  });
  if (today.weather === undefined) {
    // No weather: still give the days we have air for, from today on.
    const startMs = Date.parse(`${isoDate(today.asOf)}T00:00:00+05:30`);
    for (let i = 0; i < 7; i++) {
      const date = new Date(startMs + i * DAY_MS).toISOString();
      const value = dayAqi(date);
      if (value !== undefined) daily.push({ date, aqi: value });
    }
  }

  const todayDay = today.weather?.days.find(
    (d) => Date.parse(d.date) <= asOfMs && asOfMs < Date.parse(d.date) + DAY_MS,
  );
  const g = today.gases;
  const provenance: Provenance =
    today.prov.label === 'Nearby station'
      ? {
          mode: 'live',
          label: 'Nearby station',
          ...(today.prov.stationName === undefined ? {} : { stationName: today.prov.stationName }),
          ...(today.prov.distanceKm === undefined ? {} : { distanceKm: today.prov.distanceKm }),
          ageMinutes: today.prov.ageMinutes,
        }
      : { mode: 'model', label: 'Estimate', ageMinutes: 0 };

  return {
    id: pin.id,
    place: { name: pin.name, region: pin.detail ?? '' },
    asOf: today.asOf,
    aqi,
    pm25,
    ...(nowWeather === undefined ? {} : { weather: nowWeather }),
    pollutants: {
      pm25,
      ...(typeof g?.pm10 === 'number' ? { pm10: g.pm10 } : {}),
      ...(typeof g?.o3 === 'number' ? { o3: g.o3 } : {}),
      ...(typeof g?.no2 === 'number' ? { no2: g.no2 } : {}),
      ...(typeof g?.so2 === 'number' ? { so2: g.so2 } : {}),
      ...(typeof g?.co === 'number' ? { co: g.co } : {}),
    },
    hourly,
    daily,
    history,
    ...(todayDay === undefined
      ? {}
      : { sun: { sunrise: todayDay.sunrise, sunset: todayDay.sunset } }),
    provenance,
  };
}
