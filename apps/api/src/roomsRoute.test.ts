import { RoomObservation, type Reading } from '@vayu/contracts';
import { fixedClock } from '@vayu/core';
import {
  fixtureFireRepo,
  fixtureForecastRepo,
  fixtureStationRepo,
  type StationSnapshot,
} from '@vayu/data';
import { fixtureLinkStore } from '@vayu/watch';
import { describe, expect, it } from 'vitest';
import { createRouter } from './routes';

const NOW = '2026-10-08T10:00:00.000Z';
const at = (minutesAgo: number): string =>
  new Date(Date.parse(NOW) - minutesAgo * 60_000).toISOString();
const reading = (minutesAgo: number, pm25: number, over: Partial<Reading> = {}): Reading => ({
  schemaVersion: 1,
  id: `dev#${at(minutesAgo)}#${minutesAgo}`,
  thingId: 'dev',
  ts: at(minutesAgo),
  pm25,
  pm10: pm25 * 1.5,
  rhPct: 50,
  flags: [],
  simulated: true,
  ...over,
});
const harvested: StationSnapshot = {
  schemaVersion: 1,
  harvestedAt: NOW,
  placeId: 'school',
  status: 'fresh',
  hours: [{ hourStart: '2026-10-08T08:00:00.000Z', pm25: 130, pm10: null }],
};

const build = (
  readings: Reading[],
  snapshot: StationSnapshot | null = harvested,
): ReturnType<typeof createRouter> =>
  createRouter({
    stationRepo: fixtureStationRepo(),
    forecastRepo: fixtureForecastRepo(),
    fireRepo: fixtureFireRepo(),
    clock: fixedClock(NOW, 'live'),
    mode: 'live',
    linkStore: fixtureLinkStore(),
    telegram: { botToken: 'T', webhookSecret: 'S' },
    rooms: {
      store: {
        putReading: () => Promise.resolve('stored'),
        readingsSince: () => Promise.resolve(readings),
      },
      cache: {
        latest: () => Promise.resolve(snapshot ?? undefined),
        latestForecast: () => Promise.resolve(undefined),
      },
    },
  });
const get = (
  route: ReturnType<typeof createRouter>,
  path: string,
  query: Record<string, string> = {},
): ReturnType<ReturnType<typeof createRouter>> =>
  route({ method: 'GET', path, query, headers: {} });

describe('GET /v1/rooms/{id}', () => {
  it('gives the room as the unit sees it, with the outdoor reference from the harvest, and passes the contract', async () => {
    const response = await get(
      build([reading(1, 40), reading(2, 42), reading(3, 38)]),
      '/v1/rooms/dev',
    );
    expect(response.statusCode).toBe(200);
    const room = RoomObservation.parse(response.body);
    expect(room).toMatchObject({
      roomId: 'dev',
      insidePm25: 40,
      outsidePm25: 130,
      lastSeenMinutes: 1,
      simulated: true,
    });
  });

  it('says nothing is known (all null) for a unit that has not reported, rather than inventing a reading', async () => {
    const room = RoomObservation.parse((await get(build([]), '/v1/rooms/dev')).body);
    expect(room).toMatchObject({ insidePm25: null, lastSeenMinutes: null, simulated: false });
  });

  it('has no outdoor reference when the harvest has nothing for the place', async () => {
    const room = RoomObservation.parse(
      (await get(build([reading(1, 40)], null), '/v1/rooms/dev')).body,
    );
    expect(room).toMatchObject({ outsidePm25: null, outsideObservedAt: null });
  });

  it('compares with another place when asked, and names the field at fault for a bad one', async () => {
    const route = build([reading(1, 40)]);
    expect((await get(route, '/v1/rooms/dev', { place: 'park' })).statusCode).toBe(200);
    expect(await get(route, '/v1/rooms/dev', { place: 'moon' })).toMatchObject({
      statusCode: 404,
      body: { error: { code: 'unknown_place', param: 'place' } },
    });
  });

  it('refuses a unit name that is not a plain name', async () => {
    expect(await get(build([]), '/v1/rooms/a%23b')).toMatchObject({
      statusCode: 400,
      body: { error: { code: 'bad_parameter', param: 'roomId' } },
    });
  });

  it('is not found where no room data is wired', async () => {
    const bare = createRouter({
      stationRepo: fixtureStationRepo(),
      forecastRepo: fixtureForecastRepo(),
      fireRepo: fixtureFireRepo(),
      clock: fixedClock(NOW),
      mode: 'model',
      linkStore: fixtureLinkStore(),
      telegram: { botToken: 'T', webhookSecret: 'S' },
    });
    expect(await get(bare, '/v1/rooms/dev')).toMatchObject({
      statusCode: 404,
      body: { error: { code: 'not_found' } },
    });
  });
});
