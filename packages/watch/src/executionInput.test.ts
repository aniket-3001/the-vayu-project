import { describe, expect, it } from 'vitest';
import { buildExecutionInput } from './executionInput';
import { fixtureAlert } from './fixtures';
import { loadPolicy } from './policy';

const policy = loadPolicy('policy_school_grap'); // 30, 30, 0 minutes; demoTimeScale 60

describe('buildExecutionInput', () => {
  it('divides each wait by the demo time scale (a 30-minute wait becomes 30 seconds)', () => {
    const { steps } = buildExecutionInput(policy, fixtureAlert());
    expect(steps.map((s) => s.waitSeconds)).toEqual([30, 30, 1]);
  });

  it('never produces a zero wait, because Step Functions rejects TimeoutSeconds of 0', () => {
    for (const scale of [1, 60, 100_000]) {
      const { steps } = buildExecutionInput(policy, fixtureAlert(), { timeScale: scale });
      for (const step of steps) {
        expect(Number.isInteger(step.waitSeconds)).toBe(true);
        expect(step.waitSeconds).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('runs in real time when the scale is 1', () => {
    const { steps } = buildExecutionInput(policy, fixtureAlert(), { timeScale: 1 });
    expect(steps.map((s) => s.waitSeconds)).toEqual([1800, 1800, 1]);
  });

  it('numbers the steps in order and keeps who each goes to', () => {
    const { steps } = buildExecutionInput(policy, fixtureAlert());
    expect(steps.map((s) => [s.index, s.action, s.to])).toEqual([
      [0, 'send', 'principal'],
      [1, 'remind', 'principal'],
      [2, 'escalate', 'vice_principal'],
    ]);
  });

  it('refuses a scale that is not above 0', () => {
    expect(() => buildExecutionInput(policy, fixtureAlert(), { timeScale: 0 })).toThrow(RangeError);
  });
});
