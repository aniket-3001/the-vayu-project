import type { GetParameterCommand } from '@aws-sdk/client-ssm';
import { fixedClock } from '@vayu/core';
import {
  StaleTaskTokenError,
  fixtureAlert,
  fixtureLinkStore,
  fixtureTokenStore,
  inAppAdapter,
  telegramAdapter,
} from '@vayu/watch';
import { describe, expect, it, vi } from 'vitest';
import { SendEvent, createSendHandler, withPhrasing } from './sendHandler';
import { sfnSendTaskSuccess, ssmSendsEnabled } from './sfnResume';

const clock = fixedClock('2026-10-06T06:00:00.000Z');
const EVENT = {
  alert: fixtureAlert({ id: 'a1' }),
  step: { index: 0, action: 'send', to: 'principal' },
  taskToken: 'TOKEN',
};

function handlerWith(enabled: boolean): {
  run: (event: unknown) => Promise<void>;
  sent: ReturnType<typeof inAppAdapter>;
  tokens: ReturnType<typeof fixtureTokenStore>;
} {
  const sent = inAppAdapter(clock);
  const tokens = fixtureTokenStore();
  const run = createSendHandler({
    adapter: sent,
    tokens,
    clock,
    sendsEnabled: () => Promise.resolve(enabled),
  });
  return { run, sent, tokens };
}

describe('the Send Lambda', () => {
  it('sends and stores the token for a valid event', async () => {
    const { run, sent, tokens } = handlerWith(true);
    await run(EVENT);
    expect(sent.sent).toHaveLength(1);
    expect(await tokens.getToken('a1')).toBe('TOKEN');
  });

  it('refuses a malformed event before doing anything', async () => {
    const { run, sent } = handlerWith(true);
    await expect(run({ ...EVENT, taskToken: '' })).rejects.toThrow();
    await expect(run({ nope: true })).rejects.toThrow();
    expect(sent.sent).toHaveLength(0);
  });

  it('does nothing while the kill switch is off', async () => {
    const { run, sent, tokens } = handlerWith(false);
    await expect(run(EVENT)).rejects.toThrow(/switched off/);
    expect(sent.sent).toHaveLength(0);
    expect(await tokens.getToken('a1')).toBeNull();
  });

  it('only reaches linked chats when wired to the real Telegram adapter', async () => {
    const store = fixtureLinkStore(); // nobody linked
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const run = createSendHandler({
      adapter: telegramAdapter({ botToken: 'T', store, fetchImpl }),
      tokens: fixtureTokenStore(),
      clock,
      sendsEnabled: () => Promise.resolve(true),
    });
    await expect(run(EVENT)).rejects.toThrow(/No linked chat/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('the event schema accepts exactly what the state machine sends', () => {
    expect(SendEvent.safeParse(EVENT).success).toBe(true);
  });
});

describe('ssmSendsEnabled (the kill switch)', () => {
  const reading = (value: string | undefined): { send: ReturnType<typeof vi.fn> } => ({
    send: vi
      .fn()
      .mockResolvedValue({ Parameter: value === undefined ? undefined : { Value: value } }),
  });

  it('is on only for the exact value "true"', async () => {
    expect(await ssmSendsEnabled(reading('true') as never, '/p')()).toBe(true);
    for (const value of ['false', 'True', '1', '', undefined]) {
      expect(await ssmSendsEnabled(reading(value) as never, '/p')()).toBe(false);
    }
  });

  it('asks for the named parameter, and fails closed if SSM errors', async () => {
    const client = reading('true');
    await ssmSendsEnabled(client as never, '/vayu/watch/sends-enabled')();
    const command = client.send.mock.calls[0]?.[0] as GetParameterCommand;
    expect(command.input.Name).toBe('/vayu/watch/sends-enabled');
    const broken = { send: vi.fn().mockRejectedValue(new Error('AccessDenied')) };
    expect(await ssmSendsEnabled(broken as never, '/p')()).toBe(false);
  });
});

describe('sfnSendTaskSuccess', () => {
  it('sends the token and output, and maps finished tasks to a stale-token error', async () => {
    const send = vi.fn().mockResolvedValue({});
    await sfnSendTaskSuccess({ send } as never)('TOKEN', '{"a":1}');
    expect((send.mock.calls[0]?.[0] as { input: unknown }).input).toEqual({
      taskToken: 'TOKEN',
      output: '{"a":1}',
    });

    for (const name of ['TaskTimedOut', 'TaskDoesNotExist', 'InvalidToken']) {
      const failing = { send: vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name })) };
      await expect(sfnSendTaskSuccess(failing as never)('T', '{}')).rejects.toBeInstanceOf(
        StaleTaskTokenError,
      );
    }
    const other = { send: vi.fn().mockRejectedValue(new Error('throttled')) };
    await expect(sfnSendTaskSuccess(other as never)('T', '{}')).rejects.toThrow('throttled');
  });
});

describe('withPhrasing', () => {
  const generate = (): Promise<string> => Promise.resolve('Reworded, AQI 285.');
  const alert = fixtureAlert({ id: 'p1', body: 'Plain wording, AQI 285.', facts: { aqi: 285 } });

  it('leaves the plain template untouched unless PHRASING is exactly "on"', async () => {
    for (const setting of [undefined, '', 'off', 'ON', 'true']) {
      const base = inAppAdapter(clock);
      await withPhrasing(base, setting, generate).send(alert, 'principal');
      expect(base.sent[0]?.alert.body).toBe('Plain wording, AQI 285.');
    }
  });

  it('rewords with an AI footer when on, and keeps the template if the model invents a number', async () => {
    const ok = inAppAdapter(clock);
    await withPhrasing(ok, 'on', generate).send(alert, 'principal');
    expect(ok.sent[0]?.alert.body).toMatch(/^Reworded, AQI 285\.\n\nWording by AI/);

    const bad = inAppAdapter(clock);
    await withPhrasing(bad, 'on', () => Promise.resolve('AQI 999.')).send(alert, 'principal');
    expect(bad.sent[0]?.alert.body).toBe('Plain wording, AQI 285.\n\nPlain template.');
  });
});
