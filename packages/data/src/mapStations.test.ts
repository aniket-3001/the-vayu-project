import { describe, expect, it, vi } from 'vitest';
import { openAqMapStationRepo } from './mapStations';

const AS_OF = '2026-10-10T12:00:00Z';
const json = (body: unknown, ok = true): Response =>
  ({ ok, status: ok ? 200 : 429, json: () => Promise.resolve(body) }) as Response;

const location = (id: number, name: string, last: string, parameter = 'pm25'): unknown => ({
  id,
  name,
  coordinates: { latitude: 28 + id / 100, longitude: 77 },
  sensors: [{ id: id * 10, parameter: { name: parameter } }],
  datetimeLast: { utc: last },
});
const latest = (id: number, value: number | null, at: string): unknown => ({
  results: [{ datetime: { utc: at }, value, sensorsId: id * 10 }],
});

const fakeFetch = (routes: Record<string, unknown>): ReturnType<typeof vi.fn> =>
  vi.fn((url: string) => {
    const key = Object.keys(routes).find((k) => url.includes(k));
    return Promise.resolve(key === undefined ? json({}, false) : json(routes[key]));
  });

describe('the map’s monitors', () => {
  it('lists the recent PM2.5 monitors in the box and asks each for its latest value', async () => {
    const fetchImpl = fakeFetch({
      '/locations?': {
        results: [
          location(1, 'Anand Vihar', '2026-10-10T11:00:00Z'),
          location(2, 'Old one', '2026-10-01T11:00:00Z'),
          location(3, 'Gas only', '2026-10-10T11:00:00Z', 'no2'),
        ],
      },
      '/locations/1/latest': latest(1, 142.5, '2026-10-10T11:00:00Z'),
    });
    const repo = openAqMapStationRepo({ apiKey: 'k', fetchImpl, sleep: () => Promise.resolve() });
    expect(await repo.latest(AS_OF)).toEqual([
      {
        id: 'openaq-location-1',
        name: 'Anand Vihar',
        lat: 28.01,
        lng: 77,
        pm25: 142.5,
        at: '2026-10-10T11:00:00.000Z',
      },
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0]?.[0]).toContain('bbox=73,26,80,32&parameters_id=2');
  });

  it('leaves off a value from the future, an old one, a missing one or one no sensor could give', async () => {
    const fetchImpl = fakeFetch({
      '/locations?': {
        results: [1, 2, 3, 4, 5].map((id) =>
          location(id, `S${String(id)}`, '2026-10-10T11:30:00Z'),
        ),
      },
      '/locations/1/latest': latest(1, 80, '2026-10-10T13:00:00Z'),
      '/locations/2/latest': latest(2, 80, '2026-10-09T01:00:00Z'),
      '/locations/3/latest': latest(3, null, '2026-10-10T11:00:00Z'),
      '/locations/4/latest': latest(4, 4000, '2026-10-10T11:00:00Z'),
      '/locations/5/latest': latest(5, -3, '2026-10-10T11:00:00Z'),
    });
    const repo = openAqMapStationRepo({ apiKey: 'k', fetchImpl, sleep: () => Promise.resolve() });
    expect(await repo.latest(AS_OF)).toEqual([]);
  });

  it('keeps going when one monitor fails, and spaces its requests to stay under the provider’s limit', async () => {
    const sleep = vi.fn(() => Promise.resolve());
    const fetchImpl = fakeFetch({
      '/locations?': {
        results: [
          location(1, 'A', '2026-10-10T11:30:00Z'),
          location(2, 'B', '2026-10-10T11:00:00Z'),
        ],
      },
      '/locations/2/latest': latest(2, 60, '2026-10-10T11:00:00Z'),
    });
    const repo = openAqMapStationRepo({ apiKey: 'k', fetchImpl, sleep });
    const stations = await repo.latest(AS_OF);
    expect(stations.map((s) => s.name)).toEqual(['B']);
    expect(sleep).toHaveBeenCalledWith(1100);
  });

  it('asks about no more monitors than it was allowed', async () => {
    const fetchImpl = fakeFetch({
      '/locations?': {
        results: [1, 2, 3].map((id) => location(id, `S${String(id)}`, '2026-10-10T11:00:00Z')),
      },
      '/latest': latest(1, 50, '2026-10-10T11:00:00Z'),
    });
    const repo = openAqMapStationRepo({
      apiKey: 'k',
      fetchImpl,
      maxStations: 2,
      sleep: () => Promise.resolve(),
    });
    await repo.latest(AS_OF);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // one list, two latest
  });

  it('fails when the list itself cannot be read, so the schedule shows the failure', async () => {
    const repo = openAqMapStationRepo({
      apiKey: 'k',
      fetchImpl: vi.fn().mockResolvedValue(json({}, false)),
    });
    await expect(repo.latest(AS_OF)).rejects.toThrow(/OpenAQ request failed: 429/u);
  });
});
