import { RawHour } from '@vayu/contracts';
import type { ForecastRepo } from './repos';
import type { Point } from './station';

/**
 * Open-Meteo's air-quality forecast (build spec §6.3, §7.1): a regional model on roughly a 45 km
 * grid, so every Delhi place gets nearly the same forecast — the "full" tier; `fixtureForecastRepo`
 * is what razor code actually depends on. Parameter and response shapes (`hourly.time`,
 * `hourly.pm2_5`, `hourly.pm10`, `timezone`, `past_days`, `forecast_days`) are named directly in
 * the build spec and match Open-Meteo's long-stable public API.
 */
export interface OpenMeteoClientOptions {
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
}

interface OpenMeteoResponse {
  readonly hourly: {
    readonly time: readonly string[];
    readonly pm2_5: readonly (number | null)[];
    readonly pm10: readonly (number | null)[];
  };
}

export function openMeteoForecastRepo(options: OpenMeteoClientOptions = {}): ForecastRepo {
  const baseUrl = options.baseUrl ?? 'https://air-quality-api.open-meteo.com/v1/air-quality';
  const doFetch = options.fetchImpl ?? fetch;

  return {
    async forecastFor(point: Point, asOf: string): Promise<readonly RawHour[]> {
      const url =
        `${baseUrl}?latitude=${point.lat}&longitude=${point.lng}` +
        `&hourly=pm2_5,pm10&timezone=Asia%2FKolkata&past_days=1&forecast_days=7`;
      const res = await doFetch(url);
      if (!res.ok) {
        throw new Error(`Open-Meteo request failed: ${res.status} ${res.statusText}`);
      }
      const body = (await res.json()) as OpenMeteoResponse;
      const asOfMs = new Date(asOf).getTime();

      // `timezone=Asia/Kolkata` makes Open-Meteo return local wall-clock strings with no UTC
      // suffix (e.g. "2026-10-05T00:00"). India has one fixed +05:30 offset, no DST, so appending
      // it explicitly converts correctly regardless of the *running machine's* own timezone --
      // relying on the environment's local TZ here would be a silent, machine-dependent bug.
      const toUtcIso = (localNaive: string): string =>
        new Date(`${localNaive}:00+05:30`).toISOString();

      return (
        body.hourly.time
          .map((hourStart, index) =>
            RawHour.parse({
              hourStart: toUtcIso(hourStart),
              pm25: body.hourly.pm2_5[index] ?? null,
              pm10: body.hourly.pm10[index] ?? null,
            }),
          )
          // The hour in progress counts: it has not finished, and without it there is no figure for "now".
          .filter((hour) => new Date(hour.hourStart).getTime() + 3_600_000 > asOfMs)
      );
    },
  };
}

/** What the regional air-quality model said for the days just gone. A model on a coarse grid, never a station. */
export interface ModelHistoryRepo {
  /** Hours that had ended by `asOf`, going back `days` (at most 14). */
  historyFor(point: Point, asOf: string, days: number): Promise<readonly RawHour[]>;
}

export function openMeteoHistoryRepo(options: OpenMeteoClientOptions = {}): ModelHistoryRepo {
  const baseUrl = options.baseUrl ?? 'https://air-quality-api.open-meteo.com/v1/air-quality';
  const doFetch = options.fetchImpl ?? fetch;
  return {
    async historyFor(point, asOf, days) {
      const span = Math.min(14, Math.max(1, Math.round(days)));
      const url =
        `${baseUrl}?latitude=${point.lat}&longitude=${point.lng}` +
        `&hourly=pm2_5,pm10&timezone=Asia%2FKolkata&past_days=${String(span)}&forecast_days=1`;
      const res = await doFetch(url);
      if (!res.ok) throw new Error(`Open-Meteo request failed: ${String(res.status)}`);
      const body = (await res.json()) as OpenMeteoResponse;
      const asOfMs = new Date(asOf).getTime();
      const fromMs = asOfMs - span * 24 * 3_600_000;
      return (
        body.hourly.time
          .map((hourStart, index) =>
            RawHour.parse({
              hourStart: new Date(`${hourStart}:00+05:30`).toISOString(),
              pm25: body.hourly.pm2_5[index] ?? null,
              pm10: body.hourly.pm10[index] ?? null,
            }),
          )
          // Rule I1: only hours that had ended by now, and only the span asked for.
          .filter((hour) => {
            const start = new Date(hour.hourStart).getTime();
            return start + 3_600_000 <= asOfMs && start >= fromMs;
          })
      );
    },
  };
}
