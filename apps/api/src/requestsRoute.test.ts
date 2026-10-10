import { fixedClock } from '@vayu/core';
import { describe, expect, it } from 'vitest';
import { memoryQuota } from './quota';
import { handleRequests, REQUESTS_PER_CALLER_PER_DAY, REQUESTS_PER_DAY } from './requestsRoute';

const good = {
  who: 'school',
  name: 'Meera',
  organisation: 'Sunrise Public School',
  area: 'Dwarka, Delhi',
  contact: 'meera@example.org',
  wants: ['demo', 'monitors'],
  places: '12',
};

const setup = (): {
  saved: unknown[];
  quota: ReturnType<typeof memoryQuota>;
  post: (body: unknown, ip?: string, method?: string) => ReturnType<typeof handleRequests>;
} => {
  const saved: unknown[] = [];
  const quota = memoryQuota();
  const deps = {
    save: (id: string, request: unknown) => {
      saved.push({ id, request });
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
      handleRequests(
        {
          method,
          path: '/v1/requests',
          query: {},
          headers: {},
          body: typeof body === 'string' ? body : JSON.stringify(body),
          sourceIp: ip,
        },
        deps,
      ),
  };
};

describe('POST /v1/requests', () => {
  it('keeps a good request and says it was received', async () => {
    const { post, saved } = setup();
    const response = await post(good);
    expect(response).toMatchObject({ statusCode: 200, body: { received: true } });
    expect(saved).toHaveLength(1);
  });

  it('keeps no address: only a hash that changes each day is used for the daily limit', async () => {
    const { post, saved, quota } = setup();
    await post(good, '203.0.113.9');
    expect(JSON.stringify(saved)).not.toContain('203.0.113.9');
    expect(quota.used('requests#all#2026-10-10')).toBe(1);
  });

  it('says what is wrong, and which field, for each way a request can be bad', async () => {
    const { post, saved } = setup();
    for (const [change, param] of [
      [{ name: '' }, 'name'],
      [{ organisation: '' }, 'organisation'],
      [{ contact: '12345' }, 'contact'],
      [{ wants: [] }, 'wants'],
      [{ who: 'company' }, 'who'],
      [{ places: 'lots' }, 'places'],
    ] as const) {
      const response = await post({ ...good, ...change });
      expect(response, JSON.stringify(change)).toMatchObject({
        statusCode: 400,
        body: { error: { code: 'invalid_request', param } },
      });
    }
    expect(saved).toHaveLength(0);
  });

  it('lets a person ask without an organisation, and refuses extra fields', async () => {
    const { post } = setup();
    expect((await post({ ...good, who: 'person', organisation: '' })).statusCode).toBe(200);
    expect((await post({ ...good, admin: true })).statusCode).toBe(400);
  });

  it('refuses a body that is not JSON, or is too large', async () => {
    const { post } = setup();
    expect(await post('not json')).toMatchObject({
      statusCode: 400,
      body: { error: { code: 'invalid_body' } },
    });
    expect(await post({ ...good, area: 'x'.repeat(5000) })).toMatchObject({ statusCode: 413 });
  });

  it('rule I15: stops one caller after five a day, and everyone after two hundred', async () => {
    const { post, saved } = setup();
    for (let i = 0; i < REQUESTS_PER_CALLER_PER_DAY; i++)
      expect((await post({ ...good, name: `N${String(i)}` })).statusCode).toBe(200);
    expect(await post(good)).toMatchObject({
      statusCode: 429,
      body: { error: { code: 'too_many_requests' } },
    });
    expect(saved).toHaveLength(REQUESTS_PER_CALLER_PER_DAY);

    const crowd = setup();
    for (let i = 0; i < REQUESTS_PER_DAY; i++)
      await crowd.post(
        { ...good, name: `P${String(i)}` },
        `10.0.${String(Math.floor(i / 200))}.${String(i)}`,
      );
    expect(await crowd.post(good, '9.9.9.9')).toMatchObject({
      statusCode: 429,
      body: { error: { code: 'busy' } },
    });
    expect(crowd.saved).toHaveLength(REQUESTS_PER_DAY);
  });

  it('only takes a POST', async () => {
    expect((await setup().post(good, '1.2.3.4', 'GET')).statusCode).toBe(405);
  });
});
