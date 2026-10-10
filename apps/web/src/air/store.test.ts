import type { MapStation } from '@vayu/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { Pin } from '../data/pins';
import type { TodayData } from '../today/types';
import { AirStore } from './store';
import type { AirSource } from './types';

const pin: Pin = { id: '28.59,77.05', name: 'Home', lat: 28.59, lng: 77.05 };
const reading = (aqi: number): TodayData => ({
  id: pin.id,
  place: { name: 'Home', region: '' },
  asOf: '2026-10-10T12:00:00.000Z',
  aqi,
  pm25: 60,
  pollutants: { pm25: 60 },
  hourly: [],
  daily: [],
  history: [],
  provenance: { mode: 'live', label: 'Nearby station', ageMinutes: 5 },
});
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const source = (over: Partial<AirSource> = {}): AirSource => ({
  kind: 'live',
  today: () => Promise.resolve(reading(150)),
  history: () => Promise.resolve([]),
  stations: () => Promise.resolve([]),
  ...over,
});

describe('the air store', () => {
  it('starts loading, then has the reading, and tells listeners at each step', async () => {
    const store = new AirStore(source());
    const heard = vi.fn();
    store.subscribe(heard);
    expect(store.today(pin)).toEqual({ status: 'loading' });
    store.ensureToday(pin);
    expect(store.today(pin)).toEqual({ status: 'loading' });
    await flush();
    expect(store.today(pin)).toMatchObject({ status: 'ready', data: { aqi: 150 } });
    expect(heard).toHaveBeenCalled();
  });

  it('asks once for the same place however many screens want it', async () => {
    const today = vi.fn(() => Promise.resolve(reading(150)));
    const store = new AirStore(source({ today }));
    store.ensureToday(pin);
    store.ensureToday(pin);
    store.ensureToday(pin);
    await flush();
    store.ensureToday(pin);
    expect(today).toHaveBeenCalledTimes(1);
  });

  it('says what failed, and does not try again at once, but does after a little while', async () => {
    let now = 0;
    const today = vi.fn(() => Promise.reject(new Error('We could not reach the server.')));
    const store = new AirStore(source({ today }), () => now);
    store.ensureToday(pin);
    await flush();
    expect(store.today(pin)).toEqual({
      status: 'error',
      message: 'We could not reach the server.',
    });
    store.ensureToday(pin);
    expect(today).toHaveBeenCalledTimes(1);
    now = 25_000;
    store.ensureToday(pin);
    expect(today).toHaveBeenCalledTimes(2);
  });

  it('keeps the last good reading when a refresh fails, rather than blanking the screen', async () => {
    let now = 0;
    const today = vi
      .fn()
      .mockResolvedValueOnce(reading(150))
      .mockRejectedValueOnce(new Error('down'));
    const store = new AirStore(source({ today }), () => now);
    store.ensureToday(pin);
    await flush();
    now = 6 * 60_000;
    store.ensureToday(pin);
    await flush();
    expect(today).toHaveBeenCalledTimes(2);
    expect(store.today(pin)).toMatchObject({ status: 'ready', data: { aqi: 150 } });
  });

  it('refreshes a reading after five minutes, and replaces it with the newer one', async () => {
    let now = 0;
    const today = vi.fn().mockResolvedValueOnce(reading(150)).mockResolvedValueOnce(reading(180));
    const store = new AirStore(source({ today }), () => now);
    store.ensureToday(pin);
    await flush();
    now = 4 * 60_000;
    store.ensureToday(pin);
    expect(today).toHaveBeenCalledTimes(1);
    now = 5 * 60_000 + 1;
    store.ensureToday(pin);
    await flush();
    expect(store.today(pin)).toMatchObject({ data: { aqi: 180 } });
  });

  it('files the history by India calendar day and hour, and leaves the unmeasured hours empty', async () => {
    const store = new AirStore(
      source({
        history: () =>
          Promise.resolve([
            // 05:30 India time on 10 Oct is 00:00 UTC; this hour starts at 05:30 IST... use clean IST hours.
            { t: '2026-10-09T18:30:00.000Z', pm25: 11 }, // 00:00 IST on 10 Oct
            { t: '2026-10-10T03:30:00.000Z', pm25: 22 }, // 09:00 IST on 10 Oct
            { t: '2026-10-10T04:30:00.000Z', pm25: null },
            { t: '2026-10-09T17:30:00.000Z', pm25: 33 }, // 23:00 IST on 9 Oct
          ]),
      }),
    );
    store.ensureHistory(pin);
    await flush();
    const tenth = store.ambient(pin, '2026-10-10');
    expect(tenth[0]).toBe(11);
    expect(tenth[9]).toBe(22);
    expect(tenth[10]).toBeUndefined();
    expect(store.ambient(pin, '2026-10-09')[23]).toBe(33);
    expect(store.ambient(pin, '2026-09-01').every((v) => v === undefined)).toBe(true);
    expect(store.historyStatus(pin)).toEqual({ status: 'ready', data: true });
  });

  it('reports a history that could not load, and an empty day rather than a made-up one', async () => {
    const store = new AirStore(source({ history: () => Promise.reject(new Error('nope')) }));
    expect(store.ambient(pin, '2026-10-10').every((v) => v === undefined)).toBe(true);
    store.ensureHistory(pin);
    await flush();
    expect(store.historyStatus(pin)).toEqual({ status: 'error', message: 'nope' });
  });

  it('loads the monitors once, and keeps them if a refresh fails', async () => {
    let now = 0;
    const one: MapStation = {
      id: 'a',
      name: 'A',
      lat: 28,
      lng: 77,
      pm25: 50,
      at: '2026-10-10T11:00:00.000Z',
    };
    const stations = vi.fn().mockResolvedValueOnce([one]).mockRejectedValueOnce(new Error('down'));
    const store = new AirStore(source({ stations }), () => now);
    store.ensureStations();
    await flush();
    expect(store.stationsNow()).toEqual({ status: 'ready', data: [one] });
    now = 6 * 60_000;
    store.ensureStations();
    await flush();
    expect(store.stationsNow()).toEqual({ status: 'ready', data: [one] });
  });

  it('answers at once from a source that can, without waiting', () => {
    const store = new AirStore(source({ peekToday: () => reading(99) }));
    expect(store.today(pin)).toMatchObject({ status: 'ready', data: { aqi: 99 } });
  });
});
