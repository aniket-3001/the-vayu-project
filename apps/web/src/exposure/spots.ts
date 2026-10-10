import { DEMO_PLACES } from '@vayu/contracts';
import { pinId, type Pin } from '../data/pins';
import { WEEKDAYS, isHoliday, weekdayOf } from './calendar';
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
  /** School and work only: the days of the week it runs, 0 is Sunday. Monday to Friday when missing. */
  readonly days?: readonly number[];
}

export type Spots = Readonly<Partial<Record<SpotKind, Spot>>>;

export const SPOTS_STORAGE_KEY = 'vayu.spots.v3';

const pinOf = (id: string): Pin => {
  const place = DEMO_PLACES.find((p) => p.id === id);
  if (place === undefined) throw new Error(`No sample place ${id}`);
  return { id: pinId(place.lat, place.lng), name: place.name, lat: place.lat, lng: place.lng };
};

/**
 * What the prototype starts with for each kind of person, so the dial is never empty: a child at school
 * from 8 to 3, an adult at an office from 9 to 5, a senior at home. Everyone is at home the rest of the time,
 * and outdoor time is logged, never assumed.
 */
export const sampleSpotsFor = (persona: Persona): Spots => {
  switch (persona) {
    case 'child':
      return {
        home: { pin: pinOf('home'), from: 0, to: 24 },
        school: { pin: pinOf('school'), from: 8, to: 15 },
      };
    case 'adult':
      return {
        home: { pin: pinOf('home'), from: 0, to: 24 },
        work: { pin: pinOf('office'), from: 9, to: 17 },
      };
    case 'senior':
      return {
        home: { pin: pinOf('home'), from: 0, to: 24 },
      };
  }
};

/** Default hours for a place set from scratch. */
export const DEFAULT_HOURS: Readonly<
  Record<SpotKind, { readonly from: number; readonly to: number }>
> = {
  home: { from: 0, to: 24 },
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

/**
 * The saved places for one person. The phone's owner starts with the usual ones for their kind of day, the same
 * places as the starter cards; anyone added later starts with none, to be filled in. Never throws.
 */
export function loadSpots(storage: Storage, personId: string, persona: Persona): Spots {
  const start = (): Spots => (personId === 'me' ? sampleSpotsFor(persona) : {});
  try {
    const raw = storage.getItem(SPOTS_STORAGE_KEY);
    if (raw === null) return start();
    const all = JSON.parse(raw) as Record<string, Record<string, unknown> | undefined>;
    const saved = all[personId];
    if (saved === undefined) return start();
    const spots: Partial<Record<SpotKind, Spot>> = {};
    for (const kind of SPOT_KINDS) {
      const value = saved[kind];
      if (isSpot(value)) spots[kind] = value;
    }
    return spots;
  } catch {
    return start();
  }
}

/** Everyone's saved places, so a shared home can be seen from each person. */
export function loadAllSpots(
  storage: Storage,
  people: readonly { readonly id: string; readonly persona: Persona }[],
): readonly Spots[] {
  return people.map((person) => loadSpots(storage, person.id, person.persona));
}

export function saveSpots(storage: Storage, personId: string, spots: Spots): void {
  try {
    const raw = storage.getItem(SPOTS_STORAGE_KEY);
    const all = raw === null ? {} : (JSON.parse(raw) as Record<string, unknown>);
    storage.setItem(SPOTS_STORAGE_KEY, JSON.stringify({ ...all, [personId]: spots }));
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

/**
 * Whether a place is in use on a date. Home always is. School and work run on their days of the week and
 * not on public holidays.
 */
export function runsOn(kind: SpotKind, spot: Spot, date: string): boolean {
  if (kind === 'home' || kind === 'outdoor') return true;
  return (spot.days ?? WEEKDAYS).includes(weekdayOf(date)) && !isHoliday(date);
}
