import { describe, expect, it } from 'vitest';
import { createCollector } from './collector';
import type { Batch, DeviceInfo } from './types';

const device: DeviceInfo = {
  platform: 'web',
  appVersion: '0.1.0',
  os: 'x',
  model: 'x',
  screen: '1x1',
  lang: 'en',
};

const setup = (
  send: (b: Batch) => Promise<boolean>,
  extra: { maxQueue?: number } = {},
): { collector: ReturnType<typeof createCollector>; sent: Batch[] } => {
  const sent: Batch[] = [];
  let tick = 0;
  const collector = createCollector({
    send: (b) => {
      sent.push(b);
      return send(b);
    },
    deviceId: () => 'dev-12345678',
    sessionId: 'ses-12345678',
    device: () => device,
    now: () => `2026-10-26T10:00:${String(tick++ % 60).padStart(2, '0')}.000Z`,
    ...extra,
  });
  return { collector, sent };
};

describe('collector', () => {
  it('sends queued events in one batch with device and session', async () => {
    const { collector, sent } = setup(() => Promise.resolve(true));
    collector.track('screen', 'map');
    collector.track('feature', 'search');
    await collector.flush();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ deviceId: 'dev-12345678', sessionId: 'ses-12345678', device });
    expect(sent[0]?.events.map((e) => e.detail)).toEqual(['map', 'search']);
  });

  it('splits more than 25 events into several batches, in order', async () => {
    const { collector, sent } = setup(() => Promise.resolve(true));
    for (let i = 0; i < 30; i += 1) collector.track('feature', 'search', i + 1);
    await collector.flush();
    expect(sent.map((b) => b.events.length)).toEqual([25, 5]);
    expect(sent[1]?.events[0]?.n).toBe(26);
  });

  it('retries a failed batch once on the next flush, then drops it', async () => {
    const { collector, sent } = setup(() => Promise.resolve(false));
    collector.track('feature', 'search');
    await collector.flush();
    await collector.flush();
    await collector.flush();
    expect(sent).toHaveLength(2);
  });

  it('never throws, even when sending throws', async () => {
    const { collector } = setup(() => {
      throw new Error('offline');
    });
    collector.track('error', 'boom');
    await expect(collector.flush()).resolves.toBeUndefined();
  });

  it('never keeps more than 200 events, dropping the oldest first', async () => {
    const { collector, sent } = setup(() => Promise.resolve(true));
    for (let i = 1; i <= 250; i += 1) collector.track('feature', 'search', i);
    await collector.flush();
    const all = sent.flatMap((b) => b.events);
    expect(all).toHaveLength(200);
    expect(all[0]?.n).toBe(51);
  });
});

describe('the air band on events', () => {
  const band = (current: 'hazardous' | undefined): ReturnType<typeof createCollector> => {
    const sent: Batch[] = [];
    const collector = createCollector({
      send: (b) => {
        sent.push(b);
        return Promise.resolve(true);
      },
      deviceId: () => 'dev-12345678',
      sessionId: 'ses-12345678',
      device: () => device,
      now: () => '2026-10-26T10:00:00.000Z',
      band: () => current,
    });
    (collector as unknown as { sent: Batch[] }).sent = sent;
    return collector;
  };
  const sentOf = (c: ReturnType<typeof createCollector>): Batch[] => (c as unknown as { sent: Batch[] }).sent;

  it('notes the band on what happens, but not on the note that a band was seen', async () => {
    const c = band('hazardous');
    c.track('feature', 'search');
    c.track('context', 'hazardous');
    await c.flush();
    const [feature, context] = sentOf(c)[0]?.events ?? [];
    expect(feature?.band).toBe('hazardous');
    expect(context).not.toHaveProperty('band');
  });

  it('leaves the band off until some air has loaded', async () => {
    const c = band(undefined);
    c.track('screen', 'myair');
    await c.flush();
    expect(sentOf(c)[0]?.events[0]).not.toHaveProperty('band');
  });
});
