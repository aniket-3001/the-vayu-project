import { Timeline, type RawHour } from '@vayu/contracts';
import { fixedClock } from '@vayu/core';
import {
  fixtureFireRepo,
  type ForecastRepo,
  type ForecastSnapshot,
  type StationRepo,
  type StationSnapshot,
} from '@vayu/data';
import { fixtureLinkStore } from '@vayu/watch';
import { describe, expect, it } from 'vitest';
import { createRouter } from './routes';

const NOW = '2026-10-08T10:00:00.000Z';
const minutesAgo = (m: number): string => new Date(Date.parse(NOW) - m * 60_000).toISOString();
const hour = (hourStart: string, pm25: number): RawHour => ({ hourStart, pm25, pm10: null });
const hoursBefore = (n: number): RawHour[] =>
  Array.from({ length: n }, (_, i) =>
    hour(new Date(Date.parse(NOW) - (n - i + 1) * 3_600_000).toISOString(), 60 + i),
  );

const stationLine = (over: Partial<StationSnapshot> = {}): StationSnapshot => ({
  schemaVersion: 1,
  harvestedAt: minutesAgo(10),
  placeId: 'school',
  status: 'fresh',
  station: { id: 'cached-1', name: 'Cached Station', lat: 28.5, lng: 77.2, distanceKm: 2 },
  hours: hoursBefore(48),
  ...over,
});
const forecastLine = (): ForecastSnapshot => ({
  schemaVersion: 1,
  harvestedAt: minutesAgo(10),
  placeId: 'school',
  status: 'ok',
  hours: Array.from({ length: 48 }, (_, i) =>
    hour(new Date(Date.parse(NOW) + i * 3_600_000).toISOString(), 70),
  ),
});

function build(cached: { station?: StationSnapshot; forecast?: ForecastSnapshot } | undefined): {
  route: ReturnType<typeof createRouter>;
  liveCalls: { stations: number; forecasts: number };
} {
  const liveCalls = { stations: 0, forecasts: 0 };
  const stationRepo: StationRepo = {
    stationsNear: () => {
      liveCalls.stations++;
      return Promise.resolve([
        { id: 'live-1', name: 'Live Station', lat: 28.5, lng: 77.2, hasPm25: true },
      ]);
    },
    hourlyFor: () => Promise.resolve(hoursBefore(48)),
  };
  const forecastRepo: ForecastRepo = {
    forecastFor: () => {
      liveCalls.forecasts++;
      return Promise.resolve([]);
    },
  };
  const route = createRouter({
    stationRepo,
    forecastRepo,
    fireRepo: fixtureFireRepo(),
    clock: fixedClock(NOW, 'live'),
    mode: 'live',
    linkStore: fixtureLinkStore(),
    telegram: { botToken: 'T', webhookSecret: 'S' },
    ...(cached === undefined
      ? {}
      : {
          cache: {
            latest: () => Promise.resolve(cached.station),
            latestForecast: () => Promise.resolve(cached.forecast),
          },
        }),
  });
  return { route, liveCalls };
}
const timeline = async (
  route: ReturnType<typeof createRouter>,
  query: Record<string, string>,
): Promise<Timeline> =>
  Timeline.parse((await route({ method: 'GET', path: '/v1/timeline', query, headers: {} })).body);

describe('/v1/timeline from the harvest cache', () => {
  it('answers a demo place from a recent harvest without asking OpenAQ or Open-Meteo', async () => {
    const { route, liveCalls } = build({ station: stationLine(), forecast: forecastLine() });
    const result = await timeline(route, { place: 'school' });
    expect(result.prov.stationName).toBe('Cached Station');
    expect(result.mode).toBe('live');
    expect(liveCalls).toEqual({ stations: 0, forecasts: 0 });
  });

  it('says when the data was fetched: the harvest time, not now', async () => {
    const { route } = build({ station: stationLine(), forecast: forecastLine() });
    const result = await timeline(route, { place: 'school' });
    expect(result.prov.fetchedAt).toBe(minutesAgo(10));
  });

  it('looks live when the harvest has gone quiet', async () => {
    const { route, liveCalls } = build({
      station: stationLine({ harvestedAt: minutesAgo(90) }),
      forecast: forecastLine(),
    });
    const result = await timeline(route, { place: 'school' });
    expect(result.prov.stationName).toBe('Live Station');
    expect(liveCalls.stations).toBe(1);
  });

  it('looks live when nothing was harvested for the place', async () => {
    const { route, liveCalls } = build({});
    expect((await timeline(route, { place: 'school' })).prov.stationName).toBe('Live Station');
    expect(liveCalls).toEqual({ stations: 1, forecasts: 1 });
  });

  it('uses the cached station but asks for the forecast live when only that is missing', async () => {
    const { route, liveCalls } = build({ station: stationLine() });
    expect((await timeline(route, { place: 'school' })).prov.stationName).toBe('Cached Station');
    expect(liveCalls).toEqual({ stations: 0, forecasts: 1 });
  });

  it('does not trust "no fresh station" from the harvest (it may have been a rate limit)', async () => {
    const { route, liveCalls } = build({
      station: stationLine({ status: 'no_fresh_station', hours: [] }),
      forecast: forecastLine(),
    });
    expect((await timeline(route, { place: 'school' })).prov.stationName).toBe('Live Station');
    expect(liveCalls.stations).toBe(1);
  });

  it('always looks live for a person’s own location, whatever the cache holds', async () => {
    const { route, liveCalls } = build({ station: stationLine(), forecast: forecastLine() });
    const result = await timeline(route, { lat: '28.61', lng: '77.21' });
    expect(result.prov.stationName).toBe('Live Station');
    expect(liveCalls.stations).toBe(1);
  });

  it('works as before when no cache is wired', async () => {
    const { route } = build(undefined);
    expect((await timeline(route, { place: 'school' })).prov.stationName).toBe('Live Station');
  });
});
