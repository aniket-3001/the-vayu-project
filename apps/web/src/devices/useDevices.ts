import { useCallback, useState } from 'react';
import {
  addDevice,
  addMeasuredDevice,
  changeDevice,
  loadDevices,
  removeDevice,
  saveDevices,
  type Device,
  type DeviceMode,
} from './devices';
import type { SpotKind } from '../exposure/spots';
import { forgetMeasured } from './measured';

/** The monitors the person added, kept in this browser. */
export function useDevices(storage: Storage = window.localStorage): {
  readonly devices: readonly Device[];
  readonly add: (device: { readonly name: string; readonly where: SpotKind }) => void;
  /** A real unit that has just been connected, by the name it advertises; it is kept so its readings count. */
  readonly addMeasured: (unit: { readonly bleName: string; readonly where: SpotKind }) => string;
  readonly remove: (id: string) => void;
  readonly update: (
    id: string,
    patch: { readonly mode?: DeviceMode; readonly autoAbove?: number },
  ) => void;
} {
  const [devices, setDevices] = useState<readonly Device[]>(() => loadDevices(storage));
  const change = useCallback(
    (next: (current: readonly Device[]) => readonly Device[]) => {
      setDevices((current) => {
        const updated = next(current);
        saveDevices(storage, updated);
        return updated;
      });
    },
    [storage],
  );
  return {
    devices,
    add: (device) => {
      change((current) => addDevice(current, device));
    },
    addMeasured: (unit) => {
      change((current) => addMeasuredDevice(current, unit));
      return `unit:${unit.bleName}`;
    },
    remove: (id) => {
      change((current) => removeDevice(current, id));
      forgetMeasured(storage, id);
    },
    update: (id, patch) => {
      change((current) => changeDevice(current, id, patch));
    },
  };
}
