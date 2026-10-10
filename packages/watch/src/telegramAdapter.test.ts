import { describe, expect, it, vi } from 'vitest';
import { fixtureAlert } from './fixtures';
import { fixtureLinkStore, type LinkStore } from './linking';
import {
  NoLinkedRecipientError,
  ReplayToRealAudienceError,
  messageText,
  telegramAdapter,
} from './telegramAdapter';

const ALERT = fixtureAlert({
  id: 'a1',
  title: 'GRAP Stage IV likely',
  body: 'Keep children indoors.',
  audience: { groupId: 'school-demo', role: 'principal' },
  actions: ['seen', 'done'],
});

async function storeWith(...chatIds: string[]): Promise<LinkStore> {
  const store = fixtureLinkStore();
  for (const chatId of chatIds) {
    await store.saveLink({
      chatId,
      groupId: 'school-demo',
      role: 'principal',
      linkedAt: '2026-10-05T06:00:00.000Z',
    });
  }
  return store;
}

function okFetch(): { fetchImpl: typeof fetch; bodies: Record<string, unknown>[]; urls: string[] } {
  const bodies: Record<string, unknown>[] = [];
  const urls: string[] = [];
  const fetchImpl = vi.fn((url: string, init: RequestInit) => {
    urls.push(url);
    bodies.push(JSON.parse(init.body as string) as Record<string, unknown>);
    return Promise.resolve({ ok: true, status: 200, statusText: 'OK' } as Response);
  }) as unknown as typeof fetch;
  return { fetchImpl, bodies, urls };
}

describe('telegramAdapter', () => {
  it('sends the alert with tap buttons to every chat linked to the role', async () => {
    const { fetchImpl, bodies, urls } = okFetch();
    const adapter = telegramAdapter({
      botToken: 'T',
      store: await storeWith('c1', 'c2'),
      fetchImpl,
    });

    await adapter.send(ALERT, 'principal');

    expect(urls).toEqual([
      'https://api.telegram.org/botT/sendMessage',
      'https://api.telegram.org/botT/sendMessage',
    ]);
    expect(bodies.map((b) => b.chat_id).sort()).toEqual(['c1', 'c2']);
    expect(bodies[0]?.text).toBe('GRAP Stage IV likely\n\nKeep children indoors.');
    expect(bodies[0]?.reply_markup).toEqual({
      inline_keyboard: [
        [
          { text: 'Seen', callback_data: 'ack:a1:seen' },
          { text: 'Done', callback_data: 'ack:a1:done' },
        ],
      ],
    });
  });

  it('rule I7: refuses to send when nobody is linked, and sends nothing', async () => {
    const { fetchImpl, bodies } = okFetch();
    const adapter = telegramAdapter({ botToken: 'T', store: fixtureLinkStore(), fetchImpl });
    await expect(adapter.send(ALERT, 'principal')).rejects.toBeInstanceOf(NoLinkedRecipientError);
    expect(bodies).toHaveLength(0);
  });

  it('rule I8: the same step is never sent twice, but a later step to the same chat is', async () => {
    const { fetchImpl, bodies } = okFetch();
    const adapter = telegramAdapter({ botToken: 'T', store: await storeWith('c1'), fetchImpl });

    await adapter.send(ALERT, 'principal', { step: '0-send' });
    await adapter.send(ALERT, 'principal', { step: '0-send' }); // a retry
    expect(bodies).toHaveLength(1);

    await adapter.send(ALERT, 'principal', { step: '1-remind' });
    expect(bodies).toHaveLength(2);
  });

  it('rule I17: a replay alert starts with [Replay] and goes only to demo groups', async () => {
    const replay = fixtureAlert({ ...ALERT, mode: 'replay' });
    const store = await storeWith('c1');

    const blocked = okFetch();
    await expect(
      telegramAdapter({ botToken: 'T', store, fetchImpl: blocked.fetchImpl }).send(
        replay,
        'principal',
      ),
    ).rejects.toBeInstanceOf(ReplayToRealAudienceError);
    expect(blocked.bodies).toHaveLength(0);

    const allowed = okFetch();
    await telegramAdapter({
      botToken: 'T',
      store,
      demoGroupIds: new Set(['school-demo']),
      fetchImpl: allowed.fetchImpl,
    }).send(replay, 'principal');
    expect(allowed.bodies[0]?.text).toMatch(/^\[Replay\] /);
  });

  it('rule I10: an unofficial alert says it is our estimate, not an order', () => {
    expect(messageText({ ...ALERT, unofficial: true })).toContain(
      'Unofficial: this is our estimate, not an order.',
    );
    expect(messageText(ALERT)).not.toContain('Unofficial');
  });

  it('puts the unofficial notice before the body, so a footer added to the body stays last', () => {
    const text = messageText({
      ...ALERT,
      unofficial: true,
      body: `${ALERT.body}\n\nWording by AI.`,
    });
    expect(text.indexOf('Unofficial')).toBeLessThan(text.indexOf(ALERT.body));
    expect(text.endsWith('Wording by AI.')).toBe(true);
  });

  it('says so when a message is a reminder or an escalation, not a repeat of the first one', () => {
    expect(messageText(ALERT, 'send')).toBe(messageText(ALERT));
    expect(messageText(ALERT, 'remind')).toMatch(/^Reminder: GRAP Stage IV likely/);
    expect(messageText(ALERT, 'escalate')).toMatch(/^Escalated: GRAP Stage IV likely/);
    expect(messageText({ ...ALERT, mode: 'replay' }, 'remind')).toMatch(/^\[Replay\] Reminder: /);
  });

  it('sends the reminder label to the chat for a remind step', async () => {
    const { fetchImpl, bodies } = okFetch();
    const adapter = telegramAdapter({ botToken: 'T', store: await storeWith('c1'), fetchImpl });
    await adapter.send(ALERT, 'principal', { step: '1-remind', action: 'remind' });
    expect(bodies[0]?.text).toMatch(/^Reminder: /);
  });

  it('throws a clear error when Telegram rejects the send (and does not leak the token)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    }) as unknown as typeof fetch;
    const adapter = telegramAdapter({
      botToken: 'SECRET',
      store: await storeWith('c1'),
      fetchImpl,
    });
    const error = await adapter.send(ALERT, 'principal').catch((e: unknown) => e);
    expect((error as Error).message).toMatch(/sendMessage failed: 403/);
    expect((error as Error).message).not.toContain('SECRET');
  });
});
