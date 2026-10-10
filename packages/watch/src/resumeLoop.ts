import type { AckRecord } from './linking';
import type { TokenStore } from './tokenStore';

/** Thrown by a `SendTaskSuccess` implementation when the task already finished or timed out. */
export class StaleTaskTokenError extends Error {
  constructor() {
    super('The task this token belongs to has already finished or timed out');
    this.name = 'StaleTaskTokenError';
  }
}

export type SendTaskSuccess = (taskToken: string, output: string) => Promise<void>;

export type ResumeOutcome = 'resumed' | 'nothing_waiting' | 'already_finished';

/**
 * Turns a first-time tap into "the person answered": finds the step the alert is waiting on and
 * tells Step Functions it succeeded, so the loop stops instead of reminding or escalating. A tap
 * with no waiting step (the alert already finished) is fine and changes nothing. Any other error
 * propagates, because a lost tap would let the loop escalate to someone else by mistake.
 */
export function resumeAlertLoop(deps: {
  readonly tokens: TokenStore;
  readonly sendTaskSuccess: SendTaskSuccess;
}): (ack: AckRecord) => Promise<ResumeOutcome> {
  return async (ack) => {
    const token = await deps.tokens.getToken(ack.alertId);
    if (token === null) return 'nothing_waiting';
    try {
      await deps.sendTaskSuccess(
        token,
        JSON.stringify({ action: ack.action, chatId: ack.chatId, at: ack.at }),
      );
    } catch (error) {
      if (error instanceof StaleTaskTokenError) {
        await deps.tokens.deleteToken(ack.alertId);
        return 'already_finished';
      }
      throw error;
    }
    await deps.tokens.deleteToken(ack.alertId);
    return 'resumed';
  };
}
