import { fixedClock } from '@vayu/core';
import { describe, expect, it } from 'vitest';
import type { AnalyticsStore } from './analyticsStore';
import { handleEvents } from './eventsRoute';
import { memoryQuota } from './quota';
import type { ApiRequest } from './respond';

const good = {
  deviceId: 'dev-12345678',
  sessionId: 'ses-12345678',
  device: { platform: 'web', appVersion: '0.1.0' },
  events: [{ kind: 'session_start', at: '2026-10-26T10:00:00.000Z' }],
};

const setup = (): {
  recorded: { userId?: string; email?: string }[];
  post: (body: unknown, extra?: Partial<ApiRequest>) => ReturnType<typeof handleEvents>;
  quota: ReturnType<typeof memoryQuota>;
} => {
  const recorded: { userId?: string; email?: string }[] = [];
  const store = {
    record: (a: { userId?: string; email?: string }) => {
      recorded.push(a);
      return Promise.resolve();
    },
  } as unknown as AnalyticsStore;
  const quota = memoryQuota();
  const deps = { store, quota, clock: fixedClock('2026-10-26T10:00:00.000Z'), salt: 'pepper' };
  return {
    recorded,
    quota,
    post: (body, extra = {}) =>
      handleEvents(
        {
          method: 'POST',
          path: '/v1/events',
          query: {},
          headers: {},
          body: typeof body === 'string' ? body : JSON.stringify(body),
          sourceIp: '1.2.3.4',
          ...extra,
        },
        deps,
      ),
  };
};

describe('POST /v1/events', () => {
  it('records an anonymous batch with no identity', async () => {
    const { post, recorded } = setup();
    const res = await post(good);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ accepted: 1 });
    expect(recorded[0]?.userId).toBeUndefined();
  });

  it('ignores a signed-in identity on the public path and a claimed id in the body', async () => {
    const { post, recorded } = setup();
    await post({ ...good, userId: 'someone-else' }, { userId: 'u1' });
    expect(recorded[0]?.userId).toBeUndefined();
  });

  it('records the signed-in person on /v1/me/events, from the checked token only', async () => {
    const { post, recorded } = setup();
    await post({ ...good, userId: 'someone-else' }, { path: '/v1/me/events', userId: 'u1', email: 'a@b.com' });
    expect(recorded[0]).toMatchObject({ userId: 'u1', email: 'a@b.com' });
  });

  it('refuses /v1/me/events without a sign-in', async () => {
    const { post } = setup();
    expect((await post(good, { path: '/v1/me/events' })).statusCode).toBe(401);
  });

  it('refuses bad JSON, oversized bodies, bad batches and other methods', async () => {
    const { post, recorded } = setup();
    expect((await post('{nope')).statusCode).toBe(400);
    expect((await post('x'.repeat(20_001))).statusCode).toBe(413);
    expect((await post({ ...good, events: [{ kind: 'spy', at: good.events[0]?.at }] })).statusCode).toBe(400);
    expect((await post(good, { method: 'GET' })).statusCode).toBe(405);
    expect(recorded).toEqual([]);
  });

  it('says slow down once a device has sent too many today, and records nothing more', async () => {
    const { post, recorded, quota } = setup();
    await quota.take('evt-dev:2026-10-26:dev-12345678', 2000, 100, 2000);
    const res = await post(good);
    expect(res.statusCode).toBe(429);
    expect(recorded).toEqual([]);
  });
});
