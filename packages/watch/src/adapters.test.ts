import { fixedClock } from '@vayu/core';
import { describe, expect, it } from 'vitest';
import {
  consoleAdapter,
  inAppAdapter,
  telegramTestAdapter,
  type RecordingAdapter,
} from './adapters';
import { fixtureAlert } from './fixtures';

const clock = fixedClock('2026-10-05T06:30:00.000Z');

const adapters: readonly [string, () => RecordingAdapter][] = [
  ['console', () => consoleAdapter(clock, () => undefined)],
  ['in_app', () => inAppAdapter(clock)],
  ['telegram (test double)', () => telegramTestAdapter(clock)],
];

describe.each(adapters)('%s adapter', (_, makeAdapter) => {
  it('records what it sent, to whom, and when', async () => {
    const adapter = makeAdapter();
    const alert = fixtureAlert();

    await adapter.send(alert, 'principal');

    expect(adapter.sent).toEqual([{ recipient: 'principal', alert, sentAt: clock.now() }]);
  });

  it('records every send, in order', async () => {
    const adapter = makeAdapter();
    const alert = fixtureAlert();

    await adapter.send(alert, 'principal');
    await adapter.send(alert, 'vice_principal');

    expect(adapter.sent.map((message) => message.recipient)).toEqual([
      'principal',
      'vice_principal',
    ]);
  });
});
