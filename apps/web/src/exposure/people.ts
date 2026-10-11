import { PERSONAS, type Persona } from './persona';

/** Where a person spends the day: at school, at work, or mostly at home. */
export type Day = 'school' | 'work' | 'none';

export interface Person {
  readonly id: string;
  readonly name: string;
  readonly age: number;
  readonly day: Day;
}

export interface Household {
  readonly people: readonly Person[];
  /** The id of the person being looked at. */
  readonly current: string;
}

export const MAX_PEOPLE = 6;
/** Dispatched on the window whenever the family or anyone's places change, so every screen that shows them reloads. */
export const HOUSEHOLD_CHANGED = 'vayu:household';
export const PEOPLE_STORAGE_KEY = 'vayu.people.v1';

/** You, to begin with. */
export const ME: Person = { id: 'me', name: 'Me', age: 30, day: 'work' };

/** Children go to school, adults to work, and people 65 and over are, by default, mostly at home. */
export const defaultDayFor = (age: number): Day =>
  age < 18 ? 'school' : age >= 65 ? 'none' : 'work';

/** The kind of day, which sets the places that matter and their usual hours. */
export const personaOf = (person: Pick<Person, 'day'>): Persona =>
  person.day === 'school' ? 'child' : person.day === 'work' ? 'adult' : 'senior';

export const DAY_LABELS: Readonly<Record<Day, string>> = {
  school: 'School',
  work: 'Work',
  none: 'Mostly at home',
};

export const personaBlurb = (person: Person): string =>
  PERSONAS.find((p) => p.id === personaOf(person))?.blurb ?? '';

const isDay = (value: unknown): value is Day =>
  value === 'school' || value === 'work' || value === 'none';

const isPerson = (value: unknown): value is Person => {
  const p = value as Partial<Person> | null;
  return (
    typeof p?.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.age === 'number' &&
    isDay(p.day)
  );
};

const DEFAULT_HOUSEHOLD: Household = { people: [ME], current: ME.id };

export function loadHousehold(storage: Storage): Household {
  try {
    const raw = storage.getItem(PEOPLE_STORAGE_KEY);
    if (raw === null) return DEFAULT_HOUSEHOLD;
    const parsed = JSON.parse(raw) as { people?: unknown; current?: unknown };
    const people = Array.isArray(parsed.people) ? parsed.people.filter(isPerson) : [];
    if (people.length === 0) return DEFAULT_HOUSEHOLD;
    const current = people.some((p) => p.id === parsed.current)
      ? String(parsed.current)
      : (people[0]?.id ?? ME.id);
    return { people, current };
  } catch {
    return DEFAULT_HOUSEHOLD;
  }
}

export function saveHousehold(storage: Storage, household: Household): void {
  try {
    storage.setItem(PEOPLE_STORAGE_KEY, JSON.stringify(household));
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(HOUSEHOLD_CHANGED));
  } catch {
    // Best effort.
  }
}

/** Adds someone and makes them the person being looked at. A name is needed; an age outside 0 to 110 is refused. */
export function addPerson(
  household: Household,
  details: { readonly name: string; readonly age: number; readonly day: Day },
): Household {
  const name = details.name.trim();
  if (name === '' || !Number.isFinite(details.age) || details.age < 0 || details.age > 110)
    return household;
  if (household.people.length >= MAX_PEOPLE) return household;
  const id = `p${String(Date.now())}${String(household.people.length)}`;
  const person: Person = { id, name, age: Math.round(details.age), day: details.day };
  return { people: [...household.people, person], current: id };
}

/** Takes someone out. The last person cannot be removed, so there is always someone to look at. */
export function removePerson(household: Household, id: string): Household {
  if (household.people.length <= 1) return household;
  const people = household.people.filter((p) => p.id !== id);
  const current = household.current === id ? (people[0]?.id ?? ME.id) : household.current;
  return { people, current };
}

export const initials = (name: string): string =>
  name
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
