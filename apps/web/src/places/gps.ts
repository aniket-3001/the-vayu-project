import { useSyncExternalStore } from 'react';

export const GPS_STORAGE_KEY = 'vayu.gps.v1';

const read = (): boolean => {
  try {
    return window.localStorage.getItem(GPS_STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
};

let on = typeof window === 'undefined' ? true : read();
const listeners = new Set<() => void>();

/** Whether the app may ask where the device is at all. On to begin with; remembered when it is turned off. */
export const gpsOn = (): boolean => on;

/**
 * The app's own GPS switch, apart from “Detect my location”: this decides whether the app may use the device's
 * location at all, and “Detect my location” (and the auto-calculation in Exposure) work only while it is on.
 */
export function setGps(next: boolean): void {
  on = next;
  try {
    window.localStorage.setItem(GPS_STORAGE_KEY, next ? 'on' : 'off');
  } catch {
    // Best effort: it still holds for this visit.
  }
  for (const listener of listeners) listener();
}

export function useGps(): { readonly on: boolean; readonly set: (next: boolean) => void } {
  const value = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => on,
  );
  return { on: value, set: setGps };
}

/** Said wherever something needs the location and the switch is off. */
export const GPS_OFF_WORDS = 'GPS is off in this app. Turn it on with the GPS button first.';
