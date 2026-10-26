import { fixedClock } from '@vayu/core';
import { describe, expect, it } from 'vitest';
import { handleAdmin } from './adminRoute';
import { memoryAnalyticsStore, type AnalyticsStore } from './analyticsStore';
import type { ApiRequest } from './respond';

const ADMIN = 'owner@example.com';
const PATHS = [
  '/v1/admin/whoami',
  '/v1/admin/summary',
  '/v1/admin/groups?by=platform',
  '/v1/admin/groups?by=band',
  '/v1/admin/journey',
  '/v1/admin/users',
  '/v1/admin/users/u1',
  '/v1/admin/errors',
  '/v1/admin/nothing',
];

const call = (
  store: AnalyticsStore,
  url: string,
  extra: Partial<ApiRequest> = {},
  method = 'GET',
): ReturnType<typeof handleAdmin> => {
  const [path = '', qs = ''] = url.split('?');
  return handleAdmin(
    { method, path, query: Object.fromEntries(new URLSearchParams(qs)), headers: {}, ...extra },
    { store, clock: fixedClock('2026-10-26T10:00:00.000Z'), admins: [ADMIN] },
  );
};

/** A store that fails the test if anything reads from it. */
const tripwire = new Proxy({} as AnalyticsStore, {
  get: (_t, name) => () => {
    throw new Error(`store.${String(name)} was called`);
  },
});

describe('admin routes', () => {
  it('refuses a signed-in non-admin on every path and never reads data', async () => {
    for (const url of PATHS) {
      const res = await call(tripwire, url, { userId: 'u9', email: 'user@example.com', emailVerified: true });
      expect(res.statusCode, url).toBe(403);
    }
  });

  it('refuses an admin address that is not verified, and no sign-in at all', async () => {
    expect((await call(tripwire, '/v1/admin/summary', { userId: 'u1', email: ADMIN })).statusCode).toBe(403);
    expect((await call(tripwire, '/v1/admin/summary')).statusCode).toBe(401);
  });

  it('answers a verified admin, and is shut to non-GET and unknown paths', async () => {
    const store = memoryAnalyticsStore();
    const admin = { userId: 'u1', email: ADMIN, emailVerified: true };
    expect((await call(store, '/v1/admin/whoami', admin)).body).toEqual({ admin: true });
    expect((await call(store, '/v1/admin/summary?days=9999', admin)).statusCode).toBe(200);
    const summary = (await call(store, '/v1/admin/summary?days=9999', admin)).body as { days: unknown[] };
    expect(summary.days).toHaveLength(90);
    expect((await call(store, '/v1/admin/groups?by=region', admin)).statusCode).toBe(200);
    expect((await call(store, '/v1/admin/groups?by=bogus', admin)).statusCode).toBe(400);
    expect((await call(store, '/v1/admin/users/u1', admin)).statusCode).toBe(404);
    expect((await call(store, '/v1/admin/nothing', admin)).statusCode).toBe(404);
    expect((await call(store, '/v1/admin/summary', admin, 'POST')).statusCode).toBe(405);
  });
});
