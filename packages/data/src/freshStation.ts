import type { RawHour } from '@vayu/contracts';
import { haversineKm, type NearestStation, type Point, type Station } from './station';
import type { StationRepo } from './repos';

const HOUR_MS = 3_600_000;

export interface FreshStationOptions {
  /** A station whose newest PM2.5 hour ended longer ago than this is skipped. */
  readonly maxAgeHours: number;
  /** The most nearest PM2.5 stations to look at before giving up. */
  readonly candidates: number;
  /** How many are fetched at once. Batches run one after another and stop at the first fresh one,
   * so a quiet neighbourhood does not spend the provider's rate limit on every station. */
  readonly batchSize: number;
}

export const DEFAULT_FRESH_OPTIONS: FreshStationOptions = {
  maxAgeHours: 6,
  candidates: 30,
  batchSize: 6,
};

export interface FreshStation {
  readonly nearest: NearestStation;
  readonly observed: readonly RawHour[];
}

/** Hours since the newest non-null PM2.5 hour ended, or undefined if there is none. */
export function newestAgeHours(observed: readonly RawHour[], asOf: string): number | undefined {
  const ends = observed
    .filter((hour) => hour.pm25 !== null)
    .map((hour) => new Date(hour.hourStart).getTime() + HOUR_MS);
  if (ends.length === 0) return undefined;
  return (new Date(asOf).getTime() - Math.max(...ends)) / HOUR_MS;
}

/**
 * The nearest station that has a recent reading. Public monitors go quiet for days (a feed outage,
 * or a sensor that stopped years ago), and "nearby station" must mean recent data. Returns
 * undefined when none qualify, so the caller falls back to the model estimate instead of showing
 * stale numbers as current.
 */
export async function nearestFreshStation(
  repo: StationRepo,
  point: Point,
  asOf: string,
  options: FreshStationOptions = DEFAULT_FRESH_OPTIONS,
): Promise<FreshStation | undefined> {
  let stations: readonly Station[];
  try {
    stations = await repo.stationsNear(point, asOf);
  } catch {
    return undefined; // provider down: the caller falls back to the labelled model estimate
  }
  const ranked = stations
    .filter((station) => station.hasPm25)
    .map((station) => ({ station, distanceKm: haversineKm(point, station) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, options.candidates);

  for (let start = 0; start < ranked.length; start += options.batchSize) {
    const fetched = await Promise.all(
      ranked.slice(start, start + options.batchSize).map(async (nearest) => {
        try {
          return { nearest, observed: await repo.hourlyFor(nearest.station.id, asOf) };
        } catch {
          return { nearest, observed: [] as readonly RawHour[] }; // one failing station must not hide the rest
        }
      }),
    );
    const fresh = fetched.find((candidate) => {
      const age = newestAgeHours(candidate.observed, asOf);
      return age !== undefined && age <= options.maxAgeHours;
    });
    if (fresh !== undefined) return fresh;
  }
  return undefined;
}

/** Remembers each answer for `ttlMs`, so repeated requests do not spend the provider's rate limit. */
export function cachedStationRepo(
  inner: StationRepo,
  ttlMs: number,
  nowMs: () => number = Date.now,
): StationRepo {
  const cache = new Map<string, { readonly at: number; readonly value: Promise<unknown> }>();
  const remember = <T>(key: string, load: () => Promise<T>): Promise<T> => {
    const hit = cache.get(key);
    if (hit !== undefined && nowMs() - hit.at < ttlMs) return hit.value as Promise<T>;
    const value = load();
    cache.set(key, { at: nowMs(), value });
    value.catch(() => {
      cache.delete(key); // never cache a failure
    });
    return value;
  };
  return {
    stationsNear: (point, asOf) =>
      remember(`near:${point.lat.toFixed(3)},${point.lng.toFixed(3)}`, () =>
        inner.stationsNear(point, asOf),
      ),
    hourlyFor: (stationId, asOf, days) =>
      remember(`hours:${stationId}:${String(days ?? 7)}`, () =>
        inner.hourlyFor(stationId, asOf, days),
      ),
  };
}
