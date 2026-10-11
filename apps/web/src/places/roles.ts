import type { Pin } from '../data/pins';
import { loadHousehold, personaOf, saveHousehold, type Person } from '../exposure/people';
import { DEFAULT_HOURS, loadSpots, saveSpots, type Spot, type SpotKind } from '../exposure/spots';

/**
 * What a named place stands for in a day: where you sleep, where you work or study, or where you go to be outdoors.
 * Giving a place one of these names is what makes it count in Exposure; any other name is just a place you watch.
 */
export type Role = SpotKind;

const PATTERNS: readonly (readonly [Role, RegExp])[] = [
  ['home', /^(home|house|flat|apartment|my home)$/iu],
  ['school', /^(school|college|campus|university|class)$/iu],
  ['work', /^(work|office|workplace|my office)$/iu],
  ['outdoor', /^(park|garden|playground|ground|outdoors?)$/iu],
];

/** The role a name stands for, or undefined for any other name. */
export function roleOfLabel(label: string): Role | undefined {
  const clean = label.trim();
  return PATTERNS.find(([, pattern]) => pattern.test(clean))?.[0];
}

/** The pin that stands for a role, if one has been set. */
export function pinForRole(role: Role, pins: readonly Pin[]): Pin | undefined {
  return pins.find((pin) => roleOfLabel(pin.name) === role);
}

/** The names a role is called, for words such as “Add a school first”. */
export const ROLE_WORDS: Readonly<Record<Role, string>> = {
  home: 'home',
  work: 'work',
  school: 'school',
  outdoor: 'park',
};

/**
 * Makes a place the one for its role in the phone owner's day, so it is on their Exposure dial from now on. A person
 * mostly goes to work or to school, not both, so setting one clears the other and says which the day is.
 */
export function assignRole(storage: Storage, label: string, pin: Pin): void {
  const role = roleOfLabel(label);
  if (role === undefined) return;
  const household = loadHousehold(storage);
  const me = household.people.find((p) => p.id === 'me');
  if (me === undefined) return;
  const day = role === 'school' ? 'school' : role === 'work' ? 'work' : me.day;
  const owner = { ...me, day };
  if (day !== me.day)
    saveHousehold(storage, {
      ...household,
      people: household.people.map((p) => (p.id === 'me' ? owner : p)),
    });
  const spots = loadSpots(storage, 'me', personaOf(owner));
  // Keep the hours already set for this role; a person goes to work or to school, so the other is dropped.
  const dropped: SpotKind | undefined =
    role === 'school' ? 'work' : role === 'work' ? 'school' : undefined;
  const next = Object.fromEntries(
    Object.entries({
      ...spots,
      [role]: { ...DEFAULT_HOURS[role], ...(spots[role] ?? {}), pin },
    }).filter(([kind]) => kind !== dropped),
  );
  saveSpots(storage, 'me', next);
}

/** Takes a place off the owner's day when it is no longer pinned. */
export function clearRole(storage: Storage, label: string): void {
  const role = roleOfLabel(label);
  if (role === undefined) return;
  const household = loadHousehold(storage);
  const me = household.people.find((p) => p.id === 'me');
  if (me === undefined) return;
  const spots = loadSpots(storage, 'me', personaOf(me));
  saveSpots(
    storage,
    'me',
    Object.fromEntries(Object.entries(spots).filter(([kind]) => kind !== role)),
  );
}

/** Two places are the same place when they are within about 300 metres: the same school pinned two ways. */
export const samePlace = (
  a: { readonly lat: number; readonly lng: number },
  b: { readonly lat: number; readonly lng: number },
): boolean => Math.abs(a.lat - b.lat) < 0.003 && Math.abs(a.lng - b.lng) < 0.003;

/** A name that says it is a school, whatever else it is called: "DAV Public School", "Sunrise Vidyalaya". */
const SCHOOLISH = /\b(school|vidyalaya|vidyalay|academy|pathshala)\b/iu;

/** The set places of everyone in the family that go by a given kind, with the person they are for. */
export function familyPlaces(
  storage: Storage,
  kind: SpotKind,
): readonly { readonly person: Person; readonly spot: Spot }[] {
  const { people } = loadHousehold(storage);
  return people.flatMap((person) => {
    const spot = loadSpots(storage, person.id, personaOf(person))[kind];
    return spot === undefined ? [] : [{ person, spot }];
  });
}

/**
 * Whether a pinned place is a school: it is called one (School, or a name with school in it), or someone in the
 * family has set it as their school. The same test everywhere a school is treated as one, such as the assembly line
 * on its card, whichever screen it was added from.
 */
export function isSchoolPin(
  pin: Pin,
  storage: Storage = typeof window === 'undefined' ? ({} as Storage) : window.localStorage,
): boolean {
  if (roleOfLabel(pin.name) === 'school' || SCHOOLISH.test(pin.name)) return true;
  try {
    return familyPlaces(storage, 'school').some((entry) => samePlace(entry.spot.pin, pin));
  } catch {
    return false;
  }
}
