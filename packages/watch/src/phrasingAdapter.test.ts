import { fixedClock } from '@vayu/core';
import { describe, expect, it } from 'vitest';
import { inAppAdapter, type ChannelAdapter, type RecordingAdapter } from './adapters';
import { fixtureAlert } from './fixtures';
import type { Generate } from './phrase';
import { MODEL_FOOTER, TEMPLATE_FOOTER, phrasingAdapter } from './phrasingAdapter';

const ALERT = fixtureAlert({
  body: 'Forecast AQI crosses the Stage IV threshold at 410.',
  facts: { aqi: 410, stage: 'IV' },
});

function setup(generate: Generate): {
  inner: RecordingAdapter;
  adapter: ChannelAdapter;
} {
  const inner = inAppAdapter(fixedClock('2026-10-05T06:00:00.000Z'));
  return { inner, adapter: phrasingAdapter(inner, generate) };
}

describe('phrasingAdapter', () => {
  it('sends the model wording with an AI footer when the numbers match', async () => {
    const { inner, adapter } = setup(() =>
      Promise.resolve('Stage IV looks likely, with AQI at 410.'),
    );
    await adapter.send(ALERT, 'principal');
    expect(inner.sent[0]?.alert.body).toBe(
      `Stage IV looks likely, with AQI at 410.\n\n${MODEL_FOOTER}`,
    );
  });

  it('sends the plain template with a template footer when the model invents a number', async () => {
    const { inner, adapter } = setup(() =>
      Promise.resolve('Stage IV looks likely, with AQI at 450.'),
    );
    await adapter.send(ALERT, 'principal');
    expect(inner.sent[0]?.alert.body).toBe(`${ALERT.body}\n\n${TEMPLATE_FOOTER}`);
  });

  it('still sends, with the template, when the model is down', async () => {
    const { inner, adapter } = setup(() => Promise.reject(new Error('AccessDenied')));
    await adapter.send(ALERT, 'principal');
    expect(inner.sent).toHaveLength(1);
    expect(inner.sent[0]?.alert.body).toContain(TEMPLATE_FOOTER);
  });

  it('never changes who gets what or when: only the body differs', async () => {
    const { inner, adapter } = setup(() => Promise.resolve('Reworded, AQI 410.'));
    await adapter.send(ALERT, 'principal');
    const sent = inner.sent[0];
    expect(sent?.recipient).toBe('principal');
    expect(sent?.alert).toEqual({ ...ALERT, body: expect.stringContaining('Reworded') as string });
    expect(adapter.channel).toBe(inner.channel);
  });
});
