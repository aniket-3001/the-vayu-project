import type { Pin } from '../data/pins';
import { HOUSEHOLD_CHANGED, loadHousehold, personaOf, type Person } from '../exposure/people';
import { loadSpots, type SpotKind } from '../exposure/spots';
import { isSchoolPin, pinForRole, samePlace } from '../places/roles';

export { HOUSEHOLD_CHANGED };

/** A place in the family's timetable, and who goes there and when. */
export interface DayPlace {
  readonly key: string;
  readonly role: 'home' | 'school' | 'work';
  readonly pin: Pin;
  readonly people: readonly {
    readonly person: Person;
    readonly hours: { readonly from: number; readonly to: number };
  }[];
}

const keyOf = (role: string, pin: { readonly lat: number; readonly lng: number }): string =>
  `${role}:${pin.lat.toFixed(2)},${pin.lng.toFixed(2)}`;

/**
 * The places the day is spent in, by the timetable that was set, not by where a phone is: home, each school, and
 * work. A place several people share is one place with all of them on it. If nothing has been set, the first place
 * pinned stands for home, and a school that is pinned but not yet anyone's is still a school.
 */
export function dayPlaces(storage: Storage, pins: readonly Pin[]): readonly DayPlace[] {
  const { people } = loadHousehold(storage);
  const found: DayPlace[] = [];
  const add = (
    role: DayPlace['role'],
    pin: Pin,
    person: Person | undefined,
    hours: { from: number; to: number },
  ): void => {
    const existing = found.find((p) => p.role === role && samePlace(p.pin, pin));
    if (existing !== undefined) {
      if (person !== undefined && !existing.people.some((e) => e.person.id === person.id))
        (existing.people as DayPlace['people'][number][]).push({ person, hours });
      return;
    }
    found.push({
      key: keyOf(role, pin),
      role,
      pin,
      people: person === undefined ? [] : [{ person, hours }],
    });
  };
  for (const person of people) {
    const spots = loadSpots(storage, person.id, personaOf(person));
    for (const kind of ['home', 'school', 'work'] as const satisfies readonly SpotKind[]) {
      const spot = spots[kind];
      if (spot !== undefined) add(kind, spot.pin, person, { from: spot.from, to: spot.to });
    }
  }
  // A school that is pinned, called a school or not yet anyone's, is still one.
  for (const pin of pins)
    if (isSchoolPin(pin, storage)) add('school', pin, undefined, { from: 8, to: 15 });
  if (!found.some((p) => p.role === 'home')) {
    const home = pinForRole('home', pins) ?? pins.find((pin) => !isSchoolPin(pin, storage));
    if (home !== undefined)
      found.unshift({ key: keyOf('home', home), role: 'home', pin: home, people: [] });
  }
  const order = { home: 0, school: 1, work: 2 } as const;
  return [...found].sort((a, b) => order[a.role] - order[b.role]).slice(0, 4);
}
