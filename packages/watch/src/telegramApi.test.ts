import { describe, expect, it, vi } from 'vitest';
import { sendTelegramEffects } from './telegramApi';

function fakeFetch(): { fetch: typeof fetch; calls: readonly [string, unknown][] } {
  const calls: [string, unknown][] = [];
  const impl: typeof fetch = (url, init) => {
    if (typeof url !== 'string') {
      throw new Error('expected a plain string URL in this test');
    }
    calls.push([url, init?.body]);
    return Promise.resolve(new Response('{}', { status: 200 }));
  };
  return { fetch: vi.fn(impl), calls };
}

describe('sendTelegramEffects', () => {
  it('calls sendMessage for a reply effect', async () => {
    const { fetch: fetchImpl, calls } = fakeFetch();

    await sendTelegramEffects([{ kind: 'reply', chatId: '1', text: 'hello' }], {
      botToken: 'TOKEN',
      fetchImpl,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe('https://api.telegram.org/botTOKEN/sendMessage');
    expect(JSON.parse(String(calls[0]?.[1]))).toEqual({ chat_id: '1', text: 'hello' });
  });

  it('calls answerCallbackQuery for an answerCallback effect', async () => {
    const { fetch: fetchImpl, calls } = fakeFetch();

    await sendTelegramEffects([{ kind: 'answerCallback', callbackQueryId: 'cbq-1', text: 'ok' }], {
      botToken: 'TOKEN',
      fetchImpl,
    });

    expect(calls[0]?.[0]).toBe('https://api.telegram.org/botTOKEN/answerCallbackQuery');
    expect(JSON.parse(String(calls[0]?.[1]))).toEqual({ callback_query_id: 'cbq-1', text: 'ok' });
  });

  it('sends every effect, even several at once', async () => {
    const { fetch: fetchImpl, calls } = fakeFetch();

    await sendTelegramEffects(
      [
        { kind: 'reply', chatId: '1', text: 'a' },
        { kind: 'reply', chatId: '2', text: 'b' },
      ],
      { botToken: 'TOKEN', fetchImpl },
    );

    expect(calls).toHaveLength(2);
  });

  it('throws if Telegram responds with an error status', async () => {
    const fetchImpl: typeof fetch = () => Promise.resolve(new Response('', { status: 400 }));

    await expect(
      sendTelegramEffects([{ kind: 'reply', chatId: '1', text: 'hello' }], {
        botToken: 'TOKEN',
        fetchImpl,
      }),
    ).rejects.toThrow(/sendMessage failed/);
  });
});
