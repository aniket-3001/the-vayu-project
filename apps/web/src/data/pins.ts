import { DEMO_PLACES } from './places';

/** A place the person keeps an eye on. Saved in this browser only; never sent anywhere. */
export interface Pin {
  readonly id: string;
  readonly name: string;
  /** Where it is, for example "South West, Delhi". */
  readonly detail?: string;
  readonly lat: number;
  readonly lng: number;
}

export const MAX_PINS = 8;
const STORAGE_KEY = 'vayu.pins.v1';

/** Two places within about a kilometre are the same pin: our monitors are not finer than that. */
export const pinId = (lat: number, lng: number): string => `${lat.toFixed(2)},${lng.toFixed(2)}`;

const SAMPLES: readonly Pin[] = DEMO_PLACES.map((place) => ({
  id: pinId(place.lat, place.lng),
  name: place.name,
  lat: place.lat,
  lng: place.lng,
}));

function isPin(value: unknown): value is Pin {
  const pin = value as Partial<Pin> | null;
  return (
    typeof pin?.id === 'string' &&
    typeof pin.name === 'string' &&
    typeof pin.lat === 'number' &&
    typeof pin.lng === 'number'
  );
}

/** The saved pins, or the four sample places if nothing was ever saved. Never throws. */
export function loadPins(storage: Storage): readonly Pin[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return SAMPLES;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isPin) : SAMPLES;
  } catch {
    return SAMPLES;
  }
}

export function savePins(storage: Storage, pins: readonly Pin[]): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(pins));
  } catch {
    // Best effort: a blocked or full storage must never break the screen.
  }
}

/** Puts a place at the top. The same spot is never pinned twice; past the cap the oldest drops. */
export function addPin(
  pins: readonly Pin[],
  place: {
    readonly name: string;
    readonly detail?: string;
    readonly lat: number;
    readonly lng: number;
  },
): readonly Pin[] {
  const id = pinId(place.lat, place.lng);
  if (pins.some((pin) => pin.id === id)) return pins;
  return [{ id, ...place }, ...pins].slice(0, MAX_PINS);
}

export function removePin(pins: readonly Pin[], id: string): readonly Pin[] {
  return pins.filter((pin) => pin.id !== id);
}
