import { fixedClock } from '@vayu/core';
import { describe, expect, it, vi } from 'vitest';
import { consoleAdapter } from './adapters';
import { runAlertLoop, type WaitForAck } from './alertLoop';
import { fixtureAlert } from './fixtures';
import { loadPolicy } from './policy';

const clock = fixedClock('2026-10-05T06:00:00.000Z');
const policy = loadPolicy('policy_school_grap'); // send(30) -> remind(30) -> escalate(0)

describe('runAlertLoop', () => {
  it('stops at the first step if it is acked', async () => {
    const adapter = consoleAdapter(clock, () => undefined);
    const waitForAck: WaitForAck = vi.fn().mockResolvedValue({ at: clock.now() });

    const result = await runAlertLoop(policy, fixtureAlert(), { adapter, clock, waitForAck });

    expect(result.outcome).toBe('acked');
    expect(result.steps).toHaveLength(1);
    expect(adapter.sent).toHaveLength(1);
    expect(adapter.sent[0]?.recipient).toBe('principal');
  });

  it('tells the adapter which step each send is, so a reminder is not mistaken for a repeat', async () => {
    const steps: (string | undefined)[] = [];
    const actions: (string | undefined)[] = [];
    const adapter = {
      channel: 'spy',
      send: (
        _alert: unknown,
        _to: string,
        context?: { step: string; action?: string },
      ): Promise<void> => {
        steps.push(context?.step);
        actions.push(context?.action);
        return Promise.resolve();
      },
    };
    const waitForAck: WaitForAck = vi.fn().mockResolvedValue(null);

    await runAlertLoop(policy, fixtureAlert(), { adapter, clock, waitForAck });

    expect(steps).toEqual(policy.steps.map((step, index) => `${index}-${step.action}`));
    expect(actions).toEqual(policy.steps.map((step) => step.action));
    expect(new Set(steps).size).toBe(steps.length);
  });

  it('reminds, then escalates, when nothing acks', async () => {
    const adapter = consoleAdapter(clock, () => undefined);
    const waitForAck: WaitForAck = vi.fn().mockResolvedValue(null);

    const result = await runAlertLoop(policy, fixtureAlert(), { adapter, clock, waitForAck });

    expect(result.outcome).toBe('exhausted');
    expect(result.steps.map((step) => step.action)).toEqual(['send', 'remind', 'escalate']);
    expect(adapter.sent.map((message) => message.recipient)).toEqual([
      'principal',
      'principal',
      'vice_principal',
    ]);
  });

  it('acks on the remind step and never reaches escalate', async () => {
    const adapter = consoleAdapter(clock, () => undefined);
    const waitForAck: WaitForAck = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ at: clock.now() });

    const result = await runAlertLoop(policy, fixtureAlert(), { adapter, clock, waitForAck });

    expect(result.outcome).toBe('acked');
    expect(result.steps.map((step) => step.action)).toEqual(['send', 'remind']);
  });

  it('scales each step timeout by demoTimeScale (minutes to ms, divided by the scale)', async () => {
    const adapter = consoleAdapter(clock, () => undefined);
    const waitForAck: WaitForAck = vi.fn().mockResolvedValue({ at: clock.now() });

    await runAlertLoop(policy, fixtureAlert(), { adapter, clock, waitForAck });

    // policy_school_grap: step 1 waits 30 min, demoTimeScale 60 -> 30 * 60_000 / 60 = 30_000ms
    expect(waitForAck).toHaveBeenCalledWith('alert-1', 30_000);
  });

  it('never sends a step twice for one occurrence (I8), even when the loop exhausts', async () => {
    const adapter = consoleAdapter(clock, () => undefined);
    const waitForAck: WaitForAck = vi.fn().mockResolvedValue(null);

    await runAlertLoop(policy, fixtureAlert(), { adapter, clock, waitForAck });

    expect(adapter.sent).toHaveLength(policy.steps.length);
  });
});
