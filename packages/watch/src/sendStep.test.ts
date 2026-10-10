import type { PutCommand } from '@aws-sdk/lib-dynamodb';
import { fixedClock } from '@vayu/core';
import { describe, expect, it, vi } from 'vitest';
import { inAppAdapter, type ChannelAdapter } from './adapters';
import { fixtureAlert } from './fixtures';
import { SendsDisabledError, sendStep, type SendStepDeps } from './sendStep';
import { dynamoTokenStore, fixtureTokenStore } from './tokenStore';

const clock = fixedClock('2026-10-05T06:00:00.000Z');
const INPUT = {
  alert: fixtureAlert({ id: 'a1' }),
  step: { index: 0, action: 'send', to: 'principal' },
  taskToken: 'TOKEN-1',
};

function deps(
  overrides: Partial<SendStepDeps> = {},
): SendStepDeps & { sent: ReturnType<typeof inAppAdapter> } {
  const sent = inAppAdapter(clock);
  return {
    adapter: sent,
    tokens: fixtureTokenStore(),
    clock,
    sendsEnabled: () => Promise.resolve(true),
    sent,
    ...overrides,
  };
}

describe('sendStep', () => {
  it('stores the task token, then sends with the step context', async () => {
    const d = deps();
    const send = vi.spyOn(d.adapter, 'send');
    await sendStep(d, INPUT);
    expect(await d.tokens.getToken('a1')).toBe('TOKEN-1');
    expect(send).toHaveBeenCalledWith(INPUT.alert, 'principal', {
      step: '0-send',
      action: 'send',
    });
  });

  it('kill switch: stores nothing and sends nothing when sends are off', async () => {
    const d = deps({ sendsEnabled: () => Promise.resolve(false) });
    await expect(sendStep(d, INPUT)).rejects.toBeInstanceOf(SendsDisabledError);
    expect(await d.tokens.getToken('a1')).toBeNull();
    expect(d.sent.sent).toHaveLength(0);
  });

  it('drops the token and rethrows when the send fails, so the loop can move on', async () => {
    const failing: ChannelAdapter = {
      channel: 'x',
      send: () => Promise.reject(new Error('Telegram down')),
    };
    const d = deps({ adapter: failing });
    await expect(sendStep(d, INPUT)).rejects.toThrow('Telegram down');
    expect(await d.tokens.getToken('a1')).toBeNull();
  });

  it('a later step overwrites the token, so a tap resumes the step that is waiting now', async () => {
    const d = deps();
    await sendStep(d, INPUT);
    await sendStep(d, {
      ...INPUT,
      step: { index: 1, action: 'remind', to: 'principal' },
      taskToken: 'TOKEN-2',
    });
    expect(await d.tokens.getToken('a1')).toBe('TOKEN-2');
  });
});

describe('dynamoTokenStore', () => {
  it('writes one CURRENT token per alert with a 7-day epoch TTL, and reads it back', async () => {
    const send = vi.fn().mockResolvedValue({ Item: { token: 'T' } });
    const store = dynamoTokenStore({ tableName: 'Watch', docClient: { send } as never });
    await store.saveToken('a1', 'T', 1_000_000_000_000);
    const put = send.mock.calls[0]?.[0] as PutCommand;
    expect(put.input.Item).toEqual({
      pk: 'TOKEN#a1',
      sk: 'CURRENT',
      token: 'T',
      expiresAt: 1_000_000_000 + 604_800,
    });
    expect(await store.getToken('a1')).toBe('T');
  });

  it('returns null when no token is stored', async () => {
    const store = dynamoTokenStore({
      tableName: 'Watch',
      docClient: { send: vi.fn().mockResolvedValue({}) } as never,
    });
    expect(await store.getToken('nope')).toBeNull();
  });
});
