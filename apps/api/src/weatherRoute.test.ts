import { Timeline } from '@vayu/contracts';
import { fixedClock } from '@vayu/core';
import {
  fixtureFireRepo,
  fixtureForecastRepo,
  fixtureStationRepo,
  fixtureWeatherRepo,
  type WeatherRepo,
} from '@vayu/data';
import { fixtureLinkStore } from '@vayu/watch';
import { describe, expect, it } from 'vitest';
import { createRouter } from './routes';

const build = (weatherRepo?: WeatherRepo): ReturnType<typeof createRouter> =>
  createRouter({
    stationRepo: fixtureStationRepo(),
    forecastRepo: fixtureForecastRepo(),
    fireRepo: fixtureFireRepo(),
    clock: fixedClock('2026-10-05T12:00:00.000Z'),
    mode: 'model',
    linkStore: fixtureLinkStore(),
    telegram: { botToken: 'T', webhookSecret: 'S' },
    ...(weatherRepo === undefined ? {} : { weatherRepo }),
  });
const timeline = async (
  route: ReturnType<typeof createRouter>,
  query: Record<string, string>,
): Promise<Timeline> => {
  const response = await route({ method: 'GET', path: '/v1/timeline', query, headers: {} });
  expect(response.statusCode).toBe(200);
  return Timeline.parse(response.body);
};

describe('/v1/timeline weather', () => {
  it('carries the weather model’s value for now, and it passes the contract', async () => {
    const result = await timeline(build(fixtureWeatherRepo()), { place: 'home' });
    expect(result.weather).toMatchObject({ windKmh: 6, windFromDeg: 310, rhPct: 45, tempC: 28 });
  });

  it('answers as before, without weather, when no weather repo is wired', async () => {
    expect((await timeline(build(), { place: 'home' })).weather).toBeUndefined();
  });

  it('never fails the air answer because the weather model is down', async () => {
    const down: WeatherRepo = { nowAt: () => Promise.reject(new Error('Open-Meteo is down')) };
    const result = await timeline(build(down), { place: 'home' });
    expect(result.weather).toBeUndefined();
    expect(result.hours.length).toBeGreaterThan(0);
  });

  it('leaves weather out when the model has no value for that hour', async () => {
    const none: WeatherRepo = { nowAt: () => Promise.resolve(undefined) };
    expect((await timeline(build(none), { place: 'home' })).weather).toBeUndefined();
  });

  it('asks for the weather at the place asked about, rounded as the rest of the place is', async () => {
    const asked: { lat: number; lng: number }[] = [];
    const spy: WeatherRepo = {
      nowAt: (point) => {
        asked.push(point);
        return Promise.resolve(undefined);
      },
    };
    await timeline(build(spy), { lat: '28.61234', lng: '77.20987' });
    expect(asked.map(({ lat, lng }) => ({ lat, lng }))).toEqual([{ lat: 28.61, lng: 77.21 }]);
  });
});
