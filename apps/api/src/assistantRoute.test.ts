import type { SSMClient } from '@aws-sdk/client-ssm';
import { fixedClock } from '@vayu/core';
import { describe, expect, it, vi } from 'vitest';
import { ASSISTANT_LIMITS } from './assistantAgent';
import { handleAssistant } from './assistantRoute';
import { ssmSwitch } from './killSwitch';
import { memoryQuota } from './quota';

const context = {
  place: 'Home',
  aqi: 158,
  level: 'Unhealthy',
  pm25: 65.4,
  grapStage: 0,
  alerts: [],
  people: [],
  basis: 'From GK1, 4.2 km away, 40 minutes old',
};

const setup = (
  enabled = true,
): {
  reword: ReturnType<typeof vi.fn>;
  grounded: ReturnType<typeof vi.fn>;
  quota: ReturnType<typeof memoryQuota>;
  post: (body: unknown, ip?: string, method?: string) => ReturnType<typeof handleAssistant>;
} => {
  const reword = vi.fn(() => Promise.reject(new Error('off')));
  const grounded = vi.fn(() => Promise.reject(new Error('off')));
  const quota = memoryQuota();
  const deps = {
    reword,
    grounded,
    enabled: () => Promise.resolve(enabled),
    quota,
    clock: fixedClock('2026-10-10T12:00:00.000Z'),
    salt: 'pepper',
  };
  const post = (
    body: unknown,
    ip = '1.2.3.4',
    method = 'POST',
  ): ReturnType<typeof handleAssistant> =>
    handleAssistant(
      {
        method,
        path: '/v1/assistant',
        query: {},
        headers: {},
        body: typeof body === 'string' ? body : JSON.stringify(body),
        sourceIp: ip,
      },
      deps,
    );
  return { reword, grounded, quota, post };
};
const ask = { question: 'Do I need a mask?', context };

describe('POST /v1/assistant', () => {
  it('answers from the rules when the model is not available, with the same numbers', async () => {
    const { post } = setup();
    const response = await post(ask);
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({ source: 'rules', basis: context.basis });
    expect((response.body as { text: string }).text).toContain('AQI 158');
  });

  it('is off when the kill switch is off: no call to the model, and a status the app understands', async () => {
    const { post, reword, grounded } = setup(false);
    expect(await post(ask)).toMatchObject({
      statusCode: 503,
      body: { error: { code: 'assistant_off' } },
    });
    expect(reword).not.toHaveBeenCalled();
    expect(grounded).not.toHaveBeenCalled();
  });

  it('refuses anything outside the contract before it reaches the model: extra fields, out-of-range facts, long questions', async () => {
    const { post, reword } = setup();
    for (const bad of [
      { ...ask, extra: 1 },
      { ...ask, context: { ...context, aqi: 9000 } },
      {
        ...ask,
        context: {
          ...context,
          people: Array.from({ length: 9 }, () => ({ name: 'A', age: 3, day: 'none' })),
        },
      },
      { ...ask, context: { ...context, place: 'x'.repeat(100) } },
      { question: 'x'.repeat(ASSISTANT_LIMITS.maxQuestionChars + 1), context },
      { question: '', context },
    ]) {
      const response = await post(bad);
      expect(response.statusCode, JSON.stringify(bad).slice(0, 80)).toBe(400);
    }
    expect(await post('not json')).toMatchObject({
      statusCode: 400,
      body: { error: { code: 'invalid_body' } },
    });
    expect(await post({ ...ask, pad: 'x'.repeat(5000) })).toMatchObject({ statusCode: 413 });
    expect(reword).not.toHaveBeenCalled();
  });

  it('rule I15: stops one caller after forty questions a day, and everyone after fifteen hundred', async () => {
    const { post } = setup();
    for (let i = 0; i < ASSISTANT_LIMITS.perCallerPerDay; i++)
      expect((await post(ask)).statusCode).toBe(200);
    expect(await post(ask)).toMatchObject({
      statusCode: 429,
      body: { error: { code: 'too_many_requests' } },
    });
    // Another caller still gets in.
    expect((await post(ask, '5.6.7.8')).statusCode).toBe(200);

    const crowd = setup();
    for (let i = 0; i < ASSISTANT_LIMITS.perDay; i++)
      await crowd.post(ask, `10.${String(Math.floor(i / 250))}.${String(i % 250)}.1`);
    expect(await crowd.post(ask, '9.9.9.9')).toMatchObject({
      statusCode: 429,
      body: { error: { code: 'busy' } },
    });
  });

  it('only takes a POST', async () => {
    expect((await setup().post(ask, '1.2.3.4', 'GET')).statusCode).toBe(405);
  });
});

describe('the kill switch', () => {
  const client = (
    values: (string | Error)[],
  ): { send: ReturnType<typeof vi.fn> } & Pick<SSMClient, 'send'> => ({
    send: vi.fn(() => {
      const next = values.shift();
      return next instanceof Error
        ? Promise.reject(next)
        : Promise.resolve({ Parameter: { Value: next } });
    }),
  });

  it('is on only for the exact value true', async () => {
    for (const [value, on] of [
      ['true', true],
      ['false', false],
      ['TRUE', false],
      ['yes', false],
      ['', false],
    ] as const) {
      const flag = ssmSwitch('/vayu/assistant/enabled', client([value]));
      expect(await flag(), value).toBe(on);
    }
  });

  it('is off when it cannot be read: it fails closed', async () => {
    const flag = ssmSwitch('/vayu/assistant/enabled', client([new Error('denied')]));
    expect(await flag()).toBe(false);
  });

  it('is read once a minute, not on every request', async () => {
    let now = 0;
    const c = client(['true', 'false']);
    const flag = ssmSwitch('/x', c, 60_000, () => now);
    expect(await flag()).toBe(true);
    now = 30_000;
    expect(await flag()).toBe(true);
    expect(c.send).toHaveBeenCalledTimes(1);
    now = 61_000;
    expect(await flag()).toBe(false);
  });
});
