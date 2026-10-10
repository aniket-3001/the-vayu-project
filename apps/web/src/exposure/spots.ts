import { DEMO_PLACES } from '@vayu/contracts';
import { pinId, type Pin } from '../data/pins';

/** The kinds of place a person spends the day in. Outdoor is the park, or any open-air spot. */
export const SPOT_KINDS = ['home', 'work', 'school', 'outdoor'] as const;
export type SpotKind = (typeof SPOT_KINDS)[number];

export const SPOT_LABELS: Readonly<Record<SpotKind, string>> = {
  home: 'Home',
  work: 'Work',
  school: 'School',
  outdoor: 'Outdoor',
};

/** A place the person has set, and the hours they are usually there. `to` before `from` means it runs past midnight. */
export interface Spot {
  readonly pin: Pin;
  /** Hour of the day, 0 to 24. */
  readonly from: number;
  readonly to: number;
}

export type Spots = Readonly<Partial<Record<SpotKind, Spot>>>;

export const SPOTS_STORAGE_KEY = 'vayu.spots.v1';

const pinOf = (id: string): Pin => {
  const place = DEMO_PLACES.find((p) => p.id === id);
  if (place === undefined) throw new Error(`No sample place ${id}`);
  return { id: pinId(place.lat, place.lng), name: place.name, lat: place.lat, lng: place.lng };
};

/** What the prototype starts with, so the dial is not empty: home, an office, a park. School is left to set. */
export const SAMPLE_SPOTS: Spots = {
  home: { pin: pinOf('home'), from: 19, to: 8 },
  work: { pin: pinOf('office'), from: 9, to: 17 },
  outdoor: { pin: pinOf('park'), from: 17, to: 19 },
};

/** Default hours for a place set from scratch. */
export const DEFAULT_HOURS: Readonly<
  Record<SpotKind, { readonly from: number; readonly to: number }>
> = {
  home: { from: 19, to: 8 },
  work: { from: 9, to: 17 },
  school: { from: 8, to: 15 },
  outdoor: { from: 17, to: 18 },
};

const isSpot = (value: unknown): value is Spot => {
  const spot = value as Partial<Spot> | null;
  const pin = spot?.pin as Partial<Pin> | undefined;
  return (
    typeof spot?.from === 'number' &&
    typeof spot.to === 'number' &&
    typeof pin?.id === 'string' &&
    typeof pin.name === 'string' &&
    typeof pin.lat === 'number' &&
    typeof pin.lng === 'number'
  );
};

/** The saved places, or the sample ones if nothing was ever saved. Never throws. */
export function loadSpots(storage: Storage): Spots {
  try {
    const raw = storage.getItem(SPOTS_STORAGE_KEY);
    if (raw === null) return SAMPLE_SPOTS;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const spots: Partial<Record<SpotKind, Spot>> = {};
    for (const kind of SPOT_KINDS) {
      const value = parsed[kind];
      if (isSpot(value)) spots[kind] = value;
    }
    return spots;
  } catch {
    return SAMPLE_SPOTS;
  }
}

export function saveSpots(storage: Storage, spots: Spots): void {
  try {
    storage.setItem(SPOTS_STORAGE_KEY, JSON.stringify(spots));
  } catch {
    // Best effort: a blocked or full storage must never break the screen.
  }
}

/** Whether `hour` (a whole hour, 0 to 23) falls inside the spot's window. */
export function isThere(spot: Spot, hour: number): boolean {
  return spot.from <= spot.to
    ? hour >= spot.from && hour < spot.to
    : hour >= spot.from || hour < spot.to;
}
