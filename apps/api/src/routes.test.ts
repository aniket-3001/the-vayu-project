import { Timeline } from '@vayu/contracts';
import { fixedClock } from '@vayu/core';
import { fixtureFireRepo, fixtureForecastRepo, fixtureStationRepo } from '@vayu/data';
import { fixtureLinkStore } from '@vayu/watch';
import { describe, expect, it } from 'vitest';
import { createRouter, type ApiRequest, type RouterDeps } from './routes';

const WEBHOOK_SECRET = 'test-webhook-secret';

const baseDeps: RouterDeps = {
  stationRepo: fixtureStationRepo(),
  forecastRepo: fixtureForecastRepo(),
  fireRepo: fixtureFireRepo(),
  clock: fixedClock('2026-10-05T12:00:00.000Z'),
  mode: 'model',
  linkStore: fixtureLinkStore(),
  telegram: { botToken: 'TOKEN', webhookSecret: WEBHOOK_SECRET },
};
const route = createRouter(baseDeps);

const get = (path: string, query: Record<string, string> = {}): ReturnType<typeof route> =>
  route({ method: 'GET', path, query, headers: {} });

describe('the API', () => {
  it('says it is healthy and names its mode', async () => {
    expect(await get('/v1/health')).toEqual({
      statusCode: 200,
      body: { status: 'ok', mode: 'model' },
    });
  });

  it('counts satellite fire detections up to now, labelled as detections not PM2.5', async () => {
    expect(await get('/v1/fires')).toMatchObject({
      statusCode: 200,
      body: {
        asOf: '2026-10-05T12:00:00.000Z',
        source: 'NASA FIRMS satellite fire detections',
        mode: 'model',
        counts: { last24h: 1, last72h: 2 },
      },
    });
  });

  it('reports the fire data mode on its own when it differs from the rest', async () => {
    const live = createRouter({ ...baseDeps, fireMode: 'live' });
    const response = await live({ method: 'GET', path: '/v1/fires', query: {}, headers: {} });
    expect(response.body).toMatchObject({ mode: 'live' });
  });

  it('falls back to the model estimate, labelled so, when no station has a recent reading', async () => {
    const stale = createRouter({
      ...baseDeps,
      mode: 'live',
      stationRepo: {
        stationsNear: () =>
          Promise.resolve([
            { id: 's1', name: 'Old station', lat: 28.61, lng: 77.2, hasPm25: true },
          ]),
        hourlyFor: () =>
          Promise.resolve([{ hourStart: '2026-10-01T00:00:00.000Z', pm25: 60, pm10: null }]),
      },
    });
    const response = await stale({
      method: 'GET',
      path: '/v1/timeline',
      query: { place: 'home' },
      headers: {},
    });
    const timeline = Timeline.parse(response.body);
    expect(timeline.mode).toBe('model');
    expect(timeline.prov.source).toBe('model');
  });

  it('lists the places', async () => {
    expect((await get('/v1/places')).body).toMatchObject({
      places: [{ id: 'home' }, { id: 'school' }, { id: 'office' }, { id: 'park' }],
    });
  });

  it('returns a timeline that satisfies the contract, backed by a real nearest-station lookup, labelled honestly', async () => {
    const response = await get('/v1/timeline', { place: 'home' });
    expect(response.statusCode).toBe(200);
    const timeline = Timeline.parse(response.body);
    expect(timeline.mode).toBe('model');
    expect(timeline.prov.source).toBe('station'); // the fixture set has a station near every demo place
    expect(timeline.prov.stationName).toMatch(/Sample station near Home/);
    expect(timeline.headline).toMatch(/Good hour for a walk|No clean hour|right now/);
    expect(timeline.hours.every((hour) => hour.prov.simulated === true)).toBe(true);
  });

  it('is deterministic for the same place and clock', async () => {
    expect(await get('/v1/timeline', { place: 'park' })).toEqual(
      await get('/v1/timeline', { place: 'park' }),
    );
  });

  it('answers for the caller’s own coordinates, rounded so a precise address is never used', async () => {
    const response = await get('/v1/timeline', { lat: '28.61234', lng: '77.20987' });
    expect(response.statusCode).toBe(200);
    const timeline = Timeline.parse(response.body);
    expect(timeline.place).toMatchObject({
      id: 'gps',
      name: 'Your location',
      lat: 28.61,
      lng: 77.21,
    });
  });

  it('refuses coordinates that are not numbers or fall outside the area we cover', async () => {
    for (const query of [
      { lat: 'abc', lng: '77.2' },
      { lat: '28.6' },
      { lat: '51.5', lng: '-0.12' },
    ]) {
      expect(await get('/v1/timeline', query)).toMatchObject({
        statusCode: 400,
        body: { error: { code: 'bad_location' } },
      });
    }
  });

  it('answers errors in one shape with a stable code', async () => {
    expect((await get('/v1/timeline')).body).toMatchObject({
      error: { code: 'missing_parameter', param: 'place' },
    });
    expect(await get('/v1/timeline', { place: 'moon' })).toMatchObject({
      statusCode: 404,
      body: { error: { code: 'unknown_place', param: 'place' } },
    });
    expect(await get('/v2/nothing')).toMatchObject({
      statusCode: 404,
      body: { error: { code: 'not_found' } },
    });
    const postRequest: ApiRequest = { method: 'POST', path: '/v1/health', query: {}, headers: {} };
    expect((await route(postRequest)).statusCode).toBe(405);
  });
});

describe('the Telegram webhook route', () => {
  function webhookRouter(
    fetchImpl: typeof fetch,
    onFirstAck?: RouterDeps['onFirstAck'],
  ): ReturnType<typeof createRouter> {
    return createRouter({
      stationRepo: fixtureStationRepo(),
      forecastRepo: fixtureForecastRepo(),
      fireRepo: fixtureFireRepo(),
      clock: fixedClock('2026-10-05T12:00:00.000Z'),
      mode: 'model',
      linkStore: fixtureLinkStore(),
      telegram: { botToken: 'TOKEN', webhookSecret: WEBHOOK_SECRET, fetchImpl },
      ...(onFirstAck === undefined ? {} : { onFirstAck }),
    });
  }

  function fakeTelegramFetch(): { fetchImpl: typeof fetch; calls: string[] } {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = (url) => {
      if (typeof url !== 'string') {
        throw new Error('expected a plain string URL in this test');
      }
      calls.push(url);
      return Promise.resolve(new Response('{}', { status: 200 }));
    };
    return { fetchImpl, calls };
  }

  it('resumes the waiting alert loop on a first-time button tap, once', async () => {
    const { fetchImpl } = fakeTelegramFetch();
    const acks: unknown[] = [];
    const route = webhookRouter(fetchImpl, (ack) => {
      acks.push(ack);
      return Promise.resolve();
    });
    const tap: ApiRequest = {
      method: 'POST',
      path: '/v1/watch/telegram/webhook',
      query: {},
      headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
      body: JSON.stringify({
        callback_query: { id: 'q1', data: 'ack:alert-9:done', message: { chat: { id: 5 } } },
      }),
    };
    expect((await route(tap)).statusCode).toBe(200);
    expect((await route(tap)).statusCode).toBe(200); // a repeat tap
    expect(acks).toEqual([
      { alertId: 'alert-9', chatId: '5', action: 'done', at: '2026-10-05T12:00:00.000Z' },
    ]);
  });

  it('rejects a request with the wrong or missing secret header', async () => {
    const { fetchImpl } = fakeTelegramFetch();
    const webhookRoute = webhookRouter(fetchImpl);

    const request: ApiRequest = {
      method: 'POST',
      path: '/v1/watch/telegram/webhook',
      query: {},
      headers: { 'x-telegram-bot-api-secret-token': 'wrong' },
      body: '{}',
    };
    expect((await webhookRoute(request)).statusCode).toBe(401);
  });

  it('rejects anything but POST', async () => {
    const { fetchImpl } = fakeTelegramFetch();
    const webhookRoute = webhookRouter(fetchImpl);

    const request: ApiRequest = {
      method: 'GET',
      path: '/v1/watch/telegram/webhook',
      query: {},
      headers: {},
    };
    expect((await webhookRoute(request)).statusCode).toBe(405);
  });

  it('rejects a malformed body', async () => {
    const { fetchImpl } = fakeTelegramFetch();
    const webhookRoute = webhookRouter(fetchImpl);

    const request: ApiRequest = {
      method: 'POST',
      path: '/v1/watch/telegram/webhook',
      query: {},
      headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
      body: 'not json',
    };
    expect((await webhookRoute(request)).statusCode).toBe(400);
  });

  it('accepts a valid update and replies through Telegram', async () => {
    const { fetchImpl, calls } = fakeTelegramFetch();
    const webhookRoute = webhookRouter(fetchImpl);

    const request: ApiRequest = {
      method: 'POST',
      path: '/v1/watch/telegram/webhook',
      query: {},
      headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
      body: JSON.stringify({ message: { chat: { id: 1 }, text: '/start' } }),
    };

    const response = await webhookRoute(request);

    expect(response).toEqual({ statusCode: 200, body: { ok: true } });
    expect(calls).toEqual(['https://api.telegram.org/botTOKEN/sendMessage']);
  });
});
