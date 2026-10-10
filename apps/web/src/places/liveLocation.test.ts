import { describe, expect, it, vi } from 'vitest';
import { LIVE_LOCATION_KEY, createLiveLocation, livePin } from './liveLocation';

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
  watch: ReturnType<typeof vi.fn>;
  clearWatch: ReturnType<typeof vi.fn>;
  move: (lat: number, lng: number) => void;
  refuse: () => void;
} {
  let ok: PositionCallback = () => undefined;
  let fail: PositionErrorCallback = () => undefined;
  const clearWatch = vi.fn();
  const watch = vi.fn((success: PositionCallback, failure: PositionErrorCallback) => {
    ok = success;
    fail = failure;
    return 7;
  });
  const geolocation = { watchPosition: watch, clearWatch } as unknown as Geolocation;
  return {
    geolocation: () => geolocation,
    watch,
    clearWatch,
    move: (lat: number, lng: number) => {
      ok({ coords: { latitude: lat, longitude: lng } } as GeolocationPosition);
    },
    refuse: () => {
      fail({ code: 1 } as GeolocationPositionError);
    },
  };
}

describe('live location', () => {
  it('starts off, asks when turned on, and follows the device', () => {
    const d = device();
    const live = createLiveLocation({ storage: memory(), geolocation: d.geolocation });
    expect(live.get()).toEqual({ enabled: false, status: 'off' });
    live.set(true);
    expect(live.get()).toMatchObject({ enabled: true, status: 'asking' });
    d.move(28.5, 77.1);
    expect(live.get()).toEqual({
      enabled: true,
      status: 'on',
      position: { lat: 28.5, lng: 77.1 },
    });
    d.move(28.6, 77.2);
    expect(live.get().position).toEqual({ lat: 28.6, lng: 77.2 });
  });

  it('is remembered, so it is not set up again each visit: it resumes by itself', () => {
    const storage = memory();
    const first = device();
    createLiveLocation({ storage, geolocation: first.geolocation }).set(true);
    const second = device();
    const next = createLiveLocation({ storage, geolocation: second.geolocation });
    expect(next.get().enabled).toBe(true);
    expect(second.watch).not.toHaveBeenCalled();
    next.resume();
    expect(second.watch).toHaveBeenCalledTimes(1);
    next.resume();
    expect(second.watch).toHaveBeenCalledTimes(1);
  });

  it('stops following, and forgets the position, when turned off', () => {
    const d = device();
    const live = createLiveLocation({ storage: memory(), geolocation: d.geolocation });
    live.set(true);
    d.move(28.5, 77.1);
    live.set(false);
    expect(d.clearWatch).toHaveBeenCalledWith(7);
    expect(live.get()).toEqual({ enabled: false, status: 'off' });
    expect(
      createLiveLocation({ storage: memory('on'), geolocation: d.geolocation }).get().enabled,
    ).toBe(true);
  });

  it('says so when the browser refuses, turns itself off, and does not ask again until told', () => {
    const storage = memory();
    const d = device();
    const live = createLiveLocation({ storage, geolocation: d.geolocation });
    live.set(true);
    d.refuse();
    expect(live.get()).toEqual({ enabled: false, status: 'refused' });
    expect(storage.getItem(LIVE_LOCATION_KEY)).toBe('off');
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
    d.move(28.5, 77.1);
    expect(heard).toHaveBeenCalledTimes(2);
    leave();
    d.move(28.6, 77.2);
    expect(heard).toHaveBeenCalledTimes(2);
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
