import { REQUESTS_STORAGE_KEY } from '../assistant/requests';
import { PINS_STORAGE_KEY } from '../data/pins';
import { DEVICES_STORAGE_KEY } from '../devices/devices';
import { LIVE_STORAGE_KEY } from '../exposure/live';
import { PEOPLE_STORAGE_KEY } from '../exposure/people';
import { SPOTS_STORAGE_KEY } from '../exposure/spots';
import { TASKS_STORAGE_KEY } from '../tasks/store';
import type { SampleId } from '../today/sample';
import { UNITS_STORAGE_KEY } from '../units/AirUnits';

export const DEMO_STORAGE_KEY = 'vayu.demo.v1';

/**
 * What a demo scenario changes about the prototype. Each field is read where the app makes its sample
 * data, so a scenario only has to say what is different, never how to draw it.
 */
export interface DemoState {
  readonly id: string;
  readonly name: string;
  /** Every place has this sample day. */
  readonly day?: SampleId;
  /** The number of fires our API counted in the last day. */
  readonly fires?: number;
  /** Start the Exposure tab with the sample track of a day out, as if live location were on. */
  readonly live?: boolean;
  /** Open this alert as soon as My Air shows. */
  readonly openAlert?: string;
  /** Put this question to the assistant as soon as the app opens. */
  readonly ask?: string;
}

/** Everything the app saves on the device, so "Start over" really starts over. */
export const APP_KEYS: readonly string[] = [
  PINS_STORAGE_KEY,
  SPOTS_STORAGE_KEY,
  DEVICES_STORAGE_KEY,
  PEOPLE_STORAGE_KEY,
  LIVE_STORAGE_KEY,
  TASKS_STORAGE_KEY,
  UNITS_STORAGE_KEY,
  REQUESTS_STORAGE_KEY,
  DEMO_STORAGE_KEY,
];

export function readDemo(storage?: Storage): DemoState | undefined {
  // Scenarios exist only in the prototype build. In the deployed app nothing can switch them on.
  if (import.meta.env.VITE_DEMO !== '1') return undefined;
  try {
    const raw = (storage ?? window.localStorage).getItem(DEMO_STORAGE_KEY);
    if (raw === null) return undefined;
    const parsed = JSON.parse(raw) as Partial<DemoState> | null;
    return typeof parsed?.id === 'string' && typeof parsed.name === 'string'
      ? (parsed as DemoState)
      : undefined;
  } catch {
    return undefined;
  }
}

export function clearDemo(storage?: Storage): void {
  try {
    (storage ?? window.localStorage).removeItem(DEMO_STORAGE_KEY);
  } catch {
    // Best effort.
  }
}
