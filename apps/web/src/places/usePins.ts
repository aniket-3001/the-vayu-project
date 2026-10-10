import { useCallback, useState } from 'react';
import { addPin, loadPins, removePin, savePins, type Pin } from '../data/pins';

type Place = Parameters<typeof addPin>[1];

/** The pinned places, kept in this browser. Every change is saved straight away. */
export function usePins(storage: Storage = window.localStorage): {
  readonly pins: readonly Pin[];
  readonly add: (place: Place) => void;
  readonly remove: (id: string) => void;
} {
  const [pins, setPins] = useState<readonly Pin[]>(() => loadPins(storage));
  const change = useCallback(
    (next: (current: readonly Pin[]) => readonly Pin[]) => {
      setPins((current) => {
        const updated = next(current);
        savePins(storage, updated);
        return updated;
      });
    },
    [storage],
  );
  return {
    pins,
    add: (place) => {
      change((current) => addPin(current, place));
    },
    remove: (id) => {
      change((current) => removePin(current, id));
    },
  };
}
