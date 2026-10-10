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
}

export interface LiveLocation {
  readonly get: () => LiveSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
  /** Turns it on or off. On asks the browser, and keeps following the device until turned off. */
  readonly set: (enabled: boolean) => void;
  /** Starts following again if it was left on last time. Called once when the app opens. */
  readonly resume: () => void;
}

interface Options {
  readonly storage?: Storage;
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
  let watch: number | undefined;

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
  const stopWatching = (): void => {
    if (watch !== undefined) geo()?.clearWatch(watch);
    watch = undefined;
  };
  const start = (): void => {
    stopWatching();
    const geolocation = geo();
    if (geolocation === undefined) {
      change({ enabled: true, status: 'unavailable' });
      return;
    }
    change({ enabled: true, status: 'asking' });
    watch = geolocation.watchPosition(
      (fix) => {
        change({
          enabled: true,
          status: 'on',
          position: { lat: fix.coords.latitude, lng: fix.coords.longitude },
        });
      },
      () => {
        // Refused or failed: say so, and stop asking. The person can try the switch again.
        stopWatching();
        remember(false);
        change({ enabled: false, status: 'refused' });
      },
      { maximumAge: 60_000, timeout: 20_000 },
    );
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
        stopWatching();
        change({ enabled: false, status: 'off' });
      }
    },
    resume: () => {
      if (snapshot.enabled && watch === undefined) start();
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
