import type { Alert, Policy } from '@vayu/contracts';

export interface ExecutionStep {
  readonly index: number;
  readonly action: string;
  readonly to: string;
  /** Whole seconds, at least 1: Step Functions rejects a timeout of 0. */
  readonly waitSeconds: number;
}

export interface ExecutionInput {
  readonly alert: Alert;
  readonly steps: readonly ExecutionStep[];
}

/**
 * The input the AlertLoop state machine expects. Each wait is the policy's minutes divided by
 * `demoTimeScale` (so "a day in 30 seconds" is a real run), rounded up to a whole second and never
 * below 1, because the final escalate step has a wait of 0 minutes.
 */
export function buildExecutionInput(
  policy: Policy,
  alert: Alert,
  options: { readonly timeScale?: number } = {},
): ExecutionInput {
  const scale = options.timeScale ?? policy.demoTimeScale;
  if (!(scale > 0)) throw new RangeError('timeScale must be above 0');
  return {
    alert,
    steps: policy.steps.map((step, index) => ({
      index,
      action: step.action,
      to: step.to,
      waitSeconds: Math.max(1, Math.ceil((step.waitMin * 60) / scale)),
    })),
  };
}
