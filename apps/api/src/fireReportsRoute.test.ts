import { fixedClock } from '@vayu/core';
import { describe, expect, it } from 'vitest';
import {
  FIRE_REPORTS_PER_CALLER_PER_DAY,
  FIRE_REPORTS_PER_DAY,
  handleFireReports,
} from './fireReportsRoute';
import { memoryQuota } from './quota';

const good = { lat: 30.9, lng: 75.5, hoursAgo: 3, frp: 12.5, note: 'Smoke across the road' };

const setup = (): {
  saved: unknown[];
  quota: ReturnType<typeof memoryQuota>;
  post: (body: unknown, ip?: string, method?: string) => ReturnType<typeof handleFireReports>;
} => {
  const saved: unknown[] = [];
  const quota = memoryQuota();
  const deps = {
    save: (id: string, report: unknown) => {
      saved.push({ id, report });
      return Promise.resolve();
    },
    quota,
    clock: fixedClock('2026-10-10T12:00:00.000Z'),
    salt: 'pepper',
  };
  return {
    saved,
    quota,
    post: (body, ip = '1.2.3.4', method = 'POST') =>
      handleFireReports(
        {
          method,
          path: '/v1/fire-reports',
          query: {},
          headers: {},
          body: typeof body === 'string' ? body : JSON.stringify(body),
          sourceIp: ip,
        },
        deps,
      ),
  };
};

describe('POST /v1/fire-reports', () => {
  it('keeps a good report and says it was received', async () => {
    const { post, saved } = setup();
    expect(await post(good)).toMatchObject({ statusCode: 200, body: { received: true } });
    expect(saved).toHaveLength(1);
  });

  it('takes a place alone, with nothing to add', async () => {
    expect((await setup().post({ lat: 28.6, lng: 77.2 })).statusCode).toBe(200);
  });

  it('keeps no address: only a hash that changes each day is used for the daily limit', async () => {
    const { post, saved, quota } = setup();
    await post(good, '203.0.113.9');
    expect(JSON.stringify(saved)).not.toContain('203.0.113.9');
    expect(quota.used('firereports#all#2026-10-10')).toBe(1);
  });

  it('refuses a place that is not on Earth, a long note, and extra fields', async () => {
    const { post, saved } = setup();
    for (const change of [{ lat: 91 }, { lng: -181 }, { note: 'x'.repeat(201) }, { admin: true }]) {
      const response = await post({ ...good, ...change });
      expect(response, JSON.stringify(change)).toMatchObject({
        statusCode: 400,
        body: { error: { code: 'invalid_request' } },
      });
    }
    expect(saved).toHaveLength(0);
  });

  it('refuses a body that is not JSON, or is too large', async () => {
    const { post } = setup();
    expect(await post('not json')).toMatchObject({ statusCode: 400 });
    expect(await post({ ...good, note: 'x'.repeat(5000) })).toMatchObject({ statusCode: 413 });
  });

  it('rule I15: stops one caller after ten a day, and everyone after five hundred', async () => {
    const { post, saved } = setup();
    for (let i = 0; i < FIRE_REPORTS_PER_CALLER_PER_DAY; i++)
      expect((await post({ ...good, note: `N${String(i)}` })).statusCode).toBe(200);
    expect(await post(good)).toMatchObject({
      statusCode: 429,
      body: { error: { code: 'too_many_requests' } },
    });
    expect(saved).toHaveLength(FIRE_REPORTS_PER_CALLER_PER_DAY);

    const crowd = setup();
    for (let i = 0; i < FIRE_REPORTS_PER_DAY; i++)
      await crowd.post(
        { ...good, note: `P${String(i)}` },
        `10.${String(Math.floor(i / 250))}.${String(i % 250)}.1`,
      );
    expect(await crowd.post(good, '9.9.9.9')).toMatchObject({
      statusCode: 429,
      body: { error: { code: 'busy' } },
    });
  });

  it('only takes a POST', async () => {
    expect((await setup().post(good, '1.2.3.4', 'GET')).statusCode).toBe(405);
  });
});
