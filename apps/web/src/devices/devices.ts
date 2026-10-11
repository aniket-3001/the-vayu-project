import { SPOT_KINDS, type SpotKind } from '../exposure/spots';

/** A Vayu monitor the person has added, and the place it lives in. */
export interface Device {
  readonly id: string;
  readonly name: string;
  readonly where: SpotKind;
  /** Auto switches the cleaner on and off by the air; On and Off are the person's say. Auto when missing. */
  readonly mode?: DeviceMode;
  /** The indoor PM2.5, in µg/m³, above which Auto switches the cleaner on. */
  readonly autoAbove?: number;
  /**
   * True for a real measuring unit, connected over Bluetooth, whose readings are measured and kept. Everything else is
   * a sample device whose numbers are worked out from the outside air and never counted.
   */
  readonly measured?: boolean;
}

export type DeviceMode = 'auto' | 'on' | 'off';
export const DEVICE_MODES: readonly DeviceMode[] = ['auto', 'on', 'off'];

/** How touchy Auto is. The numbers are PM2.5 in µg/m³; the EPA's "good" ends at 12 and "moderate" at 35. */
export const AUTO_LEVELS = [
  { pm25: 12, label: 'Sensitive', note: 'above Good' },
  { pm25: 35, label: 'Balanced', note: 'above Moderate' },
  { pm25: 55, label: 'Relaxed', note: 'above Unhealthy for some' },
] as const;
export const DEFAULT_AUTO_ABOVE = 35;

export const modeOf = (device: Device): DeviceMode => device.mode ?? 'auto';
export const autoAboveOf = (device: Device): number => device.autoAbove ?? DEFAULT_AUTO_ABOVE;

export const changeDevice = (
  devices: readonly Device[],
  id: string,
  patch: { readonly mode?: DeviceMode; readonly autoAbove?: number },
): readonly Device[] =>
  devices.map((device) => (device.id === id ? { ...device, ...patch } : device));

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

/** A real unit, by the name it advertises; connecting the same unit again finds it rather than adding it twice. */
export function addMeasuredDevice(
  devices: readonly Device[],
  unit: { readonly bleName: string; readonly where: SpotKind },
): readonly Device[] {
  const id = `unit:${unit.bleName}`;
  if (devices.some((d) => d.id === id))
    return devices.map((d) => (d.id === id ? { ...d, where: unit.where } : d));
  return [...devices, { id, name: unit.bleName, where: unit.where, measured: true }].slice(
    0,
    MAX_DEVICES,
  );
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
