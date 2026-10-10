import { AlertAction } from '@vayu/contracts';
import type { Clock } from '@vayu/core';
import { toMs } from '@vayu/core';
import { z } from 'zod';
import type { AckRecord, LinkStore } from './linking';

const TelegramMessageSchema = z.object({
  chat: z.object({ id: z.union([z.number(), z.string()]) }),
  text: z.string().optional(),
});
export type TelegramMessage = z.infer<typeof TelegramMessageSchema>;

const TelegramCallbackQuerySchema = z.object({
  id: z.string(),
  data: z.string().optional(),
  message: TelegramMessageSchema.optional(),
});
export type TelegramCallbackQuery = z.infer<typeof TelegramCallbackQuerySchema>;

/** What Telegram actually sends; everything else in its Update object is ignored. */
export const TelegramUpdateSchema = z.object({
  message: TelegramMessageSchema.optional(),
  callback_query: TelegramCallbackQuerySchema.optional(),
});
export type TelegramUpdate = z.infer<typeof TelegramUpdateSchema>;

export type WebhookEffect =
  | { readonly kind: 'reply'; readonly chatId: string; readonly text: string }
  | { readonly kind: 'answerCallback'; readonly callbackQueryId: string; readonly text: string };

export interface WebhookDeps {
  readonly store: LinkStore;
  readonly clock: Clock;
  /**
   * Called once for a tap that was not seen before, to resume the alert loop that is waiting for
   * it. If it throws, the person is told honestly that the tap was recorded but not passed on.
   */
  readonly onFirstAck?: (ack: AckRecord) => Promise<unknown>;
}

const LINK_COMMAND = /^\/link\s+(\S+)$/;
const ACK_CALLBACK = /^ack:([^:]+):([^:]+)$/;

/** Checks Telegram's `X-Telegram-Bot-Api-Secret-Token` header against the one we registered. */
export function isValidWebhookSecret(headerValue: string | undefined, expected: string): boolean {
  return headerValue !== undefined && headerValue === expected;
}

/** Parses one Telegram update and decides what to do. No AWS or network calls in here. */
export async function handleTelegramUpdate(
  update: TelegramUpdate,
  deps: WebhookDeps,
): Promise<readonly WebhookEffect[]> {
  if (update.message) {
    return handleMessage(update.message, deps);
  }
  if (update.callback_query) {
    return handleCallbackQuery(update.callback_query, deps);
  }
  return [];
}

async function handleMessage(
  message: TelegramMessage,
  deps: WebhookDeps,
): Promise<readonly WebhookEffect[]> {
  const chatId = String(message.chat.id);
  const text = message.text?.trim() ?? '';

  if (text === '/start' || text === '/help') {
    return [
      {
        kind: 'reply',
        chatId,
        text: 'Vayu Labs Watch. Send /link <code> to connect your role, /unlink to stop and delete your data here.',
      },
    ];
  }

  if (text === '/unlink') {
    await deps.store.deleteLink(chatId);
    return [{ kind: 'reply', chatId, text: 'Unlinked. Your data here has been deleted.' }];
  }

  const linkMatch = LINK_COMMAND.exec(text);
  if (linkMatch?.[1] !== undefined) {
    return handleLinkCommand(chatId, linkMatch[1], deps);
  }

  return [{ kind: 'reply', chatId, text: "Sorry, I didn't understand that. Send /help." }];
}

async function handleLinkCommand(
  chatId: string,
  code: string,
  deps: WebhookDeps,
): Promise<readonly WebhookEffect[]> {
  const linkCode = await deps.store.getLinkCode(code);
  if (!linkCode) {
    return [{ kind: 'reply', chatId, text: 'That code is invalid or already used.' }];
  }
  if (toMs(linkCode.expiresAt) < toMs(deps.clock.now())) {
    await deps.store.consumeLinkCode(code);
    return [{ kind: 'reply', chatId, text: 'That code has expired. Ask for a new one.' }];
  }

  await deps.store.saveLink({
    chatId,
    groupId: linkCode.groupId,
    role: linkCode.role,
    linkedAt: deps.clock.now(),
  });
  await deps.store.consumeLinkCode(code);
  return [{ kind: 'reply', chatId, text: `Linked as ${linkCode.role}. You'll get alerts here.` }];
}

async function handleCallbackQuery(
  callbackQuery: TelegramCallbackQuery,
  deps: WebhookDeps,
): Promise<readonly WebhookEffect[]> {
  const chatId = callbackQuery.message ? String(callbackQuery.message.chat.id) : undefined;
  const match = ACK_CALLBACK.exec(callbackQuery.data ?? '');
  const parsedAction = match?.[2] !== undefined ? AlertAction.safeParse(match[2]) : undefined;

  if (!chatId || !match?.[1] || !parsedAction?.success) {
    return [
      {
        kind: 'answerCallback',
        callbackQueryId: callbackQuery.id,
        text: "Couldn't read that tap.",
      },
    ];
  }

  const ack: AckRecord = {
    alertId: match[1],
    chatId,
    action: parsedAction.data,
    at: deps.clock.now(),
  };
  const isNew = await deps.store.recordAck(ack);

  let text = isNew ? 'Got it, thanks!' : 'Already recorded.';
  if (isNew && deps.onFirstAck !== undefined) {
    try {
      await deps.onFirstAck(ack);
    } catch {
      text = 'Got it. We could not update the alert, so a reminder may still arrive.';
    }
  }
  return [{ kind: 'answerCallback', callbackQueryId: callbackQuery.id, text }];
}
