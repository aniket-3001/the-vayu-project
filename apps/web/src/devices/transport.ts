import { webBluetooth, type UnitTransport } from './ble';
import { nativeBle } from './nativeBle';

/** Native inside the phone app, the browser's own Bluetooth everywhere else. */
export const pickTransport = (native: boolean): UnitTransport =>
  native ? nativeBle : webBluetooth;

/**
 * How the app reaches a unit. `VITE_NATIVE` is set only by the build for the phone apps; in the website's build it
 * is replaced by a constant, so the native branch and its plugin are dropped from the files that are served.
 */
export const defaultTransport = pickTransport(import.meta.env.VITE_NATIVE === 'true');
