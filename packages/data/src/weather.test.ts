import { describe, expect, it, vi } from 'vitest';
import { cachedWeatherRepo, fixtureWeatherRepo, openMeteoWeatherRepo } from './weather';

const BODY = {
  hourly: {
    time: ['2026-10-08T14:00', '2026-10-08T15:00', '2026-10-08T16:00'],
    temperature_2m: [31, 32.4, 31.8],
    relative_humidity_2m: [40, 38, 41],
    wind_speed_10m: [5.2, 6.1, 7],
    wind_direction_10m: [300, 310, 315],
  },
};
const reply = (body: unknown, status = 200): typeof fetch =>
  vi.fn().mockResolvedValue({ ok: status < 400, status, json: () => Promise.resolve(body) });

// 15:00 India time is 09:30 UTC.
const ASOF = '2026-10-08T10:05:00.000Z';

describe('openMeteoWeatherRepo', () => {
  it('returns the hour that contains the as-of time, with India time converted correctly', async () => {
    const weather = await openMeteoWeatherRepo({ fetchImpl: reply(BODY) }).nowAt(
      { lat: 28.6, lng: 77.2 },
      ASOF,
    );
    expect(weather).toEqual({
      at: '2026-10-08T09:30:00.000Z',
      windKmh: 6.1,
      windFromDeg: 310,
      rhPct: 38,
      tempC: 32.4,
    });
  });

  it('asks for km/h, India time and only what it uses', async () => {
    const urls: string[] = [];
    const fetchImpl = ((url: string) => {
      urls.push(url);
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(BODY) });
    }) as unknown as typeof fetch;
    await openMeteoWeatherRepo({ fetchImpl }).nowAt({ lat: 28.6, lng: 77.2 }, ASOF);
    expect(urls[0]).toContain('wind_speed_unit=kmh');
    expect(urls[0]).toContain('timezone=Asia%2FKolkata');
    expect(urls[0]).toContain(
      'hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m',
    );
  });

  it('says nothing (undefined) when the model has no value for that hour, instead of a guess', async () => {
    const odd = { hourly: { ...BODY.hourly, wind_speed_10m: [5, null, 7] } };
    expect(
      await openMeteoWeatherRepo({ fetchImpl: reply(odd) }).nowAt({ lat: 1, lng: 2 }, ASOF),
    ).toBeUndefined();
    expect(
      await openMeteoWeatherRepo({ fetchImpl: reply(BODY) }).nowAt(
        { lat: 1, lng: 2 },
        '2026-12-01T00:00:00.000Z',
      ),
    ).toBeUndefined();
  });

  it('fails loudly on an error status, so the caller can leave weather out', async () => {
    await expect(
      openMeteoWeatherRepo({ fetchImpl: reply({}, 500) }).nowAt({ lat: 1, lng: 2 }, ASOF),
    ).rejects.toThrow(/500/);
  });
});

describe('cachedWeatherRepo', () => {
  it('asks once per place and hour, even when asked many times', async () => {
    const fetchImpl = reply(BODY);
    const repo = cachedWeatherRepo(openMeteoWeatherRepo({ fetchImpl }), 15 * 60_000);
    for (let i = 0; i < 5; i++) await repo.nowAt({ lat: 28.5921, lng: 77.046 }, ASOF);
    await repo.nowAt({ lat: 28.5949, lng: 77.0463 }, ASOF); // the same 1 km cell
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('never remembers a failure', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve({}) })
      .mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(BODY) });
    const repo = cachedWeatherRepo(
      openMeteoWeatherRepo({ fetchImpl: fetchImpl as unknown as typeof fetch }),
      60_000,
    );
    await expect(repo.nowAt({ lat: 28.6, lng: 77.2 }, ASOF)).rejects.toThrow();
    expect((await repo.nowAt({ lat: 28.6, lng: 77.2 }, ASOF))?.windKmh).toBe(6.1);
  });
});

describe('fixtureWeatherRepo', () => {
  it('gives a fixed, valid value', async () => {
    const w = await fixtureWeatherRepo().nowAt({ lat: 28.6, lng: 77.2 }, ASOF);
    expect(w?.windKmh).toBeGreaterThanOrEqual(0);
  });
});
