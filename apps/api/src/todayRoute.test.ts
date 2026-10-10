import { Today, type RawHour } from '@vayu/contracts';
import { fixedClock } from '@vayu/core';
import {
  fixtureFireRepo,
  fixtureForecastRepo,
  fixtureStationRepo,
  type Point,
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
    // The age is how old the newest reading is, not zero.
    const newest = [...today.hours].reverse().find((h) => h.kind === 'observed' && h.pm25 !== null);
    expect(today.prov.observedAt).toBe(
      new Date(Date.parse(newest?.t ?? '') + 3_600_000).toISOString(),
    );
  });

  it('carries the forecast out to seven days, so the daily forecast can show seven', async () => {
    const asOfMs = Date.parse(AS_OF);
    const forecast: RawHour[] = Array.from({ length: 200 }, (_, i) => ({
      hourStart: new Date(asOfMs - (asOfMs % 3_600_000) + i * 3_600_000).toISOString(),
      pm25: 60,
      pm10: 90,
    }));
    const response = await ask(
      { forecastRepo: { forecastFor: () => Promise.resolve(forecast) } },
      { lat: '28.6', lng: '77.2' },
    );
    const today = Today.parse(response.body);
    const days = new Set(
      today.hours
        .filter((h) => h.kind === 'forecast')
        .map((h) => new Date(Date.parse(h.t) + 5.5 * 3_600_000).toISOString().slice(0, 10)),
    );
    expect(days.size).toBeGreaterThanOrEqual(7);
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

  it('keeps an estimate for a minute only, since it may mean a monitor lookup failed a moment ago, and still has a figure for the hour in progress', async () => {
    const none: StationRepo = {
      stationsNear: () => Promise.resolve([]),
      hourlyFor: () => Promise.resolve([]),
    };
    // 12:00 UTC is in the hour that began at 11:30 UTC, which the answer must hold.
    const response = await ask({ stationRepo: none }, { place: 'home' });
    expect(response.headers).toEqual({ 'cache-control': 'public, max-age=60' });
    const today = Today.parse(response.body);
    const now = Date.parse(AS_OF);
    expect(
      today.hours.some((h) => Date.parse(h.t) <= now && now < Date.parse(h.t) + 3_600_000),
    ).toBe(true);
  });

  it("has a figure for the hour in progress when the model hours start at half past, as India's do", async () => {
    // Open-Meteo's hours are on the hour in India, which is :30 in UTC. 12:00 UTC is inside the hour that began 11:30.
    const hours = Array.from({ length: 72 }, (_, i): RawHour => ({
      hourStart: new Date(Date.parse('2026-10-05T10:30:00.000Z') + i * 3_600_000).toISOString(),
      pm25: 80,
      pm10: 120,
    }));
    const none: StationRepo = {
      stationsNear: () => Promise.resolve([]),
      hourlyFor: () => Promise.resolve([]),
    };
    const half = { forecastFor: () => Promise.resolve(hours) };
    const today = Today.parse(
      (await ask({ stationRepo: none, forecastRepo: half }, { place: 'home' })).body,
    );
    const now = Date.parse(AS_OF);
    expect(
      today.hours.some((h) => Date.parse(h.t) <= now && now < Date.parse(h.t) + 3_600_000),
    ).toBe(true);
  });

  it('still answers from a live monitor when the regional forecast service is down', async () => {
    const down = { forecastFor: () => Promise.reject(new Error('Open-Meteo 429')) };
    const response = await ask({ forecastRepo: down }, { place: 'home' });
    expect(response.statusCode).toBe(200);
    const today = Today.parse(response.body);
    expect(today.mode).toBe('live');
    expect(today.hours.some((h) => h.kind === 'observed')).toBe(true);
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
    const inner = baseDeps.stationRepo;
    const stationsNear = vi.fn((point: Point, asOf: string) => inner.stationsNear(point, asOf));
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
