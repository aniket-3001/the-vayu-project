import { useCallback, useEffect, useState } from 'react';
import { addPin, loadPins, movePin, removePin, savePins, type Pin } from '../data/pins';

type Place = Parameters<typeof addPin>[1];

/** Dispatched on the window whenever the pinned places change, so every screen that shows them reloads. */
export const PINS_CHANGED = 'vayu:pins';

/**
 * The pinned places, kept in this browser and shared by every screen. A change made on one screen (a place added
 * on My Air) is seen at once on the others that are already open (the assistant, the alerts), because each change is
 * written to storage and announced, and every user of this hook reads storage again when it hears.
 */
export function usePins(storage: Storage = window.localStorage): {
  readonly pins: readonly Pin[];
  readonly add: (place: Place) => void;
  readonly remove: (id: string) => void;
  /** Puts one place where another was, so the order of the cards is the person's own. */
  readonly move: (fromId: string, toId: string) => void;
} {
  const [pins, setPins] = useState<readonly Pin[]>(() => loadPins(storage));
  useEffect(() => {
    const again = (): void => {
      setPins(loadPins(storage));
    };
    window.addEventListener(PINS_CHANGED, again);
    return () => {
      window.removeEventListener(PINS_CHANGED, again);
    };
  }, [storage]);
  const change = useCallback(
    (next: (current: readonly Pin[]) => readonly Pin[]) => {
      // From what is stored, not from this copy, so two screens cannot overwrite each other's change.
      savePins(storage, next(loadPins(storage)));
      window.dispatchEvent(new Event(PINS_CHANGED));
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
    move: (fromId, toId) => {
      change((current) => movePin(current, fromId, toId));
    },
  };
}
