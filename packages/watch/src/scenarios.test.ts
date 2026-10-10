import { fixedClock } from '@vayu/core';
import { describe, expect, it, vi } from 'vitest';
import { consoleAdapter } from './adapters';
import { fixtureAlert } from './fixtures';
import {
  grapEarlyWarningScenario,
  shouldFireWindowReminder,
  walkGroupCallUp,
  windowReminderScenario,
  type ScenarioDeps,
} from './scenarios';

const clock = fixedClock('2026-10-05T06:00:00.000Z');

describe('grapEarlyWarningScenario (S5)', () => {
  it('escalates to the vice principal on a scaled clock when the principal never acks', async () => {
    const adapter = consoleAdapter(clock, () => undefined);
    const waitForAck = vi.fn().mockResolvedValue(null);
    const deps: ScenarioDeps = { adapter, clock, waitForAck };

    const result = await grapEarlyWarningScenario(deps);

    expect(result.outcome).toBe('exhausted');
    expect(adapter.sent.map((message) => message.recipient)).toEqual([
      'principal',
      'principal',
      'vice_principal',
    ]);
  });

  it('stops the moment the principal acks', async () => {
    const adapter = consoleAdapter(clock, () => undefined);
    const waitForAck = vi.fn().mockResolvedValue({ at: clock.now() });
    const deps: ScenarioDeps = { adapter, clock, waitForAck };

    const result = await grapEarlyWarningScenario(deps);

    expect(result.outcome).toBe('acked');
    expect(adapter.sent).toHaveLength(1);
  });
});

describe('walkGroupCallUp (S5)', () => {
  it('reaches every member of the group together, with no escalation', async () => {
    const adapter = consoleAdapter(clock, () => undefined);
    const alert = fixtureAlert({ audience: { groupId: 'walk-group', role: 'member' } });

    await walkGroupCallUp(adapter, alert, ['a', 'b', 'c']);

    expect(adapter.sent.map((message) => message.recipient).sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('shouldFireWindowReminder (F09)', () => {
  it('fires when outside overtakes inside and inside is rising fast', () => {
    expect(shouldFireWindowReminder(120, 90, 70)).toBe(true); // outside 120 > 1.2*90=108, rise 28.6%
  });

  it('does not fire when inside has not risen enough', () => {
    expect(shouldFireWindowReminder(120, 90, 85)).toBe(false); // rise only ~5.9%
  });

  it('does not fire when outside has not overtaken inside enough', () => {
    expect(shouldFireWindowReminder(100, 90, 70)).toBe(false); // 100 < 1.2*90=108
  });

  it('never fires from a zero or negative baseline', () => {
    expect(shouldFireWindowReminder(120, 90, 0)).toBe(false);
  });
});

describe('windowReminderScenario (S5)', () => {
  it('sends the reminder when the rule fires', async () => {
    const adapter = consoleAdapter(clock, () => undefined);
    const alert = fixtureAlert();

    const fired = await windowReminderScenario(adapter, alert, 'resident', 120, 90, 70);

    expect(fired).toBe(true);
    expect(adapter.sent).toHaveLength(1);
  });

  it('sends nothing when the rule does not fire', async () => {
    const adapter = consoleAdapter(clock, () => undefined);
    const alert = fixtureAlert();

    const fired = await windowReminderScenario(adapter, alert, 'resident', 100, 90, 85);

    expect(fired).toBe(false);
    expect(adapter.sent).toHaveLength(0);
  });
});
