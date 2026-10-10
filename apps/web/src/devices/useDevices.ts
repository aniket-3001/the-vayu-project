import { useCallback, useState } from 'react';
import {
  addDevice,
  changeDevice,
  loadDevices,
  removeDevice,
  saveDevices,
  type Device,
  type DeviceMode,
} from './devices';
import type { SpotKind } from '../exposure/spots';

/** The monitors the person added, kept in this browser. */
export function useDevices(storage: Storage = window.localStorage): {
  readonly devices: readonly Device[];
  readonly add: (device: { readonly name: string; readonly where: SpotKind }) => void;
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
    remove: (id) => {
      change((current) => removeDevice(current, id));
    },
    update: (id, patch) => {
      change((current) => changeDevice(current, id, patch));
    },
  };
}
