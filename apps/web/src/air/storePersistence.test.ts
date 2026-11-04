// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { Pin } from '../data/pins';
import type { TodayData } from '../today/types';
import { AirStore } from './store';
import type { AirSource } from './types';

const pin: Pin = { id: '28.59,77.05', name: 'Home', lat: 28.59, lng: 77.05 };
const MIN = 60_000;

const reading = (over: Partial<TodayData['provenance']> = {}): TodayData => ({
  id: pin.id,
  place: { name: 'Home', region: '' },
  asOf: '2026-10-10T12:00:00.000Z',
  aqi: 150,
  pm25: 60,
  pollutants: { pm25: 60 },
  hourly: [],
  daily: [],
  history: [],
  provenance: { mode: 'live', label: 'Nearby station', ageMinutes: 5, ...over },
});
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const source = (today: () => Promise<TodayData>, kind: AirSource['kind'] = 'live'): AirSource => ({
  kind,
  today,
  history: () => Promise.resolve([]),
  stations: () => Promise.resolve([]),
});

const ageOf = (store: AirStore): number | undefined => {
  const loaded = store.today(pin);
  return loaded.status === 'ready' ? loaded.data.provenance.ageMinutes : undefined;
};

beforeEach(() => {
  window.localStorage.clear();
});

describe('a reading keeps its true age', () => {
  it('grows older on screen, instead of staying at the age it had when it arrived', async () => {
    let now = 0;
    const store = new AirStore(
      source(() => Promise.resolve(reading())),
      () => now,
    );
    store.ensureToday(pin);
    await flush();
    expect(ageOf(store)).toBe(5);
    now = 30 * MIN;
    expect(ageOf(store)).toBe(35);
  });

  it('hands a screen the same object until the minute changes', async () => {
    let now = 0;
    const store = new AirStore(
      source(() => Promise.resolve(reading())),
      () => now,
    );
    store.ensureToday(pin);
    await flush();
    now = 10 * MIN;
    const a = store.today(pin);
    const b = store.today(pin);
    expect(a.status === 'ready' && b.status === 'ready' && a.data === b.data).toBe(true);
  });

  it('keeps the last reading when a refresh fails, and says how old it now is', async () => {
    let now = 0;
    let fail = false;
    const store = new AirStore(
      source(() => (fail ? Promise.reject(new Error('offline')) : Promise.resolve(reading()))),
      () => now,
    );
    store.ensureToday(pin);
    await flush();
    fail = true;
    now = 20 * MIN;
    store.ensureToday(pin);
    await flush();
    expect(ageOf(store)).toBe(25);
  });

  it('does not move on the age of a model estimate, which has none', async () => {
    let now = 0;
    const store = new AirStore(
      source(() => Promise.resolve(reading({ mode: 'model', label: 'Estimate', ageMinutes: 0 }))),
      () => now,
    );
    store.ensureToday(pin);
    await flush();
    now = 90 * MIN;
    expect(ageOf(store)).toBe(0);
  });
});

describe('the last good reading survives a restart', () => {
  it('shows a recent one at once, with its age moved on, before the network answers', async () => {
    let now = 0;
    const first = new AirStore(
      source(() => Promise.resolve(reading())),
      () => now,
    );
    first.ensureToday(pin);
    await flush();

    now = 40 * MIN;
    const restarted = new AirStore(
      source(() => new Promise(() => undefined)),
      () => now,
    );
    expect(restarted.today(pin)).toMatchObject({
      status: 'ready',
      data: { aqi: 150, provenance: { ageMinutes: 45 } },
    });
  });

  it('forgets a reading older than three hours: there is no advice to give from it', async () => {
    let now = 0;
    const first = new AirStore(
      source(() => Promise.resolve(reading())),
      () => now,
    );
    first.ensureToday(pin);
    await flush();

    now = 181 * MIN;
    const restarted = new AirStore(
      source(() => new Promise(() => undefined)),
      () => now,
    );
    expect(restarted.today(pin)).toEqual({ status: 'loading' });
    expect(window.localStorage.length).toBe(0);
  });

  it('does not bring back another place, or a damaged copy', () => {
    window.localStorage.setItem(
      `vayu.air.v1.${pin.id}`,
      JSON.stringify({ savedAt: 0, data: { ...reading(), id: 'somewhere-else' } }),
    );
    expect(
      new AirStore(
        source(() => new Promise(() => undefined)),
        () => 0,
      ).today(pin),
    ).toEqual({
      status: 'loading',
    });
    window.localStorage.setItem(`vayu.air.v1.${pin.id}`, '{not json');
    expect(
      new AirStore(
        source(() => new Promise(() => undefined)),
        () => 0,
      ).today(pin),
    ).toEqual({
      status: 'loading',
    });
  });

  it('is forgotten with everything else on a reset', async () => {
    const store = new AirStore(
      source(() => Promise.resolve(reading())),
      () => 0,
    );
    store.ensureToday(pin);
    await flush();
    expect(window.localStorage.length).toBe(1);
    store.clear();
    expect(window.localStorage.length).toBe(0);
  });

  it('never saves made-up days', async () => {
    const store = new AirStore(
      source(() => Promise.resolve(reading()), 'sample'),
      () => 0,
    );
    store.ensureToday(pin);
    await flush();
    expect(window.localStorage.length).toBe(0);
  });

  it('carries on if storage refuses to save', async () => {
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => undefined,
    } as unknown as Storage;
    const store = new AirStore(
      source(() => Promise.resolve(reading())),
      () => 0,
      full,
    );
    store.ensureToday(pin);
    await flush();
    expect(ageOf(store)).toBe(5);
  });
});
