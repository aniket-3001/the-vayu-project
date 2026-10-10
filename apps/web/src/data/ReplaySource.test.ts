import { describe, expect, it, vi } from 'vitest';
import { apiReplaySource, fixtureReplaySource } from './ReplaySource';

const MANIFEST = {
  schemaVersion: 1,
  weekId: 'W1',
  title: 'A Delhi week in December 2025',
  start: '2025-12-08T00:00:00Z',
  end: '2025-12-15T00:00:00Z',
  stationIds: ['17'],
  events: [],
};
const PROV = {
  mode: 'replay',
  label: 'Nearby station',
  source: 'station',
  fetchedAt: '2025-12-15T00:00:00.000Z',
  asOf: '2025-12-15T00:00:00.000Z',
  ageMinutes: 0,
  simulated: true,
  stationId: '17',
  stationName: 'R K Puram, Delhi - DPCC',
  distanceKm: 1.2,
};
const point = (hourStart: string, kind: string, pm25: number | null): unknown => ({
  hourStart,
  pm25,
  pm10: null,
  band: null,
  kind,
  prov: PROV,
});
const TIMELINE = {
  schemaVersion: 1,
  place: { id: 'school', name: 'School', kind: 'school', lat: 28.5672, lng: 77.176 },
  asOf: '2025-12-15T00:00:00.000Z',
  mode: 'replay',
  hours: [
    point('2025-12-14T22:00:00.000Z', 'observed', 200),
    point('2025-12-14T23:00:00.000Z', 'observed', null),
    point('2025-12-15T00:00:00.000Z', 'pattern', 150),
  ],
  week: [],
  windows: [],
  headline: 'x',
  prov: PROV,
};

function api(handlers: Record<string, { status?: number; body: unknown }>): typeof fetch {
  return vi.fn((url: string) => {
    const hit = Object.entries(handlers).find(([part]) => url.includes(part));
    const { status = 200, body } = hit?.[1] ?? { status: 404, body: {} };
    return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
  }) as unknown as typeof fetch;
}

describe('apiReplaySource', () => {
  it('loads the first prepared week as the whole week, asked for at its end, from the school station', async () => {
    const fetchImpl = api({
      '/v1/replay/weeks': { body: { weeks: [MANIFEST] } },
      '/v1/replay?': { body: TIMELINE },
    });
    const week = await apiReplaySource('https://api.example.com/', fetchImpl).load();
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.com/v1/replay?week=W1&place=school&asOf=2025-12-15T00%3A00%3A00Z',
    );
    expect(week).toMatchObject({
      id: 'W1',
      label: 'A Delhi week in December 2025',
      startAt: '2025-12-08T00:00:00Z',
      endAt: '2025-12-15T00:00:00Z',
      real: { stationName: 'R K Puram, Delhi - DPCC', distanceKm: 1.2 },
    });
    // Only observed hours. An hour with no reading is left out, never turned into a zero: the
    // room model then carries the last known value instead of dipping to clean air.
    expect(week?.outdoor).toEqual([
      { hourStart: '2025-12-14T22:00:00.000Z', pm25: 200, pm10: null },
    ]);
  });

  it('says there is no week when none has been prepared', async () => {
    const fetchImpl = api({ '/v1/replay/weeks': { body: { weeks: [] } } });
    expect(await apiReplaySource('https://api.example.com', fetchImpl).load()).toBeUndefined();
  });

  it('fails loudly on a bad answer instead of guessing', async () => {
    const down = api({ '/v1/replay/weeks': { status: 500, body: {} } });
    await expect(apiReplaySource('https://api.example.com', down).load()).rejects.toThrow(/500/);
    const odd = api({ '/v1/replay/weeks': { body: { nope: true } } });
    await expect(apiReplaySource('https://api.example.com', odd).load()).rejects.toThrow();
  });
});

describe('fixtureReplaySource', () => {
  it('is the synthetic week, labelled as sample data', async () => {
    const week = await fixtureReplaySource().load();
    expect(week?.label).toMatch(/sample/i);
    expect(week?.real).toBeUndefined();
  });
});
