import type { RawHour } from '@vayu/contracts';
import { describe, expect, it, vi } from 'vitest';
import { cachedStationRepo, nearestFreshStation, newestAgeHours } from './freshStation';
import type { StationRepo } from './repos';
import type { Station } from './station';

const ASOF = '2026-10-06T12:00:00.000Z';
const hour = (hourStart: string, pm25: number | null): RawHour => ({ hourStart, pm25, pm10: null });
const station = (id: string, lat: number, hasPm25 = true): Station => ({
  id,
  name: id,
  lat,
  lng: 77.2,
  hasPm25,
});

const FRESH = [hour('2026-10-06T10:00:00.000Z', 80)]; // ended 11:00, 1h old
const STALE = [hour('2026-10-02T08:00:00.000Z', 62)]; // days old

function repoOf(stations: Station[], series: Record<string, RawHour[]>): StationRepo {
  return {
    stationsNear: () => Promise.resolve(stations),
    hourlyFor: (id) => Promise.resolve(series[id] ?? []),
  };
}
const HOME = { lat: 28.6, lng: 77.2 };

describe('newestAgeHours', () => {
  it('measures from the end of the newest non-null hour', () => {
    expect(newestAgeHours([...FRESH, hour('2026-10-06T11:00:00.000Z', null)], ASOF)).toBe(1);
    expect(newestAgeHours([], ASOF)).toBeUndefined();
  });
});

describe('nearestFreshStation', () => {
  it('skips a nearer stale station for a farther fresh one', async () => {
    const repo = repoOf([station('near-stale', 28.601), station('far-fresh', 28.7)], {
      'near-stale': STALE,
      'far-fresh': FRESH,
    });
    const found = await nearestFreshStation(repo, HOME, ASOF);
    expect(found?.nearest.station.id).toBe('far-fresh');
    expect(found?.observed).toEqual(FRESH);
  });

  it('keeps looking past the first batch: the nearest fresh station may be far down the list', async () => {
    const stale = Array.from({ length: 15 }, (_, i) => station(`stale-${i}`, 28.601 + i * 0.001));
    const repo = repoOf([...stale, station('fresh-16th', 28.62)], { 'fresh-16th': FRESH });
    const found = await nearestFreshStation(repo, HOME, ASOF);
    expect(found?.nearest.station.id).toBe('fresh-16th');
  });

  it('stops after the first batch that has a fresh station, to spare the provider rate limit', async () => {
    const hourlyFor = vi.fn((id: string) => Promise.resolve(id === 'a' ? FRESH : []));
    const repo: StationRepo = {
      stationsNear: () =>
        Promise.resolve(
          Array.from({ length: 40 }, (_, i) =>
            station(i === 0 ? 'a' : `s${i}`, 28.601 + i * 0.001),
          ),
        ),
      hourlyFor,
    };
    await nearestFreshStation(repo, HOME, ASOF);
    expect(hourlyFor).toHaveBeenCalledTimes(6);
  });

  it('gives up after a bounded number of stations', async () => {
    const hourlyFor = vi.fn(() => Promise.resolve([] as RawHour[]));
    const repo: StationRepo = {
      stationsNear: () =>
        Promise.resolve(Array.from({ length: 80 }, (_, i) => station(`s${i}`, 28.601 + i * 0.001))),
      hourlyFor,
    };
    expect(await nearestFreshStation(repo, HOME, ASOF)).toBeUndefined();
    expect(hourlyFor).toHaveBeenCalledTimes(30);
  });

  it('returns undefined when every station is stale or empty, so the caller can fall back to the model', async () => {
    const repo = repoOf([station('a', 28.601), station('b', 28.7)], { a: STALE });
    expect(await nearestFreshStation(repo, HOME, ASOF)).toBeUndefined();
  });

  it('never picks a station without a PM2.5 sensor and tolerates one station failing', async () => {
    const repo: StationRepo = {
      stationsNear: () =>
        Promise.resolve([
          station('no-pm', 28.6005, false),
          station('broken', 28.601),
          station('ok', 28.7),
        ]),
      hourlyFor: (id) =>
        id === 'broken' ? Promise.reject(new Error('boom')) : Promise.resolve(FRESH),
    };
    expect((await nearestFreshStation(repo, HOME, ASOF))?.nearest.station.id).toBe('ok');
  });

  it('returns undefined instead of throwing when the provider is down', async () => {
    const repo: StationRepo = {
      stationsNear: () => Promise.reject(new Error('OpenAQ down')),
      hourlyFor: () => Promise.resolve(FRESH),
    };
    expect(await nearestFreshStation(repo, HOME, ASOF)).toBeUndefined();
  });

  it('only looks at the nearest few candidates', async () => {
    const hourlyFor = vi.fn(() => Promise.resolve(STALE));
    const repo: StationRepo = {
      stationsNear: () =>
        Promise.resolve([station('a', 28.601), station('b', 28.602), station('c', 28.603)]),
      hourlyFor,
    };
    await nearestFreshStation(repo, HOME, ASOF, { maxAgeHours: 6, candidates: 2, batchSize: 2 });
    expect(hourlyFor).toHaveBeenCalledTimes(2);
  });
});

describe('cachedStationRepo', () => {
  it('serves repeats from memory until the ttl, and never caches a failure', async () => {
    let now = 0;
    const hourlyFor = vi
      .fn<StationRepo['hourlyFor']>()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue(FRESH);
    const cached = cachedStationRepo(
      { stationsNear: () => Promise.resolve([]), hourlyFor },
      1000,
      () => now,
    );

    await expect(cached.hourlyFor('x', ASOF)).rejects.toThrow('down');
    await cached.hourlyFor('x', ASOF); // retried after the failure
    await cached.hourlyFor('x', ASOF); // cached
    expect(hourlyFor).toHaveBeenCalledTimes(2);

    now = 1500;
    await cached.hourlyFor('x', ASOF); // expired
    expect(hourlyFor).toHaveBeenCalledTimes(3);
  });
});
