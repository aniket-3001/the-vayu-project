import { webBluetooth } from './ble';
import { simulatedUnit } from './simulatedUnit';

/**
 * How the app reaches a unit: Bluetooth. Only the prototype build has a made-up unit, so it can be tried with no
 * hardware; the deployed bundle has none of it.
 */
export const defaultTransport = import.meta.env.VITE_DEMO === '1' ? simulatedUnit : webBluetooth;
