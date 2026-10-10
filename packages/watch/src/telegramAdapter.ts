import type { Alert, AlertAction } from '@vayu/contracts';
import type { ChannelAdapter, SendContext } from './adapters';
import type { LinkStore } from './linking';

/** Rule I7: nobody is messaged unless they linked their chat to this group and role. */
export class NoLinkedRecipientError extends Error {
  constructor(groupId: string, role: string) {
    super(`No linked chat for ${role} in group ${groupId}`);
    this.name = 'NoLinkedRecipientError';
  }
}

/** Rule I17: a replay alert never reaches a group that is not flagged as a demo group. */
export class ReplayToRealAudienceError extends Error {
  constructor(groupId: string) {
    super(`Replay alert refused: group ${groupId} is not a demo group`);
    this.name = 'ReplayToRealAudienceError';
  }
}

export interface TelegramAdapterOptions {
  readonly botToken: string;
  readonly store: LinkStore;
  /** Groups flagged `demo: true`. Replay alerts may go only to these. */
  readonly demoGroupIds?: ReadonlySet<string>;
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
  /**
   * Audio for a voice note, or undefined for none. Asked once per send, however many chats. A voice
   * note is an extra: if it fails the alert still counts as sent, and `onVoiceError` hears about it.
   */
  readonly voice?: (alert: Alert, action?: string) => Promise<Uint8Array | undefined>;
  readonly onVoiceError?: (error: unknown) => void;
}

const BUTTON_LABEL: Record<AlertAction, string> = {
  seen: 'Seen',
  planned: 'Planned',
  done: 'Done',
  im_in: "I'm in",
  not_today: 'Not today',
};

/** The text a person reads. Replay and unofficial alerts say so up front (rules I17, I10). */
export function messageText(alert: Alert, action?: string): string {
  // A reminder or an escalation must say so, or it reads as a duplicate of the first message. The
  // unofficial notice comes right after the title, so any footer added to the body stays last.
  const prefix = action === 'remind' ? 'Reminder: ' : action === 'escalate' ? 'Escalated: ' : '';
  const lines = [`${prefix}${alert.title}`, ''];
  if (alert.unofficial === true) lines.push('Unofficial: this is our estimate, not an order.', '');
  lines.push(alert.body);
  const text = lines.join('\n');
  return alert.mode === 'replay' ? `[Replay] ${text}` : text;
}

/**
 * The real Telegram channel. `recipient` is a role in the alert's group (for example "principal");
 * it resolves to the chats that linked to that role. Safety, in this order: replay only to demo
 * groups (I17), only linked chats (I7), and one claim per alert+chat+step before sending so a
 * retry can never message anyone twice (I8). A failed send throws and is not retried here: the
 * claim stays, so the safe failure is a missed message that the run record shows, not a duplicate.
 */
export function telegramAdapter(options: TelegramAdapterOptions): ChannelAdapter {
  const baseUrl = options.baseUrl ?? 'https://api.telegram.org';
  const doFetch = options.fetchImpl ?? fetch;

  return {
    channel: 'telegram',
    async send(alert: Alert, recipient: string, context?: SendContext): Promise<void> {
      const { groupId } = alert.audience;
      if (alert.mode === 'replay' && options.demoGroupIds?.has(groupId) !== true) {
        throw new ReplayToRealAudienceError(groupId);
      }
      const links = await options.store.linksForRole(groupId, recipient);
      if (links.length === 0) throw new NoLinkedRecipientError(groupId, recipient);

      const step = context?.step ?? 'send';
      const text = messageText(alert, context?.action);
      const keyboard = {
        inline_keyboard: [
          alert.actions.map((action) => ({
            text: BUTTON_LABEL[action],
            callback_data: `ack:${alert.id}:${action}`,
          })),
        ],
      };

      // Made on first need, once: the text is sent first, so a slow voice never delays it.
      let audio: Promise<Uint8Array | undefined> | undefined;
      const voiceNote = (): Promise<Uint8Array | undefined> => {
        audio ??= (options.voice?.(alert, context?.action) ?? Promise.resolve(undefined)).catch(
          (error: unknown) => {
            options.onVoiceError?.(error);
            return undefined;
          },
        );
        return audio;
      };

      for (const link of links) {
        if (!(await options.store.claimSend(alert.id, link.chatId, step))) continue;
        const res = await doFetch(`${baseUrl}/bot${options.botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: link.chatId, text, reply_markup: keyboard }),
        });
        if (!res.ok)
          throw new Error(`Telegram sendMessage failed: ${res.status} ${res.statusText}`);
        const bytes = options.voice === undefined ? undefined : await voiceNote();
        if (bytes !== undefined) {
          try {
            const form = new FormData();
            form.set('chat_id', link.chatId);
            form.set('voice', new Blob([bytes], { type: 'audio/mpeg' }), 'alert.mp3');
            const voiceRes = await doFetch(`${baseUrl}/bot${options.botToken}/sendVoice`, {
              method: 'POST',
              body: form,
            });
            if (!voiceRes.ok) {
              throw new Error(
                `Telegram sendVoice failed: ${voiceRes.status} ${voiceRes.statusText}`,
              );
            }
          } catch (error) {
            options.onVoiceError?.(error);
          }
        }
      }
    },
  };
}
