import { Today, type RawHour } from '@vayu/contracts';
import { fixedClock } from '@vayu/core';
import {
  fixtureFireRepo,
  fixtureForecastRepo,
  fixtureStationRepo,
  type StationRepo,
  type WeatherForecastRepo,
} from '@vayu/data';
import { fixtureLinkStore } from '@vayu/watch';
import { describe, expect, it, vi } from 'vitest';
import { createRouter, type RouterDeps } from './routes';

const AS_OF = '2026-10-05T12:00:00.000Z';

const baseDeps: RouterDeps = {
  stationRepo: fixtureStationRepo(),
  forecastRepo: fixtureForecastRepo(),
  fireRepo: fixtureFireRepo(),
  clock: fixedClock(AS_OF),
  mode: 'live',
  linkStore: fixtureLinkStore(),
  telegram: { botToken: 'TOKEN', webhookSecret: 's' },
};

const weatherRepo: WeatherForecastRepo = {
  forecastAt: () =>
    Promise.resolve({
      hours: [
        {
          t: '2026-10-05T11:30:00.000Z',
          tempC: 31,
          rhPct: 40,
          windKmh: 9,
          windFromDeg: 300,
          rainPct: 0,
          rainMm: 0,
          code: 1,
          isDay: true,
          uv: 4,
        },
      ],
      days: [],
    }),
};

const ask = async (
  deps: Partial<RouterDeps>,
  query: Record<string, string>,
  method = 'GET',
): ReturnType<ReturnType<typeof createRouter>> =>
  createRouter({ ...baseDeps, ...deps })({ method, path: '/v1/today', query, headers: {} });

describe('GET /v1/today', () => {
  it('answers with a Today the contract accepts: observed hours, then the forecast, with provenance', async () => {
    const response = await ask({}, { lat: '28.6', lng: '77.2' });
    expect(response.statusCode).toBe(200);
    const today = Today.parse(response.body);
    expect(today.place).toMatchObject({ id: 'gps', lat: 28.6, lng: 77.2 });
    expect(today.hours.some((h) => h.kind === 'observed')).toBe(true);
    expect(today.hours.some((h) => h.kind === 'forecast')).toBe(true);
    expect(today.prov.label).toBe('Nearby station');
    expect(today.prov.ageMinutes).toBeGreaterThanOrEqual(0);
  });

  it('never returns an observed hour that had not ended by now (rule I1)', async () => {
    const today = Today.parse((await ask({}, { place: 'home' })).body);
    const limit = Date.parse(AS_OF);
    for (const hour of today.hours.filter((h) => h.kind === 'observed'))
      expect(Date.parse(hour.t) + 3_600_000).toBeLessThanOrEqual(limit);
  });

  it('lets a shared cache keep the answer for five minutes', async () => {
    const response = await ask({}, { place: 'home' });
    expect(response.headers).toEqual({ 'cache-control': 'public, max-age=300' });
  });

  it('adds the weather when the model answers, and still answers when it is down', async () => {
    const withWeather = Today.parse(
      (await ask({ weatherForecastRepo: weatherRepo }, { place: 'home' })).body,
    );
    expect(withWeather.weather?.hours[0]).toMatchObject({ tempC: 31, code: 1 });
    const broken: WeatherForecastRepo = { forecastAt: () => Promise.reject(new Error('down')) };
    const without = await ask({ weatherForecastRepo: broken }, { place: 'home' });
    expect(without.statusCode).toBe(200);
    expect(Today.parse(without.body).weather).toBeUndefined();
  });

  it('gives no advice from stale data: with no recent station it is a labelled estimate with no observed hours (rule I3)', async () => {
    const stale: StationRepo = {
      stationsNear: () =>
        Promise.resolve([{ id: 's1', name: 'Old station', lat: 28.61, lng: 77.2, hasPm25: true }]),
      hourlyFor: (): Promise<readonly RawHour[]> =>
        Promise.resolve([{ hourStart: '2026-10-01T00:00:00.000Z', pm25: 60, pm10: null }]),
    };
    const today = Today.parse((await ask({ stationRepo: stale }, { place: 'home' })).body);
    expect(today.mode).toBe('model');
    expect(today.prov.label).toBe('Estimate');
    expect(today.hours.every((h) => h.kind !== 'observed')).toBe(true);
    expect(today.windows).toEqual([]);
  });

  it('keeps coordinates to about a kilometre and inside north India, and says what to fix', async () => {
    const rounded = Today.parse((await ask({}, { lat: '28.60123', lng: '77.20987' })).body);
    expect(rounded.place).toMatchObject({ lat: 28.6, lng: 77.21 });
    const outside = await ask({}, { lat: '48.8', lng: '2.3' });
    expect(outside).toMatchObject({
      statusCode: 400,
      body: { error: { code: 'bad_location', param: 'lat' } },
    });
    const nothing = await ask({}, {});
    expect(nothing).toMatchObject({
      statusCode: 400,
      body: { error: { code: 'missing_parameter' } },
    });
    const unknown = await ask({}, { place: 'mars' });
    expect(unknown).toMatchObject({ statusCode: 404, body: { error: { code: 'unknown_place' } } });
  });

  it('asks the provider once for a repeat of the same place within the caller’s cache', async () => {
    const stationsNear = vi.fn(baseDeps.stationRepo.stationsNear);
    await ask(
      { stationRepo: { ...baseDeps.stationRepo, stationsNear } },
      { lat: '28.6', lng: '77.2' },
    );
    expect(stationsNear).toHaveBeenCalledTimes(1);
  });

  it('does not take a POST', async () => {
    expect((await ask({}, { place: 'home' }, 'POST')).statusCode).toBe(405);
  });
});
