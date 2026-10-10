import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIVE_LOCATION_KEY, createLiveLocation, livePin, metresBetween } from './liveLocation';

function memory(initial?: string): Storage {
  const data = new Map<string, string>(initial === undefined ? [] : [[LIVE_LOCATION_KEY, initial]]);
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  } as unknown as Storage;
}

function device(): {
  geolocation: () => Geolocation;
  asks: ReturnType<typeof vi.fn>;
  at: (lat: number, lng: number) => void;
  refuse: () => void;
} {
  let next = { lat: 28.5, lng: 77.1 };
  let refuse = false;
  const asks = vi.fn((ok: PositionCallback, fail: PositionErrorCallback) => {
    if (refuse) fail({ code: 1 } as GeolocationPositionError);
    else ok({ coords: { latitude: next.lat, longitude: next.lng } } as GeolocationPosition);
  });
  const geolocation = { getCurrentPosition: asks } as unknown as Geolocation;
  return {
    geolocation: () => geolocation,
    asks,
    at: (lat, lng) => {
      next = { lat, lng };
    },
    refuse: () => {
      refuse = true;
    },
  };
}

describe('live location', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts off, asks once when turned on, and holds the place it was given', () => {
    const d = device();
    const live = createLiveLocation({ storage: memory(), geolocation: d.geolocation });
    expect(live.get()).toEqual({ enabled: false, status: 'off' });
    live.set(true);
    expect(d.asks).toHaveBeenCalledTimes(1);
    expect(live.get()).toMatchObject({
      enabled: true,
      status: 'on',
      position: { lat: 28.5, lng: 77.1 },
    });
  });

  it('looks again only every fifteen minutes, to spare the battery', () => {
    const d = device();
    createLiveLocation({ storage: memory(), geolocation: d.geolocation }).set(true);
    vi.advanceTimersByTime(14 * 60_000);
    expect(d.asks).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(d.asks).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(30 * 60_000);
    expect(d.asks).toHaveBeenCalledTimes(4);
  });

  it('keeps the place when the device has moved less than 500 m, and takes the new one when it has moved more', () => {
    const d = device();
    const live = createLiveLocation({ storage: memory(), geolocation: d.geolocation });
    const heard = vi.fn();
    live.set(true);
    live.subscribe(heard);
    // About 220 m north: the same place.
    d.at(28.502, 77.1);
    vi.advanceTimersByTime(15 * 60_000);
    expect(live.get().position).toEqual({ lat: 28.5, lng: 77.1 });
    expect(live.get().checkedAt).toBeDefined();
    // About 1.1 km north: a new place.
    d.at(28.51, 77.1);
    vi.advanceTimersByTime(15 * 60_000);
    expect(live.get().position).toEqual({ lat: 28.51, lng: 77.1 });
  });

  it('measures distance on the ground', () => {
    expect(metresBetween({ lat: 28.5, lng: 77.1 }, { lat: 28.5, lng: 77.1 })).toBe(0);
    expect(metresBetween({ lat: 28.5, lng: 77.1 }, { lat: 28.51, lng: 77.1 })).toBeGreaterThan(
      1000,
    );
    expect(metresBetween({ lat: 28.5, lng: 77.1 }, { lat: 28.5, lng: 77.104 })).toBeLessThan(500);
  });

  it('is remembered, so it is not set up again each visit: it resumes by itself', () => {
    const storage = memory();
    createLiveLocation({ storage, geolocation: device().geolocation }).set(true);
    const second = device();
    const next = createLiveLocation({ storage, geolocation: second.geolocation });
    expect(next.get().enabled).toBe(true);
    expect(second.asks).not.toHaveBeenCalled();
    next.resume();
    expect(second.asks).toHaveBeenCalledTimes(1);
    next.resume();
    expect(second.asks).toHaveBeenCalledTimes(1);
  });

  it('stops asking when turned off', () => {
    const d = device();
    const live = createLiveLocation({ storage: memory(), geolocation: d.geolocation });
    live.set(true);
    live.set(false);
    vi.advanceTimersByTime(60 * 60_000);
    expect(d.asks).toHaveBeenCalledTimes(1);
    expect(live.get()).toEqual({ enabled: false, status: 'off' });
  });

  it('says so when the browser refuses, turns itself off, and does not ask again until told', () => {
    const storage = memory();
    const d = device();
    d.refuse();
    const live = createLiveLocation({ storage, geolocation: d.geolocation });
    live.set(true);
    expect(live.get()).toEqual({ enabled: false, status: 'refused' });
    expect(storage.getItem(LIVE_LOCATION_KEY)).toBe('off');
    vi.advanceTimersByTime(60 * 60_000);
    expect(d.asks).toHaveBeenCalledTimes(1);
  });

  it('says so when there is no location in this browser', () => {
    const live = createLiveLocation({ storage: memory(), geolocation: () => undefined });
    live.set(true);
    expect(live.get().status).toBe('unavailable');
  });

  it('tells listeners about each change, and stops when they leave', () => {
    const d = device();
    const live = createLiveLocation({ storage: memory(), geolocation: d.geolocation });
    const heard = vi.fn();
    const leave = live.subscribe(heard);
    live.set(true);
    const first = heard.mock.calls.length;
    expect(first).toBeGreaterThanOrEqual(2);
    leave();
    vi.advanceTimersByTime(15 * 60_000);
    expect(heard).toHaveBeenCalledTimes(first);
  });
});

describe('the live place', () => {
  it('is rounded to about a kilometre, which is as fine as the monitors are', () => {
    expect(livePin({ lat: 28.61234, lng: 77.20987 })).toEqual({
      id: 'live',
      name: 'Here',
      detail: 'Live location',
      lat: 28.61,
      lng: 77.21,
    });
  });
});
