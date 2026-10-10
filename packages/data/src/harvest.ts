import { RawHour, type Place } from '@vayu/contracts';
import { availableHours } from '@vayu/core';
import { z } from 'zod';
import { cachedStationRepo, nearestFreshStation } from './freshStation';
import type { ForecastRepo, StationRepo } from './repos';

const HOUR_MS = 3_600_000;
/** How long the latest answer for a place stays in the cache table. */
const CACHE_SECONDS = 6 * 3600;

/** Where raw lines go. In AWS this is S3; in tests it is a map. */
export interface SnapshotStore {
  put(key: string, body: string): Promise<void>;
}
/** Where the latest answer per place goes. In AWS this is the Cache table. */
export interface CacheStore {
  put(key: string, value: unknown, expiresAtEpochSeconds: number): Promise<void>;
}

/** One line of `harvest/station/...`: what the nearest fresh station said for one place. */
export const StationSnapshot = z.object({
  schemaVersion: z.literal(1),
  harvestedAt: z.string(),
  placeId: z.string(),
  status: z.enum(['fresh', 'no_fresh_station']),
  station: z
    .object({
      id: z.string(),
      name: z.string(),
      lat: z.number(),
      lng: z.number(),
      distanceKm: z.number(),
    })
    .optional(),
  hours: z.array(RawHour),
});
export type StationSnapshot = z.infer<typeof StationSnapshot>;

/** One line of `harvest/forecast/...`: what the regional forecast predicted at harvest time. */
export const ForecastSnapshot = z.object({
  schemaVersion: z.literal(1),
  harvestedAt: z.string(),
  placeId: z.string(),
  status: z.enum(['ok', 'failed']),
  hours: z.array(RawHour),
});
export type ForecastSnapshot = z.infer<typeof ForecastSnapshot>;

export interface HarvestInput {
  readonly places: readonly Place[];
  readonly stationRepo: StationRepo;
  readonly forecastRepo: ForecastRepo;
  readonly snapshots: SnapshotStore;
  readonly cache: CacheStore;
  /** The harvest instant, ISO. Stations only count for hours that had ended by then (rule I1). */
  readonly now: string;
}

export interface HarvestSummary {
  readonly places: number;
  readonly withStation: number;
  readonly withoutStation: number;
  readonly forecastFailures: number;
  readonly keys: readonly string[];
}

/** `harvest/<kind>/dt=2026-10-08/20261008T093000Z.jsonl`: one file per run, partitioned by UTC date. */
export function snapshotKey(kind: 'station' | 'forecast', now: string): string {
  const compact = new Date(now).toISOString().slice(0, 19).replaceAll(/[-:]/g, '') + 'Z';
  return `harvest/${kind}/dt=${now.slice(0, 10)}/${compact}.jsonl`;
}

const jsonl = (lines: readonly unknown[]): string =>
  lines.map((line) => JSON.stringify(line)).join('\n') + '\n';

/**
 * One harvest run. For every place it records the nearest station with a recent reading, or says
 * plainly that there was none, and what the regional forecast predicted. Raw lines are appended to
 * S3 (for replay and the forecast-error meter); the latest answer per place goes to the cache.
 * A failing forecast never stops the run. A failing write does, so the schedule shows the failure.
 */
export async function harvestOnce(input: HarvestInput): Promise<HarvestSummary> {
  // Places that share a station ask the provider only once per run.
  const stations = cachedStationRepo(input.stationRepo, HOUR_MS);
  const stationLines: StationSnapshot[] = [];
  const forecastLines: ForecastSnapshot[] = [];

  for (const place of input.places) {
    const fresh = await nearestFreshStation(stations, place, input.now);
    stationLines.push(
      fresh === undefined
        ? {
            schemaVersion: 1,
            harvestedAt: input.now,
            placeId: place.id,
            status: 'no_fresh_station',
            hours: [],
          }
        : {
            schemaVersion: 1,
            harvestedAt: input.now,
            placeId: place.id,
            status: 'fresh',
            station: {
              id: fresh.nearest.station.id,
              name: fresh.nearest.station.name,
              lat: fresh.nearest.station.lat,
              lng: fresh.nearest.station.lng,
              distanceKm: fresh.nearest.distanceKm,
            },
            // Replay later trusts these lines, so the cut is made here too, whatever the repo returned.
            hours: availableHours(fresh.observed, input.now),
          },
    );
    try {
      const hours = await input.forecastRepo.forecastFor(place, input.now);
      forecastLines.push({
        schemaVersion: 1,
        harvestedAt: input.now,
        placeId: place.id,
        status: 'ok',
        hours: [...hours],
      });
    } catch {
      forecastLines.push({
        schemaVersion: 1,
        harvestedAt: input.now,
        placeId: place.id,
        status: 'failed',
        hours: [],
      });
    }
  }

  const keys = [snapshotKey('station', input.now), snapshotKey('forecast', input.now)];
  await input.snapshots.put(keys[0] ?? '', jsonl(stationLines));
  await input.snapshots.put(keys[1] ?? '', jsonl(forecastLines));

  const expiresAt = Math.floor(Date.parse(input.now) / 1000) + CACHE_SECONDS;
  for (const line of stationLines) {
    await input.cache.put(`LATEST#${line.placeId}`, line, expiresAt);
  }
  // A failed forecast is not cached: the API then asks Open-Meteo itself rather than show nothing.
  for (const line of forecastLines.filter((candidate) => candidate.status === 'ok')) {
    await input.cache.put(`FORECAST#${line.placeId}`, line, expiresAt);
  }

  return {
    places: input.places.length,
    withStation: stationLines.filter((line) => line.status === 'fresh').length,
    withoutStation: stationLines.filter((line) => line.status !== 'fresh').length,
    forecastFailures: forecastLines.filter((line) => line.status === 'failed').length,
    keys,
  };
}
