import { DEMO_PLACES } from '@vayu/contracts';
import { pinId, type Pin } from '../data/pins';
import type { Persona } from './persona';

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
  /** Outdoor places only: whether there are trees around. Cuts the estimate a little, and says it is assumed. */
  readonly trees?: boolean;
}

export type Spots = Readonly<Partial<Record<SpotKind, Spot>>>;

export const SPOTS_STORAGE_KEY = 'vayu.spots.v2';

const pinOf = (id: string): Pin => {
  const place = DEMO_PLACES.find((p) => p.id === id);
  if (place === undefined) throw new Error(`No sample place ${id}`);
  return { id: pinId(place.lat, place.lng), name: place.name, lat: place.lat, lng: place.lng };
};

/**
 * What the prototype starts with for each kind of person, so the dial is never empty: a child at school
 * from 8 to 3, an adult at an office from 9 to 5, a senior at home with a morning walk in the park.
 */
export const sampleSpotsFor = (persona: Persona): Spots => {
  switch (persona) {
    case 'child':
      return {
        home: { pin: pinOf('home'), from: 15, to: 8 },
        school: { pin: pinOf('school'), from: 8, to: 15 },
        outdoor: { pin: pinOf('park'), from: 16, to: 17, trees: true },
      };
    case 'adult':
      return {
        home: { pin: pinOf('home'), from: 19, to: 9 },
        work: { pin: pinOf('office'), from: 9, to: 17 },
        outdoor: { pin: pinOf('park'), from: 17, to: 19, trees: true },
      };
    case 'senior':
      return {
        home: { pin: pinOf('home'), from: 8, to: 6 },
        outdoor: { pin: pinOf('park'), from: 6, to: 8, trees: true },
      };
  }
};

/** Default hours for a place set from scratch. */
export const DEFAULT_HOURS: Readonly<
  Record<SpotKind, { readonly from: number; readonly to: number }>
> = {
  home: { from: 19, to: 9 },
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

/** The saved places for a kind of person, or the sample ones if none were ever saved. Never throws. */
export function loadSpots(storage: Storage, persona: Persona): Spots {
  try {
    const raw = storage.getItem(SPOTS_STORAGE_KEY);
    if (raw === null) return sampleSpotsFor(persona);
    const all = JSON.parse(raw) as Record<string, Record<string, unknown> | undefined>;
    const saved = all[persona];
    if (saved === undefined) return sampleSpotsFor(persona);
    const spots: Partial<Record<SpotKind, Spot>> = {};
    for (const kind of SPOT_KINDS) {
      const value = saved[kind];
      if (isSpot(value)) spots[kind] = value;
    }
    return spots;
  } catch {
    return sampleSpotsFor(persona);
  }
}

/** Every saved set of places, for all kinds of person, so a shared home can be seen from each. */
export function loadAllSpots(storage: Storage): readonly Spots[] {
  return (['child', 'adult', 'senior'] as const).map((persona) => loadSpots(storage, persona));
}

export function saveSpots(storage: Storage, persona: Persona, spots: Spots): void {
  try {
    const raw = storage.getItem(SPOTS_STORAGE_KEY);
    const all = raw === null ? {} : (JSON.parse(raw) as Record<string, unknown>);
    storage.setItem(SPOTS_STORAGE_KEY, JSON.stringify({ ...all, [persona]: spots }));
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
