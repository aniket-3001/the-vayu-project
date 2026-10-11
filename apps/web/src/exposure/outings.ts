import { pinId, type Pin } from '../data/pins';
import { hourName } from '../today/time';
import type { DateKey } from './model';

/** What someone was doing outdoors. */
export const ACTIVITIES = ['walk', 'play', 'cycle', 'other'] as const;
export type Activity = (typeof ACTIVITIES)[number];

export const ACTIVITY_LABELS: Readonly<Record<Activity, string>> = {
  walk: 'Walk or run',
  play: 'Play',
  cycle: 'Cycle',
  other: 'Outdoors',
};

/** One stretch of time a person spent outside, and where. For people other than the one holding the phone. */
export interface Outing {
  readonly id: string;
  readonly date: DateKey;
  /** Minutes after midnight when it began. */
  readonly start: number;
  readonly minutes: number;
  readonly activity: Activity;
  readonly pin: Pin;
  /** Whether there were trees around. Cuts the estimate a little, and says it is assumed. */
  readonly trees: boolean;
}

export const OUTINGS_STORAGE_KEY = 'vayu.outings.v1';
/** Dispatched on the window whenever outings change, so every screen showing them reloads. */
export const OUTINGS_CHANGED = 'vayu:outings';

const isOuting = (value: unknown): value is Outing => {
  const o = value as Partial<Outing> | null;
  const pin = o?.pin as Partial<Pin> | undefined;
  return (
    typeof o?.id === 'string' &&
    typeof o.date === 'string' &&
    typeof o.start === 'number' &&
    typeof o.minutes === 'number' &&
    typeof o.trees === 'boolean' &&
    ACTIVITIES.some((a) => a === o.activity) &&
    typeof pin?.id === 'string' &&
    typeof pin.name === 'string' &&
    typeof pin.lat === 'number' &&
    typeof pin.lng === 'number'
  );
};

const readAll = (storage: Storage): Record<string, unknown> => {
  try {
    const raw = storage.getItem(OUTINGS_STORAGE_KEY);
    const parsed: unknown = raw === null ? {} : JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

export function loadOutings(storage: Storage, personId: string): readonly Outing[] {
  const mine = readAll(storage)[personId];
  return Array.isArray(mine) ? mine.filter(isOuting) : [];
}

export function saveOutings(storage: Storage, personId: string, outings: readonly Outing[]): void {
  try {
    storage.setItem(
      OUTINGS_STORAGE_KEY,
      JSON.stringify({ ...readAll(storage), [personId]: outings }),
    );
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(OUTINGS_CHANGED));
  } catch {
    // Best effort.
  }
}

export const MAX_OUTING_MINUTES = 360;

/** What is wrong with an outing, in words a person can act on, or undefined if it is fine. */
export function problemWithOuting(
  outing: Pick<Outing, 'start' | 'minutes'>,
  date: DateKey,
  today: DateKey,
  nowMinutes: number,
): string | undefined {
  if (!Number.isFinite(outing.minutes) || outing.minutes < 5)
    return 'Please give a time of at least 5 minutes.';
  if (outing.minutes > MAX_OUTING_MINUTES) return 'That is more than six hours. Please check it.';
  if (date > today) return 'That date has not happened yet.';
  if (date === today && outing.start + outing.minutes > nowMinutes + 1)
    return 'That time has not happened yet.';
  return undefined;
}

export function newOuting(details: Omit<Outing, 'id'>, taken: readonly Outing[]): Outing {
  return { id: `o${String(Date.now())}${String(taken.length)}`, ...details };
}

export const addOuting = (outings: readonly Outing[], outing: Outing): readonly Outing[] => [
  ...outings,
  outing,
];

export const removeOuting = (outings: readonly Outing[], id: string): readonly Outing[] =>
  outings.filter((o) => o.id !== id);

/** "17:05". */
/** A time of day as a person says it: 4 pm, 4:30 pm. `clockOf` stays 24-hour because a time field needs it. */
export const clockWords = (minutes: number): string =>
  hourName(Math.floor(minutes / 60), minutes % 60);

export const clockOf = (minutes: number): string =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export const pinFor = (pin: Pin): Pin => ({
  id: pin.id === '' ? pinId(pin.lat, pin.lng) : pin.id,
  name: pin.name,
  ...(pin.detail === undefined ? {} : { detail: pin.detail }),
  lat: pin.lat,
  lng: pin.lng,
});
