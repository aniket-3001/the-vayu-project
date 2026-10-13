import { useCallback, useEffect, useState } from 'react';
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
import { forgetMeasured } from '@vayu/unit';

/** Dispatched on the window when the devices change, so every screen that shows them reads them again. */
export const DEVICES_CHANGED = 'vayu:devices';

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
  useEffect(() => {
    const again = (): void => {
      setDevices(loadDevices(storage));
    };
    window.addEventListener(DEVICES_CHANGED, again);
    return () => {
      window.removeEventListener(DEVICES_CHANGED, again);
    };
  }, [storage]);
  const change = useCallback(
    (next: (current: readonly Device[]) => readonly Device[]) => {
      // From what is stored, so two screens cannot overwrite each other's change.
      const updated = next(loadDevices(storage));
      saveDevices(storage, updated);
      setDevices(updated);
      window.dispatchEvent(new Event(DEVICES_CHANGED));
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
