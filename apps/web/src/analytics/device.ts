import { loadPins } from '../data/pins';
import type { DeviceInfo } from './types';

/** Kept in step with `apps/web/package.json` by hand; it tells the two phone apps and the website's builds apart. */
export const APP_VERSION = '0.1.0';
export const DEVICE_KEY = 'vayu.analytics.device';

let inMemoryId: string | undefined;

/** A random id for this install, made here and kept on the device. It is not tied to a person or a phone number. */
export function deviceId(storage: Storage | undefined = safeStorage()): string {
  try {
    const kept = storage?.getItem(DEVICE_KEY);
    if (kept !== null && kept !== undefined && /^[A-Za-z0-9-]{8,64}$/u.test(kept)) return kept;
    const made = crypto.randomUUID();
    storage?.setItem(DEVICE_KEY, made);
    inMemoryId ??= made;
    return storage === undefined ? inMemoryId : made;
  } catch {
    inMemoryId ??= crypto.randomUUID();
    return inMemoryId;
  }
}

function safeStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

const clean = (text: string): string => text.replace(/[^A-Za-z0-9 ._()/-]/gu, '').slice(0, 40);

/**
 * What kind of device and app this is. The person's saved first place, rounded to about 11 km, says roughly where they
 * are, with no permission asked and nothing more exact than that ever leaving the device.
 */
export function deviceInfo(storage: Storage | undefined = safeStorage()): DeviceInfo {
  const shell = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  const named = shell?.getPlatform?.();
  const platform = named === 'android' || named === 'ios' ? named : 'web';
  const agent = navigator.userAgent;
  const os = /Android [\d.]+/u.exec(agent)?.[0] ?? /iPhone OS [\d_]+/u.exec(agent)?.[0] ?? /Windows|Mac OS X|Linux/u.exec(agent)?.[0] ?? 'unknown';
  const model = /;\s*([^;)]+)\sBuild\//u.exec(agent)?.[1] ?? 'unknown';
  let cell: DeviceInfo['cell'];
  try {
    const first = storage === undefined ? undefined : loadPins(storage)[0];
    if (first !== undefined)
      cell = { lat: Math.round(first.lat * 10) / 10, lng: Math.round(first.lng * 10) / 10 };
  } catch {
    cell = undefined;
  }
  return {
    platform,
    appVersion: APP_VERSION,
    os: clean(os.replace(/_/gu, '.')),
    model: clean(model),
    screen: `${String(window.screen.width)}x${String(window.screen.height)}`,
    lang: clean(navigator.language),
    ...(cell === undefined ? {} : { cell }),
  };
}
