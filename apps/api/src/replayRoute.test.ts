import { Timeline, type RawHour } from '@vayu/contracts';
import { fixedClock } from '@vayu/core';
import {
  buildReplayWeek,
  fixtureFireRepo,
  fixtureForecastRepo,
  fixtureStationRepo,
  memoryReplayRepo,
} from '@vayu/data';
import { fixtureLinkStore } from '@vayu/watch';
import { describe, expect, it } from 'vitest';
import { createRouter, type RouterDeps } from './routes';

// Two weeks of hourly values from 24 Nov 2025 (UTC). The value at hour N is 100 + N, so any hour
// that leaks from the future is easy to spot: it would be larger than anything that had happened.
const START_MS = Date.UTC(2025, 10, 24);
const hours: RawHour[] = Array.from({ length: 24 * 21 }, (_, n) => ({
  hourStart: new Date(START_MS + n * 3_600_000).toISOString(),
  pm25: 100 + n,
  pm10: null,
}));
const week = buildReplayWeek({
  weekId: 'W1',
  title: 'Test week',
  start: '2025-12-08T00:00:00.000Z',
  end: '2025-12-14T00:00:00.000Z',
  places: [
    { id: 'home', name: 'Home', kind: 'home', lat: 28.5921, lng: 77.046 },
    { id: 'school', name: 'School', kind: 'school', lat: 28.5672, lng: 77.176 },
  ],
  stations: [{ station: { id: 's1', name: 'Test station', lat: 28.6, lng: 77.05 }, hours }],
  events: [],
});

const deps: RouterDeps = {
  stationRepo: fixtureStationRepo(),
  forecastRepo: fixtureForecastRepo(),
  fireRepo: fixtureFireRepo(),
  clock: fixedClock('2026-10-08T12:00:00.000Z'),
  mode: 'model',
  linkStore: fixtureLinkStore(),
  telegram: { botToken: 'T', webhookSecret: 'S' },
  replayRepo: memoryReplayRepo([week]),
};
const route = createRouter(deps);
const get = (path: string, query: Record<string, string> = {}): ReturnType<typeof route> =>
  route({ method: 'GET', path, query, headers: {} });
const replay = (query: Record<string, string>): ReturnType<typeof route> =>
  get('/v1/replay', { week: 'W1', place: 'home', asOf: '2025-12-10T12:00:00.000Z', ...query });

describe('GET /v1/replay', () => {
  it('lists the prepared weeks', async () => {
    expect(await get('/v1/replay/weeks')).toMatchObject({
      statusCode: 200,
      body: { weeks: [{ weekId: 'W1', title: 'Test week' }] },
    });
  });

  it('returns a replay timeline that passes the contract and says it is a replay', async () => {
    const response = await replay({});
    expect(response.statusCode).toBe(200);
    const timeline = Timeline.parse(response.body);
    expect(timeline.mode).toBe('replay');
    expect(timeline.asOf).toBe('2025-12-10T12:00:00.000Z');
    expect(timeline.prov.simulated).toBe(true);
    expect(timeline.prov.stationName).toBe('Test station');
  });

  it('rule I1: never returns an observed hour that had not ended by asOf, whatever is stored', async () => {
    const asOf = '2025-12-10T12:00:00.000Z';
    const timeline = Timeline.parse((await replay({ asOf })).body);
    const observed = timeline.hours.filter((hour) => hour.kind === 'observed');
    expect(observed.length).toBeGreaterThan(24);
    for (const hour of observed) {
      expect(Date.parse(hour.hourStart) + 3_600_000).toBeLessThanOrEqual(Date.parse(asOf));
    }
    const newest = Math.max(...observed.map((hour) => hour.pm25 ?? 0));
    const nOfAsOf = (Date.parse(asOf) - START_MS) / 3_600_000; // hours since the first stored hour
    expect(newest).toBeLessThan(100 + nOfAsOf); // no value from asOf or later
  });

  it('moving the clock forward reveals later hours and nothing else changes about the past', async () => {
    const early = Timeline.parse((await replay({ asOf: '2025-12-10T12:00:00.000Z' })).body);
    const later = Timeline.parse((await replay({ asOf: '2025-12-10T18:00:00.000Z' })).body);
    const observedStarts = (t: Timeline): string[] =>
      t.hours.filter((h) => h.kind === 'observed').map((h) => h.hourStart);
    expect(observedStarts(later).length).toBeGreaterThan(observedStarts(early).length - 1);
    expect(observedStarts(later)).toContain('2025-12-10T17:00:00.000Z');
    expect(observedStarts(early)).not.toContain('2025-12-10T17:00:00.000Z');
  });

  it('names the field at fault: missing week, missing or bad asOf, unknown week, unknown place', async () => {
    expect((await replay({ week: '' })).body).toMatchObject({
      error: { code: 'missing_parameter', param: 'week' },
    });
    expect((await replay({ asOf: '' })).body).toMatchObject({
      error: { code: 'missing_parameter', param: 'asOf' },
    });
    expect((await replay({ asOf: 'tomorrow' })).body).toMatchObject({
      error: { code: 'bad_parameter', param: 'asOf' },
    });
    expect(await replay({ week: 'W9' })).toMatchObject({
      statusCode: 404,
      body: { error: { code: 'unknown_week', param: 'week' } },
    });
    expect(await replay({ place: 'moon' })).toMatchObject({
      statusCode: 404,
      body: { error: { code: 'unknown_place', param: 'place' } },
    });
  });

  it('refuses a clock outside the prepared week', async () => {
    expect(await replay({ asOf: '2025-12-20T00:00:00.000Z' })).toMatchObject({
      statusCode: 400,
      body: { error: { code: 'outside_replay_window', param: 'asOf' } },
    });
  });

  it('says plainly when a place has no station in this week', async () => {
    expect(await replay({ place: 'office' })).toMatchObject({
      statusCode: 404,
      body: { error: { code: 'no_data_for_place', param: 'place' } },
    });
  });

  it('is not found when the deployment has no replay data wired', async () => {
    const bare = createRouter({ ...deps, replayRepo: undefined });
    expect(await bare({ method: 'GET', path: '/v1/replay', query: {}, headers: {} })).toMatchObject(
      {
        statusCode: 404,
        body: { error: { code: 'not_found' } },
      },
    );
  });
});
