import type { Alert, Policy } from '@vayu/contracts';
import type { Clock } from '@vayu/core';
import type { ChannelAdapter } from './adapters';

export type LoopOutcome = 'acked' | 'exhausted';

export interface LoopStepRecord {
  readonly action: string;
  readonly to: string;
  readonly sentAt: string;
  readonly ackedAt: string | null;
}

export interface LoopResult {
  readonly outcome: LoopOutcome;
  readonly steps: readonly LoopStepRecord[];
}

export interface AckArrival {
  readonly at: string;
}

/** Waits up to `timeoutMs` for an ack on `alertId`; resolves `null` on timeout. Never un-timed. */
export type WaitForAck = (alertId: string, timeoutMs: number) => Promise<AckArrival | null>;

export interface AlertLoopDeps {
  readonly adapter: ChannelAdapter;
  readonly clock: Clock;
  readonly waitForAck: WaitForAck;
}

/**
 * Walks a policy's steps in order (send, remind, escalate, ...): send, then wait up to that
 * step's timeout (scaled by `demoTimeScale`, rule I9 — every wait has a timeout) for an ack. Stops
 * the instant an ack arrives. A straight, single pass through the steps means a step is never
 * sent twice for the same occurrence (rule I8).
 */
export async function runAlertLoop(
  policy: Policy,
  alert: Alert,
  deps: AlertLoopDeps,
): Promise<LoopResult> {
  const steps: LoopStepRecord[] = [];

  for (const [index, step] of policy.steps.entries()) {
    const sentAt = deps.clock.now();
    await deps.adapter.send(alert, step.to, {
      step: `${index}-${step.action}`,
      action: step.action,
    });
    const timeoutMs = (step.waitMin * 60_000) / policy.demoTimeScale;
    const ack = await deps.waitForAck(alert.id, timeoutMs);
    steps.push({ action: step.action, to: step.to, sentAt, ackedAt: ack?.at ?? null });
    if (ack) {
      return { outcome: 'acked', steps };
    }
  }

  return { outcome: 'exhausted', steps };
}
