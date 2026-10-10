import { SPOT_KINDS, type SpotKind } from '../exposure/spots';

/** A Vayu monitor the person has added, and the place it lives in. */
export interface Device {
  readonly id: string;
  readonly name: string;
  readonly where: SpotKind;
}

export const DEVICES_STORAGE_KEY = 'vayu.devices.v1';
export const MAX_DEVICES = 6;

const isDevice = (value: unknown): value is Device => {
  const d = value as Partial<Device> | null;
  return (
    typeof d?.id === 'string' &&
    typeof d.name === 'string' &&
    SPOT_KINDS.some((kind) => kind === d.where)
  );
};

export function loadDevices(storage: Storage): readonly Device[] {
  try {
    const raw = storage.getItem(DEVICES_STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isDevice) : [];
  } catch {
    return [];
  }
}

export function saveDevices(storage: Storage, devices: readonly Device[]): void {
  try {
    storage.setItem(DEVICES_STORAGE_KEY, JSON.stringify(devices));
  } catch {
    // Best effort.
  }
}

export function addDevice(
  devices: readonly Device[],
  device: { readonly name: string; readonly where: SpotKind },
): readonly Device[] {
  const name = device.name.trim() === '' ? 'Vayu monitor' : device.name.trim();
  const id = `d${String(Date.now())}${String(devices.length)}`;
  return [...devices, { id, name, where: device.where }].slice(0, MAX_DEVICES);
}

export const removeDevice = (devices: readonly Device[], id: string): readonly Device[] =>
  devices.filter((device) => device.id !== id);

/**
 * How much of the outdoor PM2.5 a monitor next to a running purifier reads indoors. The monitor is not
 * built yet, so this number is made up and every screen that uses it says "Sample reading".
 */
export const SAMPLE_INDOOR_SHARE = 0.3;

export const sampleIndoorPm25 = (outdoorPm25: number): number =>
  Math.round(outdoorPm25 * SAMPLE_INDOOR_SHARE * 10) / 10;
