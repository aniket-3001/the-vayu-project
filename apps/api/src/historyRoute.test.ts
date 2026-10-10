import { History, type RawHour } from '@vayu/contracts';
import { fixedClock } from '@vayu/core';
import {
  fixtureFireRepo,
  fixtureForecastRepo,
  fixtureStationRepo,
  type ModelHistoryRepo,
  type StationRepo,
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
const ask = (
  deps: Partial<RouterDeps>,
  query: Record<string, string>,
): ReturnType<ReturnType<typeof createRouter>> =>
  createRouter({ ...baseDeps, ...deps })({
    method: 'GET',
    path: '/v1/history',
    query,
    headers: {},
  });

describe('GET /v1/history', () => {
  it('gives the hourly PM2.5 from the nearest monitor, compactly, with where it came from', async () => {
    const history = History.parse((await ask({}, { place: 'home' })).body);
    expect(history.days).toBe(14);
    expect(history.hours.length).toBeGreaterThan(24);
    expect(history.hours[0]).toHaveProperty('t');
    expect(history.hours[0]).toHaveProperty('pm25');
    expect(history.prov).toMatchObject({ label: 'Nearby station', source: 'station' });
    expect(history.prov.stationName).toBeTruthy();
  });

  it('asks for as many days as were wanted, and no more than fourteen', async () => {
    const hourlyFor = vi.fn(fixtureStationRepo().hourlyFor);
    const repo: StationRepo = { ...fixtureStationRepo(), hourlyFor };
    await ask({ stationRepo: repo }, { place: 'home', days: '10' });
    expect(hourlyFor).toHaveBeenCalledWith(expect.any(String), AS_OF, 10);
    for (const days of ['0', '15', 'many', '-1', '7.5']) {
      const response = await ask({}, { place: 'home', days });
      expect(response).toMatchObject({
        statusCode: 400,
        body: { error: { code: 'bad_parameter', param: 'days' } },
      });
    }
  });

  it('never returns an hour that had not ended by now, even if the provider sends one (rule I1)', async () => {
    const leaky: StationRepo = {
      ...fixtureStationRepo(),
      hourlyFor: (): Promise<readonly RawHour[]> =>
        Promise.resolve([
          { hourStart: '2026-10-05T09:30:00.000Z', pm25: 80, pm10: null },
          { hourStart: '2026-10-05T10:30:00.000Z', pm25: 81, pm10: null },
          // The hour in progress and one that has not begun.
          { hourStart: '2026-10-05T11:30:00.000Z', pm25: 90, pm10: null },
          { hourStart: '2026-10-05T12:30:00.000Z', pm25: 999, pm10: null },
        ]),
    };
    const history = History.parse((await ask({ stationRepo: leaky }, { place: 'home' })).body);
    expect(history.hours.map((h) => h.pm25)).toEqual([80, 81]);
  });

  it('falls back to the regional model, labelled an estimate, when no monitor has a recent reading', async () => {
    const stale: StationRepo = {
      stationsNear: () =>
        Promise.resolve([{ id: 's1', name: 'Old', lat: 28.61, lng: 77.2, hasPm25: true }]),
      hourlyFor: () =>
        Promise.resolve([{ hourStart: '2026-09-01T00:00:00.000Z', pm25: 60, pm10: null }]),
    };
    const historyRepo: ModelHistoryRepo = {
      historyFor: () =>
        Promise.resolve([
          { hourStart: '2026-10-05T09:30:00.000Z', pm25: 70, pm10: null },
          { hourStart: '2026-10-05T10:30:00.000Z', pm25: 75, pm10: null },
        ]),
    };
    const history = History.parse(
      (await ask({ stationRepo: stale, historyRepo }, { place: 'home' })).body,
    );
    expect(history.mode).toBe('model');
    expect(history.prov.label).toBe('Estimate');
    expect(history.hours).toHaveLength(2);
  });

  it('still answers, with no hours, when neither a monitor nor the model can', async () => {
    const down: StationRepo = {
      stationsNear: () => Promise.reject(new Error('down')),
      hourlyFor: () => Promise.reject(new Error('down')),
    };
    const history = History.parse(
      (
        await ask(
          {
            stationRepo: down,
            historyRepo: { historyFor: () => Promise.reject(new Error('down')) },
          },
          { place: 'home' },
        )
      ).body,
    );
    expect(history.hours).toEqual([]);
    expect(history.mode).toBe('model');
  });

  it('lets a shared cache keep it for fifteen minutes', async () => {
    expect((await ask({}, { place: 'home' })).headers).toEqual({
      'cache-control': 'public, max-age=900',
    });
  });
});
