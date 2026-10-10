import { MapStation, Stations } from '@vayu/contracts';
import type { Clock } from '@vayu/core';
import { z } from 'zod';
import { failure, okCached, type ApiRequest, type ApiResponse } from './respond';

const Snapshot = z.object({ harvestedAt: z.string(), stations: z.array(MapStation) });

export interface StationsDeps {
  /** What the last scheduled snapshot saved, or undefined when there is none. */
  readonly stations: (asOf: string) => Promise<unknown>;
  readonly clock: Clock;
}

/** A monitor reading older than this is not shown as current (rule I3). */
const MAX_AGE_MS = 6 * 3_600_000;
export const STATIONS_CACHE_SECONDS = 300;

/**
 * `GET /v1/stations`: the monitors with a recent PM2.5 reading, for the map. They come from the last scheduled
 * snapshot, so a visitor never reaches the provider. Anything older than six hours is dropped; with nothing
 * recent the answer is an empty list marked `model`, and the map says there are no recent monitors.
 */
export async function handleStations(
  request: ApiRequest,
  deps: StationsDeps,
): Promise<ApiResponse> {
  if (request.method !== 'GET')
    return failure(405, 'method_not_allowed', `${request.method} is not supported here`);
  const asOf = deps.clock.now();
  const raw = await deps.stations(asOf).catch(() => undefined);
  const snapshot = Snapshot.safeParse(raw);
  const limit = Date.parse(asOf);
  const stations = snapshot.success
    ? snapshot.data.stations.filter((s) => {
        const age = limit - Date.parse(s.at);
        return age >= 0 && age <= MAX_AGE_MS;
      })
    : [];
  return okCached(
    Stations.parse({
      schemaVersion: 1,
      asOf,
      mode: stations.length > 0 ? 'live' : 'model',
      source: 'OpenAQ monitors worldwide with a PM2.5 reading in the last six hours',
      stations,
    }),
    STATIONS_CACHE_SECONDS,
  );
}
