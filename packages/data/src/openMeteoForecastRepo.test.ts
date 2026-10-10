import { describe, expect, it, vi } from 'vitest';
import { openMeteoForecastRepo } from './openMeteoForecastRepo';

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
  } as Response;
}

describe('openMeteoForecastRepo', () => {
  it('parses the hourly arrays into valid, future-only RawHour shapes', async () => {
    // Open-Meteo returns local Asia/Kolkata (UTC+5:30) wall-clock strings with no offset suffix.
    // asOf = 2026-10-05T00:00:00Z is 2026-10-05T05:30 local, so the 04:00 local hour is the one
    // that must be dropped, and 06:00/07:00 local must survive, converted correctly to UTC.
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        hourly: {
          time: ['2026-10-05T04:00', '2026-10-05T06:00', '2026-10-05T07:00'],
          pm2_5: [80.1, 85.4, null],
          pm10: [130.2, 140.0, null],
        },
      }),
    );
    const repo = openMeteoForecastRepo({ fetchImpl });

    const hours = await repo.forecastFor({ lat: 28.6, lng: 77.2 }, '2026-10-05T00:00:00Z');

    expect(hours).toEqual([
      { hourStart: '2026-10-05T00:30:00.000Z', pm25: 85.4, pm10: 140.0 },
      { hourStart: '2026-10-05T01:30:00.000Z', pm25: null, pm10: null },
    ]);
  });

  it('requests the parameters named in the build spec', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ hourly: { time: [], pm2_5: [], pm10: [] } }));
    const repo = openMeteoForecastRepo({ fetchImpl });

    await repo.forecastFor({ lat: 28.6, lng: 77.2 }, '2026-10-05T00:00:00Z');

    const [url] = fetchImpl.mock.calls[0] as [string];
    expect(url).toContain('latitude=28.6');
    expect(url).toContain('longitude=77.2');
    expect(url).toContain('hourly=pm2_5,pm10');
    expect(url).toContain('timezone=Asia%2FKolkata');
  });

  it('throws a clear error on a failed request', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false));
    const repo = openMeteoForecastRepo({ fetchImpl });

    await expect(
      repo.forecastFor({ lat: 28.6, lng: 77.2 }, '2026-10-05T00:00:00Z'),
    ).rejects.toThrow(/Open-Meteo request failed/);
  });
});
