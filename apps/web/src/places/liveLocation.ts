import { useMemo, useSyncExternalStore } from 'react';
import type { Pin } from '../data/pins';

export const LIVE_LOCATION_KEY = 'vayu.liveLocation.v1';

export type LiveStatus = 'off' | 'asking' | 'on' | 'refused' | 'unavailable';

export interface LiveSnapshot {
  /** Whether the person asked for live location. Kept between visits, so it is not asked again each time. */
  readonly enabled: boolean;
  readonly status: LiveStatus;
  /** Where the device is, as the browser gave it. Only while it is on. */
  readonly position?: { readonly lat: number; readonly lng: number };
  /** When the device was last asked, as a time in milliseconds. It changes on every look, moved or not. */
  readonly checkedAt?: number;
}

export interface LiveLocation {
  readonly get: () => LiveSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
  /** Turns it on or off. On asks the browser, and keeps following the device until turned off. */
  readonly set: (enabled: boolean) => void;
  /** Starts following again if it was left on last time. Called once when the app opens. */
  readonly resume: () => void;
}

/** How often the device is asked where it is, while live location is on. A phone's battery is spared by asking rarely. */
export const CHECK_EVERY_MS = 15 * 60_000;
/** A move smaller than this is not a move: the place, and so the air and the exposure, stay as they were. */
export const MOVED_METRES = 500;

/** Straight-line distance between two points, in metres. */
export function metresBetween(
  a: { readonly lat: number; readonly lng: number },
  b: { readonly lat: number; readonly lng: number },
): number {
  const rad = (deg: number): number => (deg * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

interface Options {
  readonly storage?: Storage;
  readonly intervalMs?: number;
  readonly movedMetres?: number;
  readonly now?: () => number;
  /** Read each time it is needed, since a browser may add or remove it. */
  readonly geolocation?: () => Geolocation | undefined;
}

function readEnabled(storage: Storage): boolean {
  try {
    return storage.getItem(LIVE_LOCATION_KEY) === 'on';
  } catch {
    return false;
  }
}

/**
 * Live location, shared by every screen: one switch that is remembered, and one position that follows the device
 * while it is on. A browser page cannot follow a phone in the background, so it follows only while the app is open.
 */
export function createLiveLocation(options: Options = {}): LiveLocation {
  const storage = options.storage ?? window.localStorage;
  const geo = options.geolocation ?? ((): Geolocation | undefined => navigator.geolocation);
  let snapshot: LiveSnapshot = { enabled: readEnabled(storage), status: 'off' };
  const listeners = new Set<() => void>();
  const every = options.intervalMs ?? CHECK_EVERY_MS;
  const moved = options.movedMetres ?? MOVED_METRES;
  const now = options.now ?? Date.now;
  let timer: ReturnType<typeof setInterval> | undefined;
  let lastCheck = 0;
  let running = false;
  const isRunning = (): boolean => running;

  const change = (next: LiveSnapshot): void => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const remember = (enabled: boolean): void => {
    try {
      storage.setItem(LIVE_LOCATION_KEY, enabled ? 'on' : 'off');
    } catch {
      // Best effort: the switch still works for this visit.
    }
  };
  const stop = (): void => {
    running = false;
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
    if (typeof document !== 'undefined')
      document.removeEventListener('visibilitychange', onVisible);
  };
  /** One coarse look at where the device is. Kept only if it is a real move from the last place kept. */
  const check = (): void => {
    const geolocation = geo();
    if (geolocation === undefined) {
      change({ enabled: true, status: 'unavailable' });
      return;
    }
    lastCheck = now();
    geolocation.getCurrentPosition(
      (fix) => {
        const here = { lat: fix.coords.latitude, lng: fix.coords.longitude };
        const before = snapshot.position;
        const checkedAt = now();
        // Not moved far: keep the place as it was, so the air is not asked for again, and only note the look.
        if (before !== undefined && metresBetween(before, here) < moved)
          change({ enabled: true, status: 'on', position: before, checkedAt });
        else change({ enabled: true, status: 'on', position: here, checkedAt });
      },
      () => {
        // Refused or failed: say so, and stop asking. The person can try the switch again.
        stop();
        remember(false);
        change({ enabled: false, status: 'refused' });
      },
      // A coarse fix is enough, and is cheaper for the battery than a precise one.
      { maximumAge: every, timeout: 20_000, enableHighAccuracy: false },
    );
  };
  // Timers are slowed or stopped while the page is hidden, so a return to the page checks if one is due.
  function onVisible(): void {
    if (running && document.visibilityState === 'visible' && now() - lastCheck >= every) check();
  }
  const start = (): void => {
    stop();
    running = true;
    change({ enabled: true, status: 'asking' });
    check();
    // A refusal can come back at once, and stops everything; there is then nothing to keep checking.
    if (!isRunning()) return;
    timer = setInterval(check, every);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
  };

  return {
    get: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set: (enabled) => {
      remember(enabled);
      if (enabled) start();
      else {
        stop();
        change({ enabled: false, status: 'off' });
      }
    },
    resume: () => {
      if (snapshot.enabled && !running) start();
    },
  };
}

let shared: LiveLocation | undefined;
/** The one live location for the app. */
export function liveLocation(): LiveLocation {
  shared ??= createLiveLocation();
  return shared;
}
/** Swaps the shared one: for tests. */
export function setLiveLocation(replacement: LiveLocation | undefined): void {
  shared = replacement;
}

export function useLiveLocation(): LiveSnapshot & {
  readonly set: (enabled: boolean) => void;
} {
  const store = liveLocation();
  const snapshot = useSyncExternalStore(store.subscribe, store.get);
  return { ...snapshot, set: store.set };
}

/** The place the live position stands for, rounded to about a kilometre, which is as fine as the monitors are. */
export function livePin(position: { readonly lat: number; readonly lng: number }): Pin {
  const lat = Math.round(position.lat * 100) / 100;
  const lng = Math.round(position.lng * 100) / 100;
  return { id: 'live', name: 'Here', detail: 'Live location', lat, lng };
}

/** The live place while live location is on and the device has said where it is. */
export function useLivePin(): Pin | undefined {
  const { enabled, position } = useLiveLocation();
  const lat = position === undefined ? undefined : Math.round(position.lat * 100) / 100;
  const lng = position === undefined ? undefined : Math.round(position.lng * 100) / 100;
  // A new object only when the rounded place changes, so screens do not refetch on every fix.
  return useMemo(
    () => (enabled && lat !== undefined && lng !== undefined ? livePin({ lat, lng }) : undefined),
    [enabled, lat, lng],
  );
}
