import type { Place, RawHour } from '@vayu/contracts';
import { describe, expect, it } from 'vitest';
import {
  ForecastSnapshot,
  StationSnapshot,
  harvestOnce,
  type CacheStore,
  type HarvestSummary,
  type SnapshotStore,
} from './harvest';
import type { ForecastRepo, StationRepo } from './repos';

const NOW = '2026-10-08T09:30:00.000Z';
const place = (id: string, lat: number, lng: number): Place => ({
  id,
  name: id,
  kind: 'other',
  lat,
  lng,
});
const PLACES = [place('home', 28.59, 77.04), place('park', 28.59, 77.22)];

const hour = (hourStart: string, pm25: number): RawHour => ({ hourStart, pm25, pm10: null });
const FRESH = [hour('2026-10-08T07:00:00.000Z', 80), hour('2026-10-08T08:00:00.000Z', 90)];
const STALE = [hour('2026-10-01T07:00:00.000Z', 80)];

const stationRepo = (hoursById: Record<string, readonly RawHour[]>): StationRepo => ({
  stationsNear: () =>
    Promise.resolve(
      Object.keys(hoursById).map((id) => ({
        id,
        name: `Station ${id}`,
        lat: 28.6,
        lng: 77.1,
        hasPm25: true,
      })),
    ),
  hourlyFor: (id) => Promise.resolve(hoursById[id] ?? []),
});
const forecastRepo = (hours: readonly RawHour[] | Error): ForecastRepo => ({
  forecastFor: () => (hours instanceof Error ? Promise.reject(hours) : Promise.resolve(hours)),
});

interface Memory {
  readonly snapshots: SnapshotStore;
  readonly cache: CacheStore;
  readonly files: Map<string, string>;
  readonly items: Map<string, { value: unknown; expiresAt: number }>;
}

function memory(): Memory {
  const files = new Map<string, string>();
  const items = new Map<string, { value: unknown; expiresAt: number }>();
  return {
    files,
    items,
    snapshots: {
      put: (key, body) => {
        files.set(key, body);
        return Promise.resolve();
      },
    },
    cache: {
      put: (key, value, expiresAt) => {
        items.set(key, { value, expiresAt });
        return Promise.resolve();
      },
    },
  };
}

const run = (stores: Memory, repo: StationRepo, forecast: ForecastRepo): Promise<HarvestSummary> =>
  harvestOnce({
    places: PLACES,
    stationRepo: repo,
    forecastRepo: forecast,
    snapshots: stores.snapshots,
    cache: stores.cache,
    now: NOW,
  });

const lines = (body: string | undefined): unknown[] =>
  (body ?? '')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as unknown);

describe('harvestOnce', () => {
  it('writes one station line and one forecast line per place, under a date partition', async () => {
    const stores = memory();
    const forecast = [hour('2026-10-08T10:00:00.000Z', 100)];
    const summary = await run(stores, stationRepo({ a: FRESH }), forecastRepo(forecast));

    expect(summary).toMatchObject({
      places: 2,
      withStation: 2,
      withoutStation: 0,
      forecastFailures: 0,
    });
    const stationKey = 'harvest/station/dt=2026-10-08/20261008T093000Z.jsonl';
    const forecastKey = 'harvest/forecast/dt=2026-10-08/20261008T093000Z.jsonl';
    expect([...stores.files.keys()].sort()).toEqual([forecastKey, stationKey]);

    const stationLines = lines(stores.files.get(stationKey)).map((line) =>
      StationSnapshot.parse(line),
    );
    expect(stationLines.map((line) => line.placeId)).toEqual(['home', 'park']);
    expect(stationLines[0]).toMatchObject({
      status: 'fresh',
      harvestedAt: NOW,
      station: { id: 'a' },
    });
    expect(stationLines[0]?.hours).toEqual(FRESH);
    const forecastLines = lines(stores.files.get(forecastKey)).map((line) =>
      ForecastSnapshot.parse(line),
    );
    expect(forecastLines[0]).toMatchObject({ status: 'ok', placeId: 'home', hours: forecast });
  });

  it('records the gap honestly when no station has a recent reading, and does not keep stale hours', async () => {
    const stores = memory();
    const summary = await run(stores, stationRepo({ old: STALE }), forecastRepo([]));
    expect(summary).toMatchObject({ withStation: 0, withoutStation: 2 });
    const line = StationSnapshot.parse(
      lines(stores.files.get('harvest/station/dt=2026-10-08/20261008T093000Z.jsonl'))[0],
    );
    expect(line).toMatchObject({ status: 'no_fresh_station', hours: [] });
    expect(line.station).toBeUndefined();
  });

  it('keeps going when the forecast fails, and says so', async () => {
    const stores = memory();
    const summary = await run(stores, stationRepo({ a: FRESH }), forecastRepo(new Error('down')));
    expect(summary).toMatchObject({ withStation: 2, forecastFailures: 2 });
    const line = ForecastSnapshot.parse(
      lines(stores.files.get('harvest/forecast/dt=2026-10-08/20261008T093000Z.jsonl'))[0],
    );
    expect(line).toMatchObject({ status: 'failed', hours: [] });
  });

  it('caches the latest answer per place for six hours', async () => {
    const stores = memory();
    await run(stores, stationRepo({ a: FRESH }), forecastRepo([]));
    const home = stores.items.get('LATEST#home');
    expect(home?.expiresAt).toBe(Math.floor(Date.parse(NOW) / 1000) + 6 * 3600);
    expect(home?.value).toMatchObject({ placeId: 'home', status: 'fresh', harvestedAt: NOW });
  });

  it('caches the forecast per place too, but not a failed one', async () => {
    const stores = memory();
    await run(
      stores,
      stationRepo({ a: FRESH }),
      forecastRepo([hour('2026-10-08T10:00:00.000Z', 100)]),
    );
    expect(stores.items.get('FORECAST#home')?.value).toMatchObject({
      placeId: 'home',
      status: 'ok',
    });
    const failed = memory();
    await run(failed, stationRepo({ a: FRESH }), forecastRepo(new Error('down')));
    expect(failed.items.has('FORECAST#home')).toBe(false);
  });

  it('asks for each nearby-station list and each station series once, even when places share them', async () => {
    const stores = memory();
    let hourCalls = 0;
    const repo = stationRepo({ a: FRESH });
    await harvestOnce({
      places: PLACES,
      stationRepo: { ...repo, hourlyFor: (id, asOf) => (hourCalls++, repo.hourlyFor(id, asOf)) },
      forecastRepo: forecastRepo([]),
      snapshots: stores.snapshots,
      cache: stores.cache,
      now: NOW,
    });
    expect(hourCalls).toBe(1);
  });

  it('never uses an hour that has not ended by the harvest time (rule I1)', async () => {
    const stores = memory();
    const repo = stationRepo({ a: [...FRESH, hour('2026-10-08T09:00:00.000Z', 999)] });
    await run(
      stores,
      { ...repo, hourlyFor: (id, asOf) => repo.hourlyFor(id, asOf) },
      forecastRepo([]),
    );
    const line = StationSnapshot.parse(
      lines(stores.files.get('harvest/station/dt=2026-10-08/20261008T093000Z.jsonl'))[0],
    );
    expect(line.hours.map((h) => h.hourStart)).not.toContain('2026-10-08T09:00:00.000Z');
  });
});
