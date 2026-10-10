import { WeatherNow } from '@vayu/contracts';
import { z } from 'zod';
import type { Point } from './station';

const HOUR_MS = 3_600_000;

/** The weather model's value for the hour containing `asOf`, or undefined when it has none. */
export interface WeatherRepo {
  nowAt(point: Point, asOf: string): Promise<WeatherNow | undefined>;
}

const Response = z.object({
  hourly: z.object({
    time: z.array(z.string()),
    temperature_2m: z.array(z.number().nullable()),
    relative_humidity_2m: z.array(z.number().nullable()),
    wind_speed_10m: z.array(z.number().nullable()),
    wind_direction_10m: z.array(z.number().nullable()),
  }),
});

export interface OpenMeteoWeatherOptions {
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
}

/**
 * Open-Meteo's weather forecast (no key). Wind, humidity and temperature explain a lot about why
 * the air is bad: still air and a cold morning trap smoke, and damp air makes low-cost sensors read
 * high. This is a model for the area, not a measurement at the place.
 */
export function openMeteoWeatherRepo(options: OpenMeteoWeatherOptions = {}): WeatherRepo {
  const baseUrl = options.baseUrl ?? 'https://api.open-meteo.com/v1/forecast';
  const doFetch = options.fetchImpl ?? fetch;
  return {
    async nowAt(point, asOf) {
      const url =
        `${baseUrl}?latitude=${point.lat}&longitude=${point.lng}` +
        '&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m' +
        '&wind_speed_unit=kmh&timezone=Asia%2FKolkata&past_days=1&forecast_days=2';
      const res = await doFetch(url);
      if (!res.ok) throw new Error(`Open-Meteo weather request failed: ${res.status}`);
      const { hourly } = Response.parse(await res.json());
      const asOfMs = Date.parse(asOf);
      const index = hourly.time.findIndex((time) => {
        // Local India time with no offset; India has one fixed +05:30 and no DST.
        const start = Date.parse(`${time}:00+05:30`);
        return start <= asOfMs && asOfMs < start + HOUR_MS;
      });
      if (index < 0) return undefined;
      const wind = hourly.wind_speed_10m[index];
      const from = hourly.wind_direction_10m[index];
      const rh = hourly.relative_humidity_2m[index];
      const temp = hourly.temperature_2m[index];
      if (
        typeof wind !== 'number' ||
        typeof from !== 'number' ||
        typeof rh !== 'number' ||
        typeof temp !== 'number'
      ) {
        return undefined;
      }
      return WeatherNow.parse({
        at: new Date(Date.parse(`${hourly.time[index] ?? ''}:00+05:30`)).toISOString(),
        windKmh: wind,
        windFromDeg: from,
        rhPct: rh,
        tempC: temp,
      });
    },
  };
}

/** Remembers each answer per 1 km cell and hour, so many requests make one call. Failures are not kept. */
export function cachedWeatherRepo(
  inner: WeatherRepo,
  ttlMs: number,
  nowMs: () => number = Date.now,
): WeatherRepo {
  const cache = new Map<
    string,
    { readonly at: number; readonly value: Promise<WeatherNow | undefined> }
  >();
  return {
    nowAt(point, asOf) {
      const key = `${point.lat.toFixed(2)},${point.lng.toFixed(2)}@${Math.floor(Date.parse(asOf) / HOUR_MS)}`;
      const hit = cache.get(key);
      if (hit !== undefined && nowMs() - hit.at < ttlMs) return hit.value;
      const value = inner.nowAt(point, asOf);
      cache.set(key, { at: nowMs(), value });
      value.catch(() => {
        cache.delete(key);
      });
      return value;
    },
  };
}

/** A fixed value for tests and the sample app. */
export function fixtureWeatherRepo(): WeatherRepo {
  return {
    nowAt: (_point, asOf) =>
      Promise.resolve({
        at: new Date(Math.floor(Date.parse(asOf) / HOUR_MS) * HOUR_MS).toISOString(),
        windKmh: 6,
        windFromDeg: 310,
        rhPct: 45,
        tempC: 28,
      }),
  };
}
