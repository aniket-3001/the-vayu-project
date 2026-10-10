import { History } from '@vayu/contracts';
import { availableHours, makeProvenance } from '@vayu/core';
import { nearestFreshStation, type ModelHistoryRepo } from '@vayu/data';
import { placeFromQuery, type AirDeps } from './air';
import { failure, okCached, type ApiRequest, type ApiResponse } from './respond';

export interface HistoryDeps extends AirDeps {
  /** The regional model for the days just gone, used only when no monitor has a recent reading. */
  readonly historyRepo?: ModelHistoryRepo | undefined;
  readonly mode: 'live' | 'model';
}

const MAX_DAYS = 14;
export const HISTORY_CACHE_SECONDS = 900;

const parseDays = (raw: string | undefined): number | undefined => {
  if (raw === undefined) return MAX_DAYS;
  if (!/^\d{1,2}$/u.test(raw)) return undefined;
  const days = Number(raw);
  return days >= 1 && days <= MAX_DAYS ? days : undefined;
};

/**
 * `GET /v1/history?lat=..&lng=..&days=14`: the hourly PM2.5 at a place over the last days, in a compact form,
 * for the Exposure screen. From the nearest monitor with a recent reading; with none, from the regional model,
 * and then it says so (mode `model`, label Estimate). Only hours that had ended by now are returned (rule I1).
 */
export async function handleHistory(request: ApiRequest, deps: HistoryDeps): Promise<ApiResponse> {
  if (request.method !== 'GET')
    return failure(405, 'method_not_allowed', `${request.method} is not supported here`);
  const choice = placeFromQuery(request.query);
  if (choice.kind === 'error') return choice.response;
  const { place } = choice;
  const days = parseDays(request.query.days);
  if (days === undefined)
    return failure(
      400,
      'bad_parameter',
      `days must be a whole number from 1 to ${String(MAX_DAYS)}`,
      'days',
    );
  const asOf = deps.clock.now();

  const fresh = await nearestFreshStation(deps.stationRepo, place, asOf);
  if (fresh !== undefined) {
    const observed =
      days > 7
        ? await deps.stationRepo
            .hourlyFor(fresh.nearest.station.id, asOf, days)
            .catch(() => fresh.observed)
        : fresh.observed;
    const hours = availableHours(observed, asOf);
    const last = [...hours].reverse().find((hour) => hour.pm25 !== null);
    return okCached(
      History.parse({
        schemaVersion: 1,
        place,
        asOf,
        mode: deps.mode,
        days,
        hours: hours.map((hour) => ({ t: hour.hourStart, pm25: hour.pm25 })),
        prov: makeProvenance({
          mode: deps.mode,
          source: 'station',
          asOf,
          observedAt:
            last === undefined
              ? undefined
              : new Date(Date.parse(last.hourStart) + 3_600_000).toISOString(),
          stationId: fresh.nearest.station.id,
          stationName: fresh.nearest.station.name,
          distanceKm: fresh.nearest.distanceKm,
        }),
      }),
      HISTORY_CACHE_SECONDS,
    );
  }

  const modelled = await (
    deps.historyRepo?.historyFor(place, asOf, days) ?? Promise.resolve([])
  ).catch(() => []);
  const hours = availableHours(modelled, asOf);
  return okCached(
    History.parse({
      schemaVersion: 1,
      place,
      asOf,
      mode: 'model',
      days,
      hours: hours.map((hour) => ({ t: hour.hourStart, pm25: hour.pm25 })),
      prov: makeProvenance({ mode: 'model', source: 'model', asOf }),
    }),
    HISTORY_CACHE_SECONDS,
  );
}
