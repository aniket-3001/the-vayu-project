import type { Alert } from '@vayu/contracts';
import type { Clock } from '@vayu/core';
import type { ChannelAdapter } from './adapters';
import { runAlertLoop, type LoopResult, type WaitForAck } from './alertLoop';
import { fixtureAlert } from './fixtures';
import { loadPolicy } from './policy';

export interface ScenarioDeps {
  readonly adapter: ChannelAdapter;
  readonly clock: Clock;
  readonly waitForAck: WaitForAck;
}

/** Scene S5: the GRAP Stage IV early heads-up, escalating from the principal if unacked. */
export async function grapEarlyWarningScenario(deps: ScenarioDeps): Promise<LoopResult> {
  const policy = loadPolicy('policy_school_grap');
  const alert = fixtureAlert({
    id: 'scenario-grap-early-warning',
    ruleId: 'rule-grap-early-warning',
    title: 'GRAP Stage IV likely tomorrow',
    body: 'Forecast AQI crosses the official Stage IV threshold. Consider keeping tomorrow indoor.',
    facts: { aqi: 410 },
  });
  return runAlertLoop(policy, alert, deps);
}

/**
 * Scene S5: one call-up sent to every member of the walk group at once, no escalation —
 * each person answers `im_in` or `not_today` on their own, there is nobody to escalate to.
 */
export async function walkGroupCallUp(
  adapter: ChannelAdapter,
  alert: Alert,
  members: readonly string[],
): Promise<void> {
  await Promise.all(members.map((member) => adapter.send(alert, member)));
}

/**
 * F09, the window reminder rule: fire when outside has risen above 1.2x inside and inside
 * itself has risen at least 20% over the last 15 minutes — a window left open is now letting
 * more in than it's worth. Demo-only: fed from the replay series; a real unit is P2.
 */
export function shouldFireWindowReminder(
  outsideNowPm25: number,
  insideNowPm25: number,
  insideFifteenMinAgoPm25: number,
): boolean {
  if (insideFifteenMinAgoPm25 <= 0) {
    return false;
  }
  const insideRisePct = (insideNowPm25 - insideFifteenMinAgoPm25) / insideFifteenMinAgoPm25;
  return outsideNowPm25 > 1.2 * insideNowPm25 && insideRisePct >= 0.2;
}

/** Scene S5: sends the window-close reminder once the rule fires. */
export async function windowReminderScenario(
  adapter: ChannelAdapter,
  alert: Alert,
  recipient: string,
  outsideNowPm25: number,
  insideNowPm25: number,
  insideFifteenMinAgoPm25: number,
): Promise<boolean> {
  const fires = shouldFireWindowReminder(outsideNowPm25, insideNowPm25, insideFifteenMinAgoPm25);
  if (fires) {
    await adapter.send(alert, recipient);
  }
  return fires;
}
