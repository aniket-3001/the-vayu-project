import { describe, expect, it } from 'vitest';
import { fixCheckDefinition } from '../lib/fixCheckDefinition';

interface State {
  Type: string;
  Next?: string;
  End?: boolean;
  Default?: string;
  SecondsPath?: string;
  Seconds?: number;
  TimeoutSeconds?: number;
  Choices?: { Next: string; Variable: string }[];
  Catch?: { Next: string }[];
}
const definition = fixCheckDefinition(
  'arn:aws:lambda:ap-south-1:123456789012:function:fixcheck',
) as {
  StartAt: string;
  TimeoutSeconds: number;
  States: Record<string, State>;
};
const states = definition.States;
const targets = (state: State): string[] => [
  ...(state.Next === undefined ? [] : [state.Next]),
  ...(state.Default === undefined ? [] : [state.Default]),
  ...(state.Choices ?? []).map((choice) => choice.Next),
  ...(state.Catch ?? []).map((handler) => handler.Next),
];

describe('the FixCheck definition', () => {
  it('only goes to states that exist, and every state can be reached from the start', () => {
    for (const [name, state] of Object.entries(states)) {
      for (const target of targets(state))
        expect(states[target], `${name} -> ${target}`).toBeDefined();
    }
    const seen = new Set<string>();
    const visit = (name: string): void => {
      if (seen.has(name)) return;
      seen.add(name);
      for (const target of targets(states[name] ?? { Type: 'Fail' })) visit(target);
    };
    visit(definition.StartAt);
    expect([...seen].sort()).toEqual(Object.keys(states).sort());
  });

  it('rule I9: every task has a time limit, and the whole run has one', () => {
    for (const [name, state] of Object.entries(states)) {
      if (state.Type === 'Task') expect(state.TimeoutSeconds, name).toBeGreaterThan(0);
    }
    expect(definition.TimeoutSeconds).toBeGreaterThan(0);
  });

  it('rule I9: the only wait takes its length from the input, never from a number in the machine', () => {
    const waits = Object.entries(states).filter(([, state]) => state.Type === 'Wait');
    expect(waits).toHaveLength(1);
    expect(waits[0]?.[1].SecondsPath).toBe('$.waitSeconds');
    expect(waits[0]?.[1].Seconds).toBeUndefined();
  });

  it('can only loop back to the wait while looks are left, and always ends in Record or a Fail', () => {
    const backEdges = Object.entries(states).filter(([, state]) =>
      targets(state).includes('WaitToLook'),
    );
    expect(backEdges.map(([name]) => name).sort()).toEqual(['Baseline', 'Looked']);
    const looked = states.Looked;
    const loop = looked?.Choices?.find((choice) => choice.Next === 'WaitToLook');
    expect(loop?.Variable).toBe('$.triesLeft');
    expect(looked?.Default).toBe('Record');
    for (const name of ['Baseline', 'Verify']) {
      expect(states[name]?.Catch?.[0]?.Next, name).toBe('Record');
    }
    const terminal = Object.entries(states).filter(
      ([, state]) => state.End === true || state.Type === 'Fail',
    );
    expect(terminal.map(([name]) => name).sort()).toEqual(['Record', 'RecordFailed']);
  });
});
