import type { CacheStore, MapStationRepo } from '@vayu/data';

/** The world's monitors are kept in this many items, because one DynamoDB item may hold only 400 KB. */
export const STATION_CHUNKS = 12;
export const stationsKey = (chunk: number): string => `STATIONS#world#${String(chunk)}`;
/** Kept for three hours; the route also refuses anything older than it can vouch for. */
export const STATIONS_TTL_SECONDS = 3 * 3600;

/** Which item a monitor is kept in: spread evenly by its number, so no item is much larger than another. */
export const chunkOf = (id: string): number => {
  const n = Number(id);
  return (Number.isFinite(n) ? Math.abs(Math.trunc(n)) : id.length) % STATION_CHUNKS;
};

/** One run: read the monitors, and keep them (with when they were read) in the cache, in chunks. */
export async function snapshotStations(input: {
  readonly repo: MapStationRepo;
  readonly cache: CacheStore;
  readonly now: string;
}): Promise<{ readonly stations: number }> {
  const stations = await input.repo.latest(input.now);
  const expires = Math.floor(Date.parse(input.now) / 1000) + STATIONS_TTL_SECONDS;
  const parts = Array.from({ length: STATION_CHUNKS }, () => [] as (typeof stations)[number][]);
  for (const station of stations) parts[chunkOf(station.id)]?.push(station);
  // An empty answer is not written: the last good snapshot stays until it ages out, and the route says so.
  if (stations.length > 0)
    await Promise.all(
      parts.map((part, i) =>
        input.cache.put(stationsKey(i), { harvestedAt: input.now, stations: part }, expires),
      ),
    );
  return { stations: stations.length };
}
