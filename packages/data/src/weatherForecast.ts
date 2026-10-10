import { Gases, WeatherDay, WeatherHour } from '@vayu/contracts';
import { z } from 'zod';
import type { Point } from './station';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** The weather for the next two days by hour and the next week by day. A model for the area, never a measurement. */
export interface WeatherForecast {
  readonly hours: readonly WeatherHour[];
  readonly days: readonly WeatherDay[];
}

export interface WeatherForecastRepo {
  forecastAt(point: Point, asOf: string): Promise<WeatherForecast>;
}

export interface GasRepo {
  /** The regional model's gases for the hour containing `asOf`, or undefined when it has none. */
  gasesAt(point: Point, asOf: string): Promise<Gases | undefined>;
}

const num = z.number().nullable();
const Forecast = z.object({
  hourly: z.object({
    time: z.array(z.string()),
    temperature_2m: z.array(num),
    relative_humidity_2m: z.array(num),
    precipitation_probability: z.array(num),
    precipitation: z.array(num),
    weather_code: z.array(num),
    wind_speed_10m: z.array(num),
    wind_direction_10m: z.array(num),
    is_day: z.array(num),
    uv_index: z.array(num),
  }),
  daily: z.object({
    time: z.array(z.string()),
    weather_code: z.array(num),
    temperature_2m_max: z.array(num),
    temperature_2m_min: z.array(num),
    precipitation_probability_max: z.array(num),
    wind_speed_10m_max: z.array(num),
    wind_direction_10m_dominant: z.array(num),
    sunrise: z.array(z.string()),
    sunset: z.array(z.string()),
  }),
});

/** Open-Meteo writes India time with no offset ("2026-10-10T17:00"); India is a fixed +05:30. */
const istToIso = (local: string): string =>
  new Date(`${local.length === 10 ? `${local}T00:00` : local}:00+05:30`).toISOString();

const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;

export interface OpenMeteoWeatherForecastOptions {
  readonly baseUrl?: string;
  readonly hoursAhead?: number;
  readonly fetchImpl?: typeof fetch;
}

/**
 * Open-Meteo's weather forecast (no key): temperature, humidity, rain chance, wind, UV and the sky for each
 * hour, and the day's range, wind, rain chance, sunrise and sunset. A value Open-Meteo leaves out is a hole in
 * that hour, never a zero: an hour missing a field is dropped, so the app cannot show a made-up reading.
 */
export function openMeteoWeatherForecastRepo(
  options: OpenMeteoWeatherForecastOptions = {},
): WeatherForecastRepo {
  const baseUrl = options.baseUrl ?? 'https://api.open-meteo.com/v1/forecast';
  const doFetch = options.fetchImpl ?? fetch;
  const hoursAhead = options.hoursAhead ?? 48;
  return {
    async forecastAt(point, asOf) {
      const url =
        `${baseUrl}?latitude=${point.lat}&longitude=${point.lng}` +
        '&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_direction_10m,is_day,uv_index' +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant,sunrise,sunset' +
        '&wind_speed_unit=kmh&timezone=Asia%2FKolkata&forecast_days=7';
      const res = await doFetch(url);
      if (!res.ok) throw new Error(`Open-Meteo weather request failed: ${String(res.status)}`);
      const { hourly, daily } = Forecast.parse(await res.json());
      const asOfMs = Date.parse(asOf);

      const hours: WeatherHour[] = [];
      hourly.time.forEach((time, i) => {
        const start = Date.parse(istToIso(time));
        if (start + HOUR_MS <= asOfMs || start > asOfMs + hoursAhead * HOUR_MS) return;
        const temp = hourly.temperature_2m[i];
        const rh = hourly.relative_humidity_2m[i];
        const wind = hourly.wind_speed_10m[i];
        const from = hourly.wind_direction_10m[i];
        const code = hourly.weather_code[i];
        const day = hourly.is_day[i];
        if (
          typeof temp !== 'number' ||
          typeof rh !== 'number' ||
          typeof wind !== 'number' ||
          typeof from !== 'number' ||
          typeof code !== 'number' ||
          typeof day !== 'number'
        )
          return;
        hours.push(
          WeatherHour.parse({
            t: new Date(start).toISOString(),
            tempC: temp,
            rhPct: rh,
            windKmh: wind,
            windFromDeg: from,
            rainPct: hourly.precipitation_probability[i] ?? 0,
            rainMm: hourly.precipitation[i] ?? 0,
            code,
            isDay: day === 1,
            uv: hourly.uv_index[i] ?? 0,
          }),
        );
      });

      const days: WeatherDay[] = [];
      daily.time.forEach((date, i) => {
        const startMs = Date.parse(istToIso(date));
        if (startMs + DAY_MS <= asOfMs) return;
        const tMax = daily.temperature_2m_max[i];
        const tMin = daily.temperature_2m_min[i];
        const code = daily.weather_code[i];
        const sunrise = daily.sunrise[i];
        const sunset = daily.sunset[i];
        if (
          typeof tMax !== 'number' ||
          typeof tMin !== 'number' ||
          typeof code !== 'number' ||
          sunrise === undefined ||
          sunset === undefined
        )
          return;
        const humidity = hourly.time.flatMap((time, h) => {
          const at = Date.parse(istToIso(time));
          const value = hourly.relative_humidity_2m[h];
          return at >= startMs && at < startMs + DAY_MS && typeof value === 'number' ? [value] : [];
        });
        days.push(
          WeatherDay.parse({
            date: new Date(startMs).toISOString(),
            tMaxC: tMax,
            tMinC: tMin,
            windKmh: daily.wind_speed_10m_max[i] ?? 0,
            windFromDeg: daily.wind_direction_10m_dominant[i] ?? 0,
            rhPct: Math.round(mean(humidity)),
            rainPct: daily.precipitation_probability_max[i] ?? 0,
            code,
            sunrise: istToIso(sunrise),
            sunset: istToIso(sunset),
          }),
        );
      });
      return { hours, days };
    },
  };
}

const Air = z.object({
  hourly: z.object({
    time: z.array(z.string()),
    pm10: z.array(num),
    ozone: z.array(num),
    nitrogen_dioxide: z.array(num),
    sulphur_dioxide: z.array(num),
    carbon_monoxide: z.array(num),
  }),
});

/** Open-Meteo's air-quality model (CAMS) for the gases. A regional model on a coarse grid, so labelled a model. */
export function openMeteoGasRepo(
  options: { readonly baseUrl?: string; readonly fetchImpl?: typeof fetch } = {},
): GasRepo {
  const baseUrl = options.baseUrl ?? 'https://air-quality-api.open-meteo.com/v1/air-quality';
  const doFetch = options.fetchImpl ?? fetch;
  return {
    async gasesAt(point, asOf) {
      const url =
        `${baseUrl}?latitude=${point.lat}&longitude=${point.lng}` +
        '&hourly=pm10,ozone,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide' +
        '&timezone=Asia%2FKolkata&past_days=1&forecast_days=2';
      const res = await doFetch(url);
      if (!res.ok) throw new Error(`Open-Meteo air request failed: ${String(res.status)}`);
      const { hourly } = Air.parse(await res.json());
      const asOfMs = Date.parse(asOf);
      const i = hourly.time.findIndex((time) => {
        const start = Date.parse(istToIso(time));
        return start <= asOfMs && asOfMs < start + HOUR_MS;
      });
      if (i < 0) return undefined;
      const at = hourly.time[i];
      if (at === undefined) return undefined;
      return Gases.parse({
        at: istToIso(at),
        pm10: hourly.pm10[i] ?? null,
        o3: hourly.ozone[i] ?? null,
        no2: hourly.nitrogen_dioxide[i] ?? null,
        so2: hourly.sulphur_dioxide[i] ?? null,
        co: hourly.carbon_monoxide[i] ?? null,
      });
    },
  };
}
