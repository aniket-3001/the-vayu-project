import { describe, expect, it } from 'vitest';
import { cityOf, parseBatch } from './analyticsModel';

const event = { kind: 'feature', detail: 'search', n: 1, at: '2026-10-26T10:00:00.000Z' };
const good = {
  deviceId: 'dev-12345678',
  sessionId: 'ses-12345678',
  device: {
    platform: 'android',
    appVersion: '0.1.0',
    os: 'Android 14',
    model: 'Pixel',
    screen: '360x800',
    lang: 'en-IN',
  },
  events: [event],
};
const code = (raw: unknown): string => {
  const out = parseBatch(raw);
  return out.ok ? 'ok' : out.code;
};

describe('parseBatch', () => {
  it('accepts a valid batch', () => {
    expect(code(good)).toBe('ok');
  });
  it('refuses too many events, unknown kinds and details outside the allow-list', () => {
    expect(code({ ...good, events: Array.from({ length: 26 }, () => event) })).toBe(
      'too_many_events',
    );
    expect(code({ ...good, events: [] })).toBe('no_events');
    expect(code({ ...good, events: [{ ...event, kind: 'spy' }] })).toBe('bad_event');
    expect(code({ ...good, events: [{ ...event, detail: 'my secret search text' }] })).toBe(
      'bad_event',
    );
  });
  it('refuses bad ids and bad counts', () => {
    expect(code({ ...good, deviceId: 'has spaces here' })).toBe('bad_device_id');
    expect(code({ ...good, deviceId: 'a'.repeat(65) })).toBe('bad_device_id');
    for (const n of [0, -1, 1.5, Number.NaN, 99999, '5'])
      expect(code({ ...good, events: [{ ...event, n }] })).toBe('bad_event');
  });
  it('drops a claimed user id, cleans free text and rounds the cell', () => {
    const out = parseBatch({
      ...good,
      userId: 'someone-else',
      device: { ...good.device, cell: { lat: 12.9716, lng: 77.5946 } },
      events: [{ kind: 'error', detail: `<b>${'x'.repeat(200)}</b>`, at: event.at }],
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(JSON.stringify(out.batch)).not.toContain('someone-else');
    expect(out.batch.device.cell).toEqual({ lat: 13, lng: 77.6 });
    expect(out.batch.events[0]?.detail).toHaveLength(80);
    expect(out.batch.events[0]?.detail).not.toContain('<');
  });
});

describe('cityOf', () => {
  it('names the nearest city, else Other', () => {
    expect(cityOf(28.61, 77.21)).toBe('Delhi');
    expect(cityOf(12.97, 77.59)).toBe('Bengaluru');
    expect(cityOf(0, 0)).toBe('Other');
  });
});
