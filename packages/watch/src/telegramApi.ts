import type { WebhookEffect } from './webhook';

export interface TelegramClientOptions {
  readonly botToken: string;
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
}

async function call(
  doFetch: typeof fetch,
  baseUrl: string,
  botToken: string,
  method: string,
  body: Record<string, unknown>,
): Promise<void> {
  const res = await doFetch(`${baseUrl}/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Telegram ${method} failed: ${res.status} ${res.statusText}`);
  }
}

/** Sends the effects `handleTelegramUpdate` decided on back to Telegram's Bot API. */
export async function sendTelegramEffects(
  effects: readonly WebhookEffect[],
  options: TelegramClientOptions,
): Promise<void> {
  const baseUrl = options.baseUrl ?? 'https://api.telegram.org';
  const doFetch = options.fetchImpl ?? fetch;

  await Promise.all(
    effects.map((effect) =>
      effect.kind === 'reply'
        ? call(doFetch, baseUrl, options.botToken, 'sendMessage', {
            chat_id: effect.chatId,
            text: effect.text,
          })
        : call(doFetch, baseUrl, options.botToken, 'answerCallbackQuery', {
            callback_query_id: effect.callbackQueryId,
            text: effect.text,
          }),
    ),
  );
}
