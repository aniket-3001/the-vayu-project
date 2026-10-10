// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { FIRE_REPORTS_STORAGE_KEY, submitFireReport } from './fireReport';

const draft = {
  lat: 30.91234567,
  lng: 75.5,
  hoursAgo: 2.4,
  frp: 12.34,
  note: '  smoke on the road ',
};
const now = (): Date => new Date('2026-10-11T00:00:00.000Z');

describe('submitFireReport', () => {
  it('posts a trimmed, rounded report to /v1/fire-reports', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const how = await submitFireReport(draft, { baseUrl: 'https://x.test/', fetchImpl, now });
    expect(how).toBe('sent');
    const [url, init] = fetchImpl.mock.calls[0] as [string, { body: string }];
    expect(url).toBe('https://x.test/v1/fire-reports');
    expect(JSON.parse(init.body)).toEqual({
      lat: 30.9123,
      lng: 75.5,
      hoursAgo: 2,
      frp: 12.3,
      note: 'smoke on the road',
      sentAt: '2026-10-11T00:00:00.000Z',
    });
  });

  it('keeps it on the device when there is no API, and says so', async () => {
    const storage = window.localStorage;
    storage.removeItem(FIRE_REPORTS_STORAGE_KEY);
    expect(await submitFireReport({ lat: 28.6, lng: 77.2 }, { storage, now })).toBe('saved');
    expect(JSON.parse(storage.getItem(FIRE_REPORTS_STORAGE_KEY) ?? '[]')).toHaveLength(1);
  });

  it('says what the server said when it refuses, and never calls it sent', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      json: () =>
        Promise.resolve({ error: { message: 'You have sent a few reports already today.' } }),
    });
    await expect(submitFireReport(draft, { baseUrl: '', fetchImpl, now })).rejects.toThrow(
      'a few reports already today',
    );
  });

  it('says when the server cannot be reached', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(submitFireReport(draft, { baseUrl: '', fetchImpl, now })).rejects.toThrow(
      'could not reach the server',
    );
  });
});
