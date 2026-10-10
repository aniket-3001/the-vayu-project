import { describe, expect, it, vi } from 'vitest';
import { openAqMapStationRepo } from './mapStations';

const AS_OF = '2026-10-10T12:00:00Z';
const ok = (results: unknown[]): Response =>
  ({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: () => Promise.resolve({ results }),
  }) as Response;
const limited = (retryAfter?: string): Response =>
  ({
    ok: false,
    status: 429,
    headers: new Headers(retryAfter === undefined ? {} : { 'retry-after': retryAfter }),
  }) as Response;

const reading = (
  locationsId: number,
  value: number | null,
  at = '2026-10-10T11:00:00Z',
  lat = 28.6,
  lng = 77.2,
): unknown => ({
  datetime: { utc: at },
  value,
  coordinates: { latitude: lat, longitude: lng },
  locationsId,
});
const quick = { apiKey: 'k', sleep: () => Promise.resolve() };

describe('the map’s monitors, worldwide', () => {
  it('turns the latest PM2.5 of every monitor into a station, anywhere in the world', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        ok([reading(1, 55.44, undefined, 28.6, 77.2), reading(2, 8, undefined, 47.83, -122.25)]),
      );
    const stations = await openAqMapStationRepo({ ...quick, fetchImpl }).latest(AS_OF);
    expect(stations).toEqual([
      { id: '1', name: '', lat: 28.6, lng: 77.2, pm25: 55.4, at: '2026-10-10T11:00:00.000Z' },
      { id: '2', name: '', lat: 47.83, lng: -122.25, pm25: 8, at: '2026-10-10T11:00:00.000Z' },
    ]);
  });

  it('asks for the readings of the last six hours, a thousand to a page, and reads on while pages are full', async () => {
    const page = (n: number): Response =>
      ok(Array.from({ length: 1000 }, (_, i) => reading(n * 10_000 + i, 20)));
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(page(1))
      .mockResolvedValueOnce(page(2))
      .mockResolvedValueOnce(ok([reading(99, 30)]));
    const stations = await openAqMapStationRepo({ ...quick, fetchImpl }).latest(AS_OF);
    expect(stations).toHaveLength(2001);
    const url = fetchImpl.mock.calls[0]?.[0] as string;
    expect(url).toContain('/parameters/2/latest?limit=1000&page=1');
    expect(url).toContain('datetime_min=2026-10-10T06:00:00Z');
    expect(fetchImpl.mock.calls[2]?.[0] as string).toContain('page=3');
  });

  it('leaves off a reading that is old, from the future, missing, negative or beyond what a sensor can give (rules I1, I3)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        ok([
          reading(1, 40, '2026-10-10T05:00:00Z'),
          reading(2, 40, '2026-10-10T13:00:00Z'),
          reading(3, null),
          reading(4, -3),
          reading(5, 4000),
          reading(6, 40),
        ]),
      );
    const stations = await openAqMapStationRepo({ ...quick, fetchImpl }).latest(AS_OF);
    expect(stations.map((s) => s.id)).toEqual(['6']);
  });

  it('counts a monitor once, by its newest reading', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        ok([reading(7, 10, '2026-10-10T09:00:00Z'), reading(7, 90, '2026-10-10T11:00:00Z')]),
      );
    const stations = await openAqMapStationRepo({ ...quick, fetchImpl }).latest(AS_OF);
    expect(stations).toHaveLength(1);
    expect(stations[0]?.pm25).toBe(90);
  });

  it('spaces its requests, and stops at its page limit', async () => {
    const sleep = vi.fn(() => Promise.resolve());
    const full = ok(Array.from({ length: 1000 }, (_, i) => reading(i, 20)));
    const fetchImpl = vi.fn().mockResolvedValue(full);
    await openAqMapStationRepo({ apiKey: 'k', fetchImpl, sleep, maxPages: 3 }).latest(AS_OF);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledWith(1100);
  });

  it('stops asking when its time is spent, and keeps what it has read', async () => {
    let t = 0;
    const full = ok(Array.from({ length: 1000 }, (_, i) => reading(i, 20)));
    const fetchImpl = vi.fn().mockResolvedValue(full);
    const stations = await openAqMapStationRepo({
      ...quick,
      fetchImpl,
      budgetMs: 2500,
      now: () => (t += 1000),
    }).latest(AS_OF);
    expect(fetchImpl.mock.calls.length).toBeLessThan(5);
    expect(stations.length).toBeGreaterThan(0);
  });

  it('waits as OpenAQ asks when told to slow down, gives up after a few waits, and not past its time', async () => {
    const sleep = vi.fn(() => Promise.resolve());
    const fetchImpl = vi.fn().mockResolvedValueOnce(limited('7')).mockResolvedValue(ok([]));
    await openAqMapStationRepo({ apiKey: 'k', fetchImpl, sleep }).latest(AS_OF);
    expect(sleep).toHaveBeenCalledWith(7000);
    const always = vi.fn().mockResolvedValue(limited());
    await expect(
      openAqMapStationRepo({ apiKey: 'k', fetchImpl: always, sleep }).latest(AS_OF),
    ).rejects.toThrow(/429/u);
    const none = vi.fn().mockResolvedValue(limited('20'));
    const quiet = vi.fn(() => Promise.resolve());
    await expect(
      openAqMapStationRepo({
        apiKey: 'k',
        fetchImpl: none,
        sleep: quiet,
        budgetMs: 5000,
        now: () => 0,
      }).latest(AS_OF),
    ).rejects.toThrow(/429/u);
    expect(quiet).not.toHaveBeenCalled();
  });

  it('fails when the list cannot be read, so the schedule shows the failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500, headers: new Headers() });
    await expect(openAqMapStationRepo({ ...quick, fetchImpl }).latest(AS_OF)).rejects.toThrow(
      /500/u,
    );
  });
});
