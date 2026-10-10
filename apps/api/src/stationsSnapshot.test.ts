import { describe, expect, it } from 'vitest';
import {
  STATION_CHUNKS,
  STATIONS_TTL_SECONDS,
  chunkOf,
  snapshotStations,
  stationsKey,
} from './stationsSnapshot';

const station = (
  id: number,
): { id: string; name: string; lat: number; lng: number; pm25: number; at: string } => ({
  id: String(id),
  name: '',
  lat: 28,
  lng: 77,
  pm25: 50,
  at: '2026-10-10T11:00:00.000Z',
});

describe('the stations snapshot', () => {
  it('keeps every monitor, and when they were read, in several items for three hours', async () => {
    const puts: { key: string; value: { stations: { id: string }[] }; expiresAt: number }[] = [];
    const now = '2026-10-10T12:00:00.000Z';
    const result = await snapshotStations({
      repo: { latest: () => Promise.resolve(Array.from({ length: 100 }, (_, i) => station(i))) },
      cache: {
        put: (key, value, expiresAt) => {
          puts.push({ key, value: value as { stations: { id: string }[] }, expiresAt });
          return Promise.resolve();
        },
      },
      now,
    });
    expect(result).toEqual({ stations: 100 });
    expect(puts).toHaveLength(STATION_CHUNKS);
    expect(puts.map((p) => p.key).sort()).toEqual(
      Array.from({ length: STATION_CHUNKS }, (_, i) => stationsKey(i)).sort(),
    );
    // Nothing lost or doubled across the items, and each is kept for three hours.
    expect(
      puts
        .flatMap((p) => p.value.stations)
        .map((s) => s.id)
        .sort(),
    ).toEqual(Array.from({ length: 100 }, (_, i) => String(i)).sort());
    for (const put of puts) {
      expect(put.expiresAt).toBe(Date.parse(now) / 1000 + STATIONS_TTL_SECONDS);
      expect(put.value).toMatchObject({ harvestedAt: now });
    }
  });

  it('puts a monitor in the same item every time, spread evenly', () => {
    expect(chunkOf('12')).toBe(chunkOf('12'));
    const counts = new Array<number>(STATION_CHUNKS).fill(0);
    for (let i = 0; i < 1200; i++) {
      const chunk = chunkOf(String(6_000_000 + i));
      counts[chunk] = (counts[chunk] ?? 0) + 1;
    }
    expect(Math.min(...counts)).toBe(100);
    expect(chunkOf('not-a-number')).toBeLessThan(STATION_CHUNKS);
  });

  it('writes nothing when the monitors cannot be read, or none came back, so the last good snapshot stays', async () => {
    const puts: unknown[] = [];
    const cache = { put: () => Promise.resolve(void puts.push(1)) };
    await expect(
      snapshotStations({
        repo: { latest: () => Promise.reject(new Error('OpenAQ down')) },
        cache,
        now: '2026-10-10T12:00:00.000Z',
      }),
    ).rejects.toThrow('OpenAQ down');
    await snapshotStations({
      repo: { latest: () => Promise.resolve([]) },
      cache,
      now: '2026-10-10T12:00:00.000Z',
    });
    expect(puts).toEqual([]);
  });
});
