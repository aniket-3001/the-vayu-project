import { describe, expect, it } from 'vitest';
import { STATIONS_KEY, STATIONS_TTL_SECONDS, snapshotStations } from './stationsSnapshot';

describe('the stations snapshot', () => {
  it('keeps the monitors, and when they were read, for three hours', async () => {
    const puts: { key: string; value: unknown; expiresAt: number }[] = [];
    const now = '2026-10-10T12:00:00.000Z';
    const result = await snapshotStations({
      repo: {
        latest: () =>
          Promise.resolve([
            { id: 'a', name: 'A', lat: 28, lng: 77, pm25: 50, at: '2026-10-10T11:00:00.000Z' },
          ]),
      },
      cache: {
        put: (key, value, expiresAt) => {
          puts.push({ key, value, expiresAt });
          return Promise.resolve();
        },
      },
      now,
    });
    expect(result).toEqual({ stations: 1 });
    expect(puts).toHaveLength(1);
    expect(puts[0]?.key).toBe(STATIONS_KEY);
    expect(puts[0]?.expiresAt).toBe(Date.parse(now) / 1000 + STATIONS_TTL_SECONDS);
    expect(puts[0]?.value).toMatchObject({ harvestedAt: now });
  });

  it('writes nothing when the monitors cannot be read, so the last good snapshot stays', async () => {
    const puts: unknown[] = [];
    await expect(
      snapshotStations({
        repo: { latest: () => Promise.reject(new Error('OpenAQ down')) },
        cache: { put: () => Promise.resolve(void puts.push(1)) },
        now: '2026-10-10T12:00:00.000Z',
      }),
    ).rejects.toThrow('OpenAQ down');
    expect(puts).toEqual([]);
  });
});
