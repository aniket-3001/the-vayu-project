import { PolicySchema } from '@vayu/contracts';
import { describe, expect, it } from 'vitest';
import { loadPolicy } from './policy';

describe('loadPolicy', () => {
  it('loads the known school GRAP policy', () => {
    const policy = loadPolicy('policy_school_grap');
    expect(policy.steps.map((step) => step.action)).toEqual(['send', 'remind', 'escalate']);
    expect(policy.demoTimeScale).toBe(60);
  });

  it('rejects an unknown policy id', () => {
    expect(() => loadPolicy('nope')).toThrow(/unknown policy/);
  });

  it('fails at load when a policy is missing a required field', () => {
    expect(() =>
      PolicySchema.parse({
        id: 'broken',
        steps: [{ action: 'send', to: 'principal' }], // missing waitMin
        demoTimeScale: 1,
      }),
    ).toThrow();
  });

  it('fails at load when demoTimeScale is missing', () => {
    expect(() =>
      PolicySchema.parse({
        id: 'broken',
        steps: [],
      }),
    ).toThrow();
  });
});
