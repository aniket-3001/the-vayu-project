import { describe, expect, it, vi } from 'vitest';
import { openMeteoGasRepo, openMeteoWeatherForecastRepo } from './weatherForecast';

const json = (body: unknown, ok = true): Response =>
  ({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) }) as Response;

// 10 Oct 2026, 17:30 India time is 12:00 UTC.
const AS_OF = '2026-10-10T12:00:00Z';

const forecastBody = {
  hourly: {
    time: [
      '2026-10-10T16:00',
      '2026-10-10T17:00',
      '2026-10-10T18:00',
      '2026-10-10T19:00',
      '2026-10-11T10:00',
    ],
    temperature_2m: [30, 29, 28, null, 33],
    relative_humidity_2m: [40, 42, 45, 47, 30],
    precipitation_probability: [0, 5, 10, 10, 0],
    precipitation: [0, 0, 0.2, 0, 0],
    weather_code: [1, 2, 3, 3, 0],
    wind_speed_10m: [8, 9, 10, 10, 6],
    wind_direction_10m: [300, 305, 310, 310, 20],
    is_day: [1, 1, 0, 0, 1],
    uv_index: [3, 1, 0, 0, 7],
  },
  daily: {
    time: ['2026-10-09', '2026-10-10', '2026-10-11'],
    weather_code: [1, 2, 0],
    temperature_2m_max: [35, 34, 33],
    temperature_2m_min: [20, 21, 20],
    precipitation_probability_max: [0, 10, 0],
    wind_speed_10m_max: [14, 15, 12],
    wind_direction_10m_dominant: [300, 310, 20],
    sunrise: ['2026-10-09T06:20', '2026-10-10T06:21', '2026-10-11T06:22'],
    sunset: ['2026-10-09T17:55', '2026-10-10T17:54', '2026-10-11T17:53'],
  },
};

describe('the weather forecast', () => {
  it('keeps the hour in progress and later, in UTC, and the days from today', async () => {
    const repo = openMeteoWeatherForecastRepo({
      fetchImpl: vi.fn().mockResolvedValue(json(forecastBody)),
    });
    const { hours, days } = await repo.forecastAt({ lat: 28.6, lng: 77.2 }, AS_OF);
    // 16:00 India has ended; 17:00 is in progress; 19:00 has no temperature so it is dropped, not zeroed.
    expect(hours.map((h) => h.t)).toEqual([
      '2026-10-10T11:30:00.000Z',
      '2026-10-10T12:30:00.000Z',
      '2026-10-11T04:30:00.000Z',
    ]);
    expect(hours[0]).toMatchObject({
      tempC: 29,
      rhPct: 42,
      windKmh: 9,
      code: 2,
      isDay: true,
      uv: 1,
    });
    expect(hours[1]?.isDay).toBe(false);
    expect(days.map((d) => d.date)).toEqual([
      '2026-10-09T18:30:00.000Z',
      '2026-10-10T18:30:00.000Z',
    ]);
    expect(days[0]).toMatchObject({
      tMaxC: 34,
      tMinC: 21,
      rainPct: 10,
      sunset: '2026-10-10T12:24:00.000Z',
    });
    expect(days[0]?.rhPct).toBe(Math.round((40 + 42 + 45 + 47) / 4));
  });

  it('fails loudly when the provider fails, so the route can say so', async () => {
    const repo = openMeteoWeatherForecastRepo({
      fetchImpl: vi.fn().mockResolvedValue(json({}, false)),
    });
    await expect(repo.forecastAt({ lat: 28.6, lng: 77.2 }, AS_OF)).rejects.toThrow(
      /weather request failed/u,
    );
  });
});

describe('the gases', () => {
  it('reads the model for the hour in progress, leaving a missing gas as null', async () => {
    const repo = openMeteoGasRepo({
      fetchImpl: vi.fn().mockResolvedValue(
        json({
          hourly: {
            time: ['2026-10-10T16:00', '2026-10-10T17:00'],
            pm10: [150, 160],
            ozone: [40, 45],
            nitrogen_dioxide: [30, null],
            sulphur_dioxide: [10, 12],
            carbon_monoxide: [800, 900],
          },
        }),
      ),
    });
    expect(await repo.gasesAt({ lat: 28.6, lng: 77.2 }, AS_OF)).toEqual({
      at: '2026-10-10T11:30:00.000Z',
      pm10: 160,
      o3: 45,
      no2: null,
      so2: 12,
      co: 900,
    });
  });

  it('says nothing when the model has no hour for now', async () => {
    const repo = openMeteoGasRepo({
      fetchImpl: vi.fn().mockResolvedValue(
        json({
          hourly: {
            time: [],
            pm10: [],
            ozone: [],
            nitrogen_dioxide: [],
            sulphur_dioxide: [],
            carbon_monoxide: [],
          },
        }),
      ),
    });
    expect(await repo.gasesAt({ lat: 28.6, lng: 77.2 }, AS_OF)).toBeUndefined();
  });
});
