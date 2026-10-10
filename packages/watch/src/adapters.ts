import type { Clock } from '@vayu/core';
import type { Alert } from '@vayu/contracts';

export interface SentMessage {
  readonly recipient: string;
  readonly alert: Alert;
  readonly sentAt: string;
}

/** One way to reach a person. Console, InApp and Telegram all implement this the same way. */
export interface SendContext {
  /** Which step of the loop this send is, so a reminder to the same person is not mistaken for a repeat. */
  readonly step: string;
  /** What kind of step it is (send, remind, escalate), so a reminder can say it is one. */
  readonly action?: string;
}

export interface ChannelAdapter {
  readonly channel: string;
  send(alert: Alert, recipient: string, context?: SendContext): Promise<void>;
}

export interface RecordingAdapter extends ChannelAdapter {
  readonly sent: readonly SentMessage[];
}

function recordingAdapter(
  channel: string,
  clock: Clock,
  onSend?: (alert: Alert, recipient: string) => void,
): RecordingAdapter {
  const sent: SentMessage[] = [];
  return {
    channel,
    sent,
    send(alert, recipient) {
      onSend?.(alert, recipient);
      sent.push({ recipient, alert, sentAt: clock.now() });
      return Promise.resolve();
    },
  };
}

/** Logs every send through `sink` and records it — used in tests and the replay demo. */
export function consoleAdapter(clock: Clock, sink: (line: string) => void): RecordingAdapter {
  return recordingAdapter('console', clock, (alert, recipient) => {
    sink(`[watch] ${recipient}: ${alert.title} — ${alert.body}`);
  });
}

/** Fixture-backed in-app notification center — same shape as the real one will be. */
export function inAppAdapter(clock: Clock): RecordingAdapter {
  return recordingAdapter('in_app', clock);
}

/**
 * Stands in for the real Telegram adapter (needs a bot token — not yet available, see
 * tracker/IMPLEMENTATION-PLAN.md "Open blockers"). Same interface, so the real one swaps in
 * behind `ChannelAdapter` without touching the loop.
 */
export function telegramTestAdapter(clock: Clock): RecordingAdapter {
  return recordingAdapter('telegram', clock);
}
