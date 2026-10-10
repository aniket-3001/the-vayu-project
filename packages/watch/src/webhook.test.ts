import { fixedClock } from '@vayu/core';
import { describe, expect, it } from 'vitest';
import { fixtureLinkStore, type LinkStore } from './linking';
import {
  handleTelegramUpdate,
  isValidWebhookSecret,
  type WebhookDeps,
  type WebhookEffect,
} from './webhook';

const clock = fixedClock('2026-10-05T06:00:00.000Z');

function deps(store: LinkStore = fixtureLinkStore()): WebhookDeps {
  return { store, clock };
}

function onlyEffect(effects: readonly WebhookEffect[]): WebhookEffect {
  if (effects.length !== 1) {
    throw new Error(`expected exactly one effect, got ${effects.length}`);
  }
  const effect = effects[0];
  if (!effect) {
    throw new Error('expected an effect');
  }
  return effect;
}

describe('isValidWebhookSecret', () => {
  it('accepts the exact configured secret', () => {
    expect(isValidWebhookSecret('s3cret', 's3cret')).toBe(true);
  });

  it('rejects a wrong or missing header', () => {
    expect(isValidWebhookSecret('wrong', 's3cret')).toBe(false);
    expect(isValidWebhookSecret(undefined, 's3cret')).toBe(false);
  });
});

describe('handleTelegramUpdate — text messages', () => {
  it('replies to /start and /help', async () => {
    const effect = onlyEffect(
      await handleTelegramUpdate({ message: { chat: { id: 1 }, text: '/start' } }, deps()),
    );
    expect(effect).toMatchObject({ kind: 'reply', chatId: '1' });
    expect(effect.kind === 'reply' ? effect.text : '').toMatch(/\/link/);
  });

  it('links on a valid, unexpired code and consumes it', async () => {
    const store = fixtureLinkStore();
    await store.saveLinkCode({
      code: 'abc123',
      groupId: 'school-demo',
      role: 'principal',
      expiresAt: '2026-10-05T07:00:00.000Z',
    });

    const effect = onlyEffect(
      await handleTelegramUpdate(
        { message: { chat: { id: 1 }, text: '/link abc123' } },
        deps(store),
      ),
    );

    expect(effect).toMatchObject({ kind: 'reply', chatId: '1' });
    expect(effect.kind === 'reply' ? effect.text : '').toMatch(/principal/);
    expect(await store.linksForRole('school-demo', 'principal')).toHaveLength(1);
    expect(await store.getLinkCode('abc123')).toBeNull();
  });

  it('rejects an unknown code', async () => {
    const effect = onlyEffect(
      await handleTelegramUpdate({ message: { chat: { id: 1 }, text: '/link nope00' } }, deps()),
    );
    expect(effect.kind === 'reply' ? effect.text : '').toMatch(/invalid/);
  });

  it('rejects and consumes an expired code', async () => {
    const store = fixtureLinkStore();
    await store.saveLinkCode({
      code: 'old123',
      groupId: 'school-demo',
      role: 'principal',
      expiresAt: '2026-10-05T05:00:00.000Z', // before the clock's "now"
    });

    const effect = onlyEffect(
      await handleTelegramUpdate(
        { message: { chat: { id: 1 }, text: '/link old123' } },
        deps(store),
      ),
    );

    expect(effect.kind === 'reply' ? effect.text : '').toMatch(/expired/);
    expect(await store.getLinkCode('old123')).toBeNull();
  });

  it('unlinks and deletes the chat on /unlink', async () => {
    const store = fixtureLinkStore();
    await store.saveLink({
      chatId: '1',
      groupId: 'school-demo',
      role: 'principal',
      linkedAt: clock.now(),
    });

    const effect = onlyEffect(
      await handleTelegramUpdate({ message: { chat: { id: 1 }, text: '/unlink' } }, deps(store)),
    );

    expect(effect.kind === 'reply' ? effect.text : '').toMatch(/deleted/);
    expect(await store.linksForRole('school-demo', 'principal')).toHaveLength(0);
  });

  it('gives a fallback reply to anything else', async () => {
    const effect = onlyEffect(
      await handleTelegramUpdate({ message: { chat: { id: 1 }, text: 'hello?' } }, deps()),
    );
    expect(effect.kind === 'reply' ? effect.text : '').toMatch(/\/help/);
  });
});

describe('handleTelegramUpdate — button taps', () => {
  it('records a valid ack and confirms it', async () => {
    const store = fixtureLinkStore();
    const effect = onlyEffect(
      await handleTelegramUpdate(
        { callback_query: { id: 'cbq-1', data: 'ack:alert-1:done', message: { chat: { id: 1 } } } },
        deps(store),
      ),
    );

    expect(effect).toEqual({
      kind: 'answerCallback',
      callbackQueryId: 'cbq-1',
      text: 'Got it, thanks!',
    });
    // Already recorded by the handler — a second recordAck for the same key must say so (I8).
    expect(
      await store.recordAck({ alertId: 'alert-1', chatId: '1', action: 'done', at: clock.now() }),
    ).toBe(false);
  });

  it('tells the second tap on the same alert that it was already recorded (I8)', async () => {
    const store = fixtureLinkStore();
    const callbackQuery = { id: 'cbq-1', data: 'ack:alert-1:done', message: { chat: { id: 1 } } };

    await handleTelegramUpdate({ callback_query: callbackQuery }, deps(store));
    const effect = onlyEffect(
      await handleTelegramUpdate(
        { callback_query: { ...callbackQuery, id: 'cbq-2' } },
        deps(store),
      ),
    );

    expect(effect).toEqual({
      kind: 'answerCallback',
      callbackQueryId: 'cbq-2',
      text: 'Already recorded.',
    });
  });

  it('rejects malformed callback data', async () => {
    const effect = onlyEffect(
      await handleTelegramUpdate(
        {
          callback_query: {
            id: 'cbq-1',
            data: 'not-a-valid-payload',
            message: { chat: { id: 1 } },
          },
        },
        deps(),
      ),
    );
    expect(effect.kind === 'answerCallback' ? effect.text : '').toMatch(/tap/);
  });

  it('rejects an unknown AlertAction', async () => {
    const effect = onlyEffect(
      await handleTelegramUpdate(
        {
          callback_query: {
            id: 'cbq-1',
            data: 'ack:alert-1:not_a_real_action',
            message: { chat: { id: 1 } },
          },
        },
        deps(),
      ),
    );
    expect(effect.kind === 'answerCallback' ? effect.text : '').toMatch(/tap/);
  });
});

describe('handleTelegramUpdate — resuming the loop on a tap', () => {
  const tap = (
    id: string,
  ): { callback_query: { id: string; data: string; message: { chat: { id: number } } } } => ({
    callback_query: { id, data: 'ack:alert-1:done', message: { chat: { id: 77 } } },
  });

  it('calls onFirstAck once, with the recorded ack, and not again for a repeat tap', async () => {
    const calls: unknown[] = [];
    const d: WebhookDeps = {
      store: fixtureLinkStore(),
      clock,
      onFirstAck: (ack) => {
        calls.push(ack);
        return Promise.resolve();
      },
    };
    await handleTelegramUpdate(tap('1'), d);
    await handleTelegramUpdate(tap('2'), d);
    expect(calls).toEqual([{ alertId: 'alert-1', chatId: '77', action: 'done', at: clock.now() }]);
  });

  it('says so honestly when the loop could not be resumed, but still records the tap', async () => {
    const store = fixtureLinkStore();
    const d: WebhookDeps = {
      store,
      clock,
      onFirstAck: () => Promise.reject(new Error('throttled')),
    };
    const effect = onlyEffect(await handleTelegramUpdate(tap('1'), d));
    expect(effect).toMatchObject({
      kind: 'answerCallback',
      text: expect.stringContaining('could not update the alert') as string,
    });
    expect(
      await store.recordAck({ alertId: 'alert-1', chatId: '77', action: 'done', at: clock.now() }),
    ).toBe(false);
  });
});
