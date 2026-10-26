import { describe, expect, it } from 'vitest';
import type { Batch } from './analyticsModel';
import { memoryAnalyticsStore } from './analyticsStore';

const DAY1 = '2026-10-26T06:00:00.000Z';
const DAY2 = '2026-10-27T06:00:00.000Z';

const batch = (
  deviceId: string,
  over: { platform?: 'web' | 'android'; cell?: { lat: number; lng: number }; at?: string; events?: Batch['events'] } = {},
): Batch => ({
  deviceId,
  sessionId: `ses-${deviceId}`,
  device: {
    platform: over.platform ?? 'android',
    appVersion: '0.1.0',
    os: 'Android 14',
    model: 'Pixel',
    screen: '360x800',
    lang: 'en',
    ...(over.cell ? { cell: over.cell } : {}),
  },
  events: over.events ?? [
    { kind: 'session_start', detail: '', n: 1, at: over.at ?? DAY1 },
    { kind: 'feature', detail: 'search', n: 1, at: over.at ?? DAY1 },
    { kind: 'active', detail: '', n: 30, at: over.at ?? DAY1 },
  ],
});

describe('analytics store', () => {
  it('counts one user per device per day but every session', async () => {
    const store = createStore();
    await store.record({ batch: batch('dev-aaaaaaaa'), now: DAY1 });
    await store.record({ batch: batch('dev-aaaaaaaa'), now: DAY1 });
    const [day] = await store.summary(1, DAY1);
    expect(day).toMatchObject({ users: 1, sessions: 2, activeSeconds: 60 });
    expect(day?.features['feature:search']).toBe(2);
  });

  it('calls a device new on its first day and returning later', async () => {
    const store = createStore();
    await store.record({ batch: batch('dev-aaaaaaaa'), now: DAY1 });
    await store.record({ batch: batch('dev-aaaaaaaa', { at: DAY2 }), now: DAY2 });
    const rows = await store.groups('visitor', 7, DAY2);
    expect(Object.fromEntries(rows.map((r) => [r.value, r.sessions]))).toEqual({ new: 1, returning: 1 });
  });

  it('splits groups by platform and region, and anonymous counts in the totals', async () => {
    const store = createStore();
    await store.record({ batch: batch('dev-aaaaaaaa', { cell: { lat: 12.97, lng: 77.59 } }), now: DAY1 });
    await store.record({
      batch: batch('dev-bbbbbbbb', { platform: 'web' }),
      userId: 'u1',
      email: 'a@b.com',
      now: DAY1,
    });
    const platforms = await store.groups('platform', 1, DAY1);
    expect(platforms.map((r) => r.value).sort()).toEqual(['android', 'web']);
    const regions = await store.groups('region', 1, DAY1);
    expect(regions.map((r) => r.value).sort()).toEqual(['Bengaluru', 'Unknown']);
    const auth = await store.groups('auth', 1, DAY1);
    expect(auth.map((r) => r.value).sort()).toEqual(['anonymous', 'signed_in']);
    expect((await store.summary(1, DAY1))[0]?.users).toBe(2);
    expect((await store.accounts(10)).map((a) => a.email)).toEqual(['a@b.com']);
  });

  it('keeps a signed-in timeline, newest first, and removes it with the account', async () => {
    const store = createStore();
    const events: Batch['events'] = [
      { kind: 'session_start', detail: '', n: 1, at: '2026-10-26T06:00:00.000Z' },
      { kind: 'feature', detail: 'add_place', n: 1, at: '2026-10-26T06:01:00.000Z' },
    ];
    await store.record({ batch: batch('dev-aaaaaaaa', { events }), userId: 'u1', email: 'a@b.com', now: DAY1 });
    const found = await store.account('u1', 10);
    expect(found?.events.map((e) => e.detail)).toEqual(['add_place', '']);
    expect(found?.row.firstPlaceAt).toBe('2026-10-26T06:01:00.000Z');
    await store.removeUser('u1');
    expect(await store.account('u1', 10)).toBeUndefined();
    expect((await store.summary(1, DAY1))[0]?.sessions).toBe(1);
  });

  it('keeps error samples and an anonymous device never gets a timeline', async () => {
    const store = createStore();
    const events: Batch['events'] = [{ kind: 'error', detail: 'boom', n: 1, at: DAY1 }];
    await store.record({ batch: batch('dev-aaaaaaaa', { events }), now: DAY1 });
    expect((await store.errors(10, DAY1))[0]).toMatchObject({ detail: 'boom', platform: 'android' });
    expect(await store.accounts(10)).toEqual([]);
  });
});

function createStore(): ReturnType<typeof memoryAnalyticsStore> {
  return memoryAnalyticsStore();
}
