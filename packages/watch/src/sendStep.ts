import type { Alert } from '@vayu/contracts';
import type { Clock } from '@vayu/core';
import type { ChannelAdapter } from './adapters';
import type { TokenStore } from './tokenStore';

/** What Step Functions hands the Send task for one step of the loop. */
export interface SendStepInput {
  readonly alert: Alert;
  readonly step: { readonly index: number; readonly action: string; readonly to: string };
  readonly taskToken: string;
}

export interface SendStepDeps {
  readonly adapter: ChannelAdapter;
  readonly tokens: TokenStore;
  readonly clock: Clock;
  /** The kill switch: false stops every send before anything is stored or sent. */
  readonly sendsEnabled: () => Promise<boolean>;
}

export class SendsDisabledError extends Error {
  constructor() {
    super('Sends are switched off (kill switch)');
    this.name = 'SendsDisabledError';
  }
}

/**
 * One Send task of the AlertLoop. Order matters: kill switch first, then store the task token (so
 * a fast tap can always find it), then send. If the send fails the token is dropped and the error
 * propagates, so the state machine's Catch can move on to the next step instead of waiting for a
 * tap that cannot come. Which step, who is next and how long to wait stay in the policy.
 */
export async function sendStep(deps: SendStepDeps, input: SendStepInput): Promise<void> {
  if (!(await deps.sendsEnabled())) throw new SendsDisabledError();

  const { alert, step, taskToken } = input;
  await deps.tokens.saveToken(alert.id, taskToken, new Date(deps.clock.now()).getTime());
  try {
    await deps.adapter.send(alert, step.to, {
      step: `${step.index}-${step.action}`,
      action: step.action,
    });
  } catch (error) {
    await deps.tokens.deleteToken(alert.id);
    throw error;
  }
}
