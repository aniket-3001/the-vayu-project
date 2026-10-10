import type { FixCheckResult } from '@vayu/contracts';
import { fixedClock } from '@vayu/core';
import { fixtureFireRepo, fixtureForecastRepo, fixtureStationRepo } from '@vayu/data';
import { fixtureLinkStore } from '@vayu/watch';
import { describe, expect, it } from 'vitest';
import type { FixCheckStore, StartOutcome } from './fixCheck';
import { createRouter } from './routes';

const record: FixCheckResult = {
  fixCheckId: 'dev-1',
  roomId: 'dev',
  startedAt: '2026-10-08T10:00:00.000Z',
  status: 'improved',
  baselinePm25: 200,
  latestPm25: 90,
  dropPct: 55,
  tries: 1,
  escalate: false,
  finishedAt: '2026-10-08T10:05:00.000Z',
  simulated: true,
};
const store: FixCheckStore = {
  create: () => Promise.resolve('created'),
  get: (id) => Promise.resolve(id === 'dev-1' ? record : undefined),
  save: () => Promise.resolve(),
};

function build(outcome: StartOutcome = { kind: 'started', fixCheckId: 'dev-1' }): {
  route: ReturnType<typeof createRouter>;
  asked: unknown[];
} {
  const asked: unknown[] = [];
  const route = createRouter({
    stationRepo: fixtureStationRepo(),
    forecastRepo: fixtureForecastRepo(),
    fireRepo: fixtureFireRepo(),
    clock: fixedClock('2026-10-08T10:00:00.000Z', 'live'),
    mode: 'live',
    linkStore: fixtureLinkStore(),
    telegram: { botToken: 'T', webhookSecret: 'S' },
    fixChecks: {
      store,
      start: (input) => {
        asked.push(input);
        return Promise.resolve(outcome);
      },
    },
  });
  return { route, asked };
}
const post = (
  route: ReturnType<typeof createRouter>,
  body: unknown,
): ReturnType<ReturnType<typeof createRouter>> =>
  route({
    method: 'POST',
    path: '/v1/fixchecks',
    query: {},
    headers: {},
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('POST /v1/fixchecks', () => {
  it('starts a run and answers 202 with its id, defaulting to the school and a five-minute wait', async () => {
    const { route, asked } = build();
    const response = await post(route, { roomId: 'dev' });
    expect(response).toEqual({
      statusCode: 202,
      body: { fixCheckId: 'dev-1', status: 'waiting', alreadyRunning: false },
    });
    expect(asked).toEqual([{ roomId: 'dev', placeId: 'school', waitSeconds: 300 }]);
  });

  it('passes the place and wait the caller asked for', async () => {
    const { route, asked } = build();
    await post(route, { roomId: 'dev', place: 'park', waitSeconds: 60 });
    expect(asked).toEqual([{ roomId: 'dev', placeId: 'park', waitSeconds: 60 }]);
  });

  it('says it is already running when asked twice', async () => {
    const { route } = build({ kind: 'exists', fixCheckId: 'dev-1' });
    expect((await post(route, { roomId: 'dev' })).body).toMatchObject({ alreadyRunning: true });
  });

  it('names the field at fault: a bad wait, a room that is not reporting, a bad name, an unknown place, bad JSON', async () => {
    const wait = build({
      kind: 'refused',
      code: 'bad_parameter',
      message: 'wait',
      param: 'waitSeconds',
    });
    expect(await post(wait.route, { roomId: 'dev', waitSeconds: 5 })).toMatchObject({
      statusCode: 400,
      body: { error: { code: 'bad_parameter', param: 'waitSeconds' } },
    });
    const quiet = build({ kind: 'refused', code: 'room_not_reporting', message: 'no reading' });
    expect(await post(quiet.route, { roomId: 'ghost' })).toMatchObject({
      statusCode: 409,
      body: { error: { code: 'room_not_reporting' } },
    });
    const { route, asked } = build();
    expect(await post(route, { roomId: 'a#b' })).toMatchObject({
      statusCode: 400,
      body: { error: { code: 'bad_parameter', param: 'roomId' } },
    });
    expect(await post(route, { roomId: 'dev', place: 'moon' })).toMatchObject({
      statusCode: 404,
      body: { error: { code: 'unknown_place', param: 'place' } },
    });
    expect(await post(route, '{not json')).toMatchObject({
      statusCode: 400,
      body: { error: { code: 'invalid_body' } },
    });
    expect(await post(route, { place: 'park' })).toMatchObject({
      statusCode: 400,
      body: { error: { code: 'missing_parameter', param: 'roomId' } },
    });
    expect(asked).toHaveLength(0);
  });
});

describe('GET /v1/fixchecks/{id}', () => {
  it('returns the answer, which passes the contract', async () => {
    const { route } = build();
    expect(
      await route({ method: 'GET', path: '/v1/fixchecks/dev-1', query: {}, headers: {} }),
    ).toEqual({ statusCode: 200, body: record });
  });
  it('says plainly when there is no such run, and refuses an odd id', async () => {
    const { route } = build();
    expect(
      await route({ method: 'GET', path: '/v1/fixchecks/nope', query: {}, headers: {} }),
    ).toMatchObject({
      statusCode: 404,
      body: { error: { code: 'unknown_fixcheck', param: 'fixCheckId' } },
    });
    expect(
      await route({ method: 'GET', path: '/v1/fixchecks/a%23b', query: {}, headers: {} }),
    ).toMatchObject({ statusCode: 400 });
  });
  it('is not found where no workflow is wired, and refuses other methods', async () => {
    const bare = createRouter({
      stationRepo: fixtureStationRepo(),
      forecastRepo: fixtureForecastRepo(),
      fireRepo: fixtureFireRepo(),
      clock: fixedClock('2026-10-08T10:00:00.000Z'),
      mode: 'model',
      linkStore: fixtureLinkStore(),
      telegram: { botToken: 'T', webhookSecret: 'S' },
    });
    expect(
      await bare({ method: 'GET', path: '/v1/fixchecks/dev-1', query: {}, headers: {} }),
    ).toMatchObject({ statusCode: 404, body: { error: { code: 'not_found' } } });
    const { route } = build();
    expect(
      await route({ method: 'DELETE', path: '/v1/fixchecks/dev-1', query: {}, headers: {} }),
    ).toMatchObject({ statusCode: 405 });
    expect(
      await route({ method: 'GET', path: '/v1/fixchecks', query: {}, headers: {} }),
    ).toMatchObject({ statusCode: 405 });
  });
});
