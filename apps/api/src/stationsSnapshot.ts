import type { CacheStore, MapStationRepo } from '@vayu/data';

export const STATIONS_KEY = 'STATIONS#north-india';
/** Kept for three hours; the route also refuses anything older than it can vouch for. */
export const STATIONS_TTL_SECONDS = 3 * 3600;

/** One run: read the monitors, and keep them (with when they were read) in the cache. */
export async function snapshotStations(input: {
  readonly repo: MapStationRepo;
  readonly cache: CacheStore;
  readonly now: string;
}): Promise<{ readonly stations: number }> {
  const stations = await input.repo.latest(input.now);
  await input.cache.put(
    STATIONS_KEY,
    { harvestedAt: input.now, stations },
    Math.floor(Date.parse(input.now) / 1000) + STATIONS_TTL_SECONDS,
  );
  return { stations: stations.length };
}
