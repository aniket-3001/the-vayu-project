import { fixedClock } from '@vayu/core';
import { describe, expect, it } from 'vitest';
import { handleAdmin } from './adminRoute';
import { milestoneOf, parseBatch, type AnalyticsEvent, type Batch } from './analyticsModel';
import { createAnalyticsStore, memoryBackend } from './analyticsStore';

const at = (day: string): string => `${day}T06:00:00.000Z`;

const batchOf = (deviceId: string, events: readonly AnalyticsEvent[], session = 'ses-aaaaaaaa'): Batch => ({
  deviceId,
  sessionId: session,
  device: { platform: 'android', appVersion: '0.1.0', os: 'Android 14', model: 'Pixel', screen: '360x800', lang: 'en' },
  events,
});
const ev = (kind: AnalyticsEvent['kind'], detail: string, day: string, extra: Partial<AnalyticsEvent> = {}): AnalyticsEvent => ({
  kind,
  detail,
  n: 1,
  at: at(day),
  ...extra,
});
const visit = (deviceId: string, day: string, extra: AnalyticsEvent[] = []): Batch =>
  batchOf(deviceId, [ev('session_start', '', day), ...extra]);

describe('the new event details', () => {
  const base = {
    deviceId: 'dev-12345678',
    sessionId: 'ses-12345678',
    device: { platform: 'web', appVersion: '0.1.0' },
  };
  const parse = (events: unknown[]): ReturnType<typeof parseBatch> => parseBatch({ ...base, events });
  const when = '2026-10-26T10:00:00.000Z';

  it('takes a band on an event, and the welcome steps', () => {
    const out = parse([
      { kind: 'feature', detail: 'search', n: 1, at: when, band: 'hazardous' },
      { kind: 'screen', detail: 'welcome', n: 1, at: when },
      { kind: 'feature', detail: 'welcome_code_step', n: 1, at: when },
      { kind: 'context', detail: 'very_bad', n: 1, at: when },
    ]);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.batch.events[0]?.band).toBe('hazardous');
  });

  it('drops a band it does not know instead of refusing the batch, and refuses a context it does not know', () => {
    const odd = parse([{ kind: 'feature', detail: 'search', n: 1, at: when, band: 'purple' }]);
    expect(odd.ok).toBe(true);
    if (odd.ok) expect(odd.batch.events[0]).not.toHaveProperty('band');
    expect(parse([{ kind: 'context', detail: 'my own words', n: 1, at: when }]).ok).toBe(false);
    expect(parse([{ kind: 'feature', detail: 'welcome_whatever', n: 1, at: when }]).ok).toBe(false);
  });

  it('names the milestones an event reaches', () => {
    expect(milestoneOf('feature', 'add_place')).toBe('first_place');
    expect(milestoneOf('screen', 'map')).toBe('first_map');
    expect(milestoneOf('bluetooth', 'connect:ok')).toBe('first_unit');
    expect(milestoneOf('bluetooth', 'connect:fail')).toBeUndefined();
    expect(milestoneOf('screen', 'myair')).toBeUndefined();
  });
});

describe('air context', () => {
  it('counts sessions by the band they saw and activity by the band it happened in', async () => {
    const store = createAnalyticsStore(memoryBackend());
    const now = at('2026-10-26');
    await store.record({
      batch: batchOf('dev-aaaaaaaa', [
        ev('session_start', '', '2026-10-26'),
        ev('context', 'hazardous', '2026-10-26'),
        ev('feature', 'search', '2026-10-26', { band: 'hazardous' }),
        ev('feature', 'search', '2026-10-26', { band: 'hazardous' }),
        ev('active', '', '2026-10-26', { n: 40, band: 'hazardous' }),
      ]),
      now,
    });
    await store.record({
      batch: batchOf(
        'dev-bbbbbbbb',
        [
          ev('session_start', '', '2026-10-26'),
          ev('context', 'good', '2026-10-26'),
          ev('screen', 'map', '2026-10-26', { band: 'good' }),
          ev('feature', 'search', '2026-10-26'), // before any air loaded: no band
        ],
        'ses-bbbbbbbb',
      ),
      now,
    });
    const rows = await store.groups('band', 1, now);
    const hazardous = rows.find((r) => r.value === 'hazardous');
    const good = rows.find((r) => r.value === 'good');
    expect(hazardous).toMatchObject({ sessions: 1, users: 0, activeSeconds: 40 });
    expect(hazardous?.features['feature:search']).toBe(2);
    expect(good?.features).toEqual({ 'screen:map': 1 });
    expect(rows.find((r) => r.value === 'unknown')).toBeUndefined();
    // The ordinary views are not changed by it.
    const [day] = await store.summary(1, now);
    expect(day).toMatchObject({ sessions: 2, users: 2, activeSeconds: 40 });
    expect(day?.features['feature:search']).toBe(3);
    expect(day?.features['context:good']).toBeUndefined();
  });
});

describe('journey: milestones and retention', () => {
  // Friday 30 October 2026; its week starts on Monday the 26th.
  const today = at('2026-10-30');

  it('groups new devices by week and counts what they reached', async () => {
    const store = createAnalyticsStore(memoryBackend());
    await store.record({ batch: visit('dev-aaaaaaaa', '2026-10-26', [ev('feature', 'add_place', '2026-10-26')]), now: at('2026-10-26') });
    await store.record({ batch: visit('dev-bbbbbbbb', '2026-10-27', [ev('screen', 'map', '2026-10-27')]), now: at('2026-10-27') });
    await store.record({ batch: visit('dev-cccccccc', '2026-10-19'), now: at('2026-10-19') });
    const [thisWeek, lastWeek] = await store.journey(2, today);
    expect(thisWeek).toMatchObject({ week: '2026-10-26', size: 2 });
    expect(thisWeek?.milestones).toMatchObject({ first_place: 1, first_map: 1, first_search: 0 });
    expect(lastWeek).toMatchObject({ week: '2026-10-19', size: 1 });
  });

  it('counts a return only once its window has fully passed, with the counts behind it', async () => {
    const store = createAnalyticsStore(memoryBackend());
    // A comes back the next day. B never does. C is new today. D (two weeks earlier) comes back on day 3.
    await store.record({ batch: visit('dev-aaaaaaaa', '2026-10-26'), now: at('2026-10-26') });
    await store.record({ batch: visit('dev-aaaaaaaa', '2026-10-27'), now: at('2026-10-27') });
    await store.record({ batch: visit('dev-bbbbbbbb', '2026-10-26'), now: at('2026-10-26') });
    await store.record({ batch: visit('dev-cccccccc', '2026-10-30'), now: today });
    await store.record({ batch: visit('dev-dddddddd', '2026-10-12'), now: at('2026-10-12') });
    await store.record({ batch: visit('dev-dddddddd', '2026-10-15'), now: at('2026-10-15') });
    const [thisWeek, , twoWeeksAgo] = await store.journey(3, today);
    // 26 Oct cohort (A, B) and the 30th (C): C's next day is not over yet, so it is not counted.
    expect(thisWeek?.d1).toEqual({ eligible: 2, returned: 1 });
    expect(thisWeek?.d7).toEqual({ eligible: 0, returned: 0 }); // 7 days have not passed for anyone yet
    // The cohort of 12 Oct: D came back on day 3, inside 7 days; its 30 days are not over.
    expect(twoWeeksAgo).toMatchObject({ week: '2026-10-12', size: 1 });
    expect(twoWeeksAgo?.d1).toEqual({ eligible: 1, returned: 0 });
    expect(twoWeeksAgo?.d7).toEqual({ eligible: 1, returned: 1 });
    expect(twoWeeksAgo?.d30).toEqual({ eligible: 0, returned: 0 });
  });

  it('remembers who signed in, with no account id on the record', async () => {
    const backend = memoryBackend();
    const store = createAnalyticsStore(backend);
    await store.record({ batch: visit('dev-aaaaaaaa', '2026-10-26'), now: at('2026-10-26') });
    await store.record({ batch: visit('dev-aaaaaaaa', '2026-10-27'), userId: 'user-1', email: 'a@example.com', now: at('2026-10-27') });
    const [week] = await store.journey(1, today);
    expect(week).toMatchObject({ size: 1, signedIn: 1 });
    expect(week?.milestones.first_signed_in).toBe(1);
    const record = await backend.get('COHORT#2026-10-26', 'dev-aaaaaaaa');
    expect(JSON.stringify(record)).not.toContain('user-1');
    expect(JSON.stringify(record)).not.toContain('a@example.com');
  });

  it('leaves out a device first seen before cohorts existed, whose early days are unknown', async () => {
    const backend = memoryBackend();
    await backend.put('DEV#dev-oldoldold', 'PROFILE', { firstSeenDay: '2026-10-26', firstSeen: at('2026-10-26') }, 0);
    const store = createAnalyticsStore(backend);
    await store.record({ batch: visit('dev-oldoldold', '2026-10-28'), now: at('2026-10-28') });
    await store.record({ batch: visit('dev-newnewnew', '2026-10-28'), now: at('2026-10-28') });
    const [week] = await store.journey(1, today);
    expect(week?.size).toBe(1);
  });

  it('keeps what was first reached, not the latest', async () => {
    const backend = memoryBackend();
    const store = createAnalyticsStore(backend);
    await store.record({ batch: visit('dev-aaaaaaaa', '2026-10-26', [ev('feature', 'search', '2026-10-26')]), now: at('2026-10-26') });
    await store.record({ batch: visit('dev-aaaaaaaa', '2026-10-28', [ev('feature', 'search', '2026-10-28')]), now: at('2026-10-28') });
    const record = await backend.get('COHORT#2026-10-26', 'dev-aaaaaaaa');
    expect((record?.m as Record<string, string>).first_search).toBe(at('2026-10-26'));
    expect(record?.days).toEqual(['2026-10-26', '2026-10-28']);
  });
});

describe('GET /v1/admin/journey', () => {
  const admin = 'owner@example.com';
  const call = async (path: string, email = admin): ReturnType<typeof handleAdmin> => {
    const store = createAnalyticsStore(memoryBackend());
    await store.record({ batch: visit('dev-aaaaaaaa', '2026-10-26'), now: at('2026-10-26') });
    return handleAdmin(
      {
        method: 'GET',
        path: path.split('?')[0] ?? path,
        query: Object.fromEntries(new URLSearchParams(path.split('?')[1] ?? '')),
        headers: {},
        body: '',
        sourceIp: '1.2.3.4',
        userId: 'u1',
        email,
        emailVerified: true,
      },
      { store, clock: fixedClock(at('2026-10-30')), admins: [admin] },
    );
  };

  it('answers an admin with the cohorts, newest week first', async () => {
    const res = await call('/v1/admin/journey?weeks=2');
    expect(res.statusCode).toBe(200);
    const body = res.body as { cohorts: { week: string; size: number }[] };
    expect(body.cohorts.map((c) => c.week)).toEqual(['2026-10-26', '2026-10-19']);
    expect(body.cohorts[0]?.size).toBe(1);
  });

  it('keeps the number of weeks sensible', async () => {
    const huge = (await call('/v1/admin/journey?weeks=9999')).body as { cohorts: unknown[] };
    expect(huge.cohorts).toHaveLength(13);
    const odd = (await call('/v1/admin/journey?weeks=abc')).body as { cohorts: unknown[] };
    expect(odd.cohorts).toHaveLength(8);
  });

  it('refuses anyone who is not an admin', async () => {
    expect((await call('/v1/admin/journey', 'someone@example.com')).statusCode).toBe(403);
  });
});
