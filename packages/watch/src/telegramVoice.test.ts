import type { Alert } from '@vayu/contracts';
import { describe, expect, it, vi } from 'vitest';
import { fixtureAlert } from './fixtures';
import { fixtureLinkStore } from './linking';
import { telegramAdapter } from './telegramAdapter';

const ALERT = fixtureAlert({
  id: 'a1',
  title: 'GRAP Stage IV likely',
  body: 'Keep children indoors.',
  audience: { groupId: 'school-demo', role: 'principal' },
  actions: ['seen'],
});

const AUDIO = new Uint8Array([9, 8, 7, 6]);

async function setup(
  chats: string[],
  voice: (alert: Alert, action?: string) => Promise<Uint8Array | undefined>,
  respond: (url: string) => boolean = () => true,
): Promise<{
  send: () => Promise<void>;
  calls: { url: string; body: unknown }[];
  errors: unknown[];
  voiceCalls: number;
}> {
  const store = fixtureLinkStore();
  for (const chatId of chats) {
    await store.saveLink({
      chatId,
      groupId: 'school-demo',
      role: 'principal',
      linkedAt: '2026-10-08T06:00:00.000Z',
    });
  }
  const calls: { url: string; body: unknown }[] = [];
  const errors: unknown[] = [];
  const state = { voiceCalls: 0 };
  const fetchImpl = vi.fn((url: string, init: RequestInit) => {
    calls.push({ url, body: init.body });
    const ok = respond(url);
    return Promise.resolve({
      ok,
      status: ok ? 200 : 500,
      statusText: ok ? 'OK' : 'Boom',
    } as Response);
  }) as unknown as typeof fetch;
  const adapter = telegramAdapter({
    botToken: 'T',
    store,
    fetchImpl,
    voice: (alert, action) => {
      state.voiceCalls++;
      return voice(alert, action);
    },
    onVoiceError: (error) => {
      errors.push(error);
    },
  });
  return {
    send: () => adapter.send(ALERT, 'principal'),
    calls,
    errors,
    get voiceCalls() {
      return state.voiceCalls;
    },
  };
}

describe('telegramAdapter with a voice note', () => {
  it('sends the text first, then the voice note, to each linked chat', async () => {
    const world = await setup(['c1', 'c2'], () => Promise.resolve(AUDIO));
    await world.send();
    expect(world.calls.map((c) => c.url)).toEqual([
      'https://api.telegram.org/botT/sendMessage',
      'https://api.telegram.org/botT/sendVoice',
      'https://api.telegram.org/botT/sendMessage',
      'https://api.telegram.org/botT/sendVoice',
    ]);
    const voice = world.calls[1]?.body as FormData;
    expect(voice).toBeInstanceOf(FormData);
    expect(voice.get('chat_id')).toBe('c1');
    const file = voice.get('voice') as Blob;
    expect(file.size).toBe(4);
    expect(file.type).toBe('audio/mpeg');
  });

  it('makes the voice note once however many chats there are', async () => {
    const world = await setup(['c1', 'c2', 'c3'], () => Promise.resolve(AUDIO));
    await world.send();
    expect(world.voiceCalls).toBe(1);
  });

  it('is told which kind of step it is, so a reminder sounds like one', async () => {
    const seen: (string | undefined)[] = [];
    const store = fixtureLinkStore();
    await store.saveLink({
      chatId: 'c1',
      groupId: 'school-demo',
      role: 'principal',
      linkedAt: '2026-10-08T06:00:00.000Z',
    });
    const adapter = telegramAdapter({
      botToken: 'T',
      store,
      fetchImpl: vi.fn(() =>
        Promise.resolve({ ok: true, status: 200, statusText: 'OK' } as Response),
      ),
      voice: (_alert, action) => {
        seen.push(action);
        return Promise.resolve(AUDIO);
      },
    });
    await adapter.send(ALERT, 'principal', { step: 'remind-1', action: 'remind' });
    expect(seen).toEqual(['remind']);
  });

  it('sends no voice note when there are no words for this alert', async () => {
    const world = await setup(['c1'], () => Promise.resolve(undefined));
    await world.send();
    expect(world.calls.map((c) => c.url)).toEqual(['https://api.telegram.org/botT/sendMessage']);
  });

  it('never fails the alert because the voice failed: the text is already there, and the failure is reported', async () => {
    const world = await setup(['c1'], () => Promise.reject(new Error('Polly timed out')));
    await expect(world.send()).resolves.toBeUndefined();
    expect(world.calls.map((c) => c.url)).toEqual(['https://api.telegram.org/botT/sendMessage']);
    expect(world.errors).toHaveLength(1);
  });

  it('does not fail the alert when Telegram refuses the voice note either', async () => {
    const world = await setup(
      ['c1'],
      () => Promise.resolve(AUDIO),
      (url) => !url.endsWith('/sendVoice'),
    );
    await expect(world.send()).resolves.toBeUndefined();
    expect(world.errors).toHaveLength(1);
  });

  it('does not ask for a voice note, or send one, to a chat that already had this alert (rule I8)', async () => {
    const world = await setup(['c1'], () => Promise.resolve(AUDIO));
    await world.send();
    const before = world.calls.length;
    await world.send();
    expect(world.calls.length).toBe(before);
  });

  it('still fails the alert when the text itself fails, as before', async () => {
    const world = await setup(
      ['c1'],
      () => Promise.resolve(AUDIO),
      (url) => !url.endsWith('/sendMessage'),
    );
    await expect(world.send()).rejects.toThrow(/sendMessage failed/);
    expect(world.calls.map((c) => c.url)).toEqual(['https://api.telegram.org/botT/sendMessage']);
  });
});
