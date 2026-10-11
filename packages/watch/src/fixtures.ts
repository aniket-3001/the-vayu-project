import type { Alert } from '@vayu/contracts';

/** A minimal, contract-valid alert for tests and the scenarios. */
export function fixtureAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    schemaVersion: 1,
    id: 'alert-1',
    ruleId: 'rule-grap-early-warning',
    audience: { groupId: 'school-demo', role: 'principal' },
    title: 'Heads up: GRAP likely tomorrow',
    body: 'Forecast AQI is trending into the warning band.',
    facts: { aqi: 285 },
    createdAt: '2026-10-05T06:00:00.000Z',
    mode: 'model',
    actions: ['seen', 'planned', 'done'],
    policyId: 'policy_school_grap',
    ...overrides,
  };
}
