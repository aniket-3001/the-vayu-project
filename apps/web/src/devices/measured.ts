import { hourOfDay, isoDate } from '../today/time';

/**
 * What a measuring unit has actually measured, kept on this device as the mean PM2.5 of each hour of each day, so
 * Exposure can count the hours spent where a unit is. Only hours with at least a few readings count, a reading that is
 * still warming up is never kept, and nothing here is ever made up.
 */
export const MEASURED_STORAGE_KEY = 'vayu.measured.v1';

/** The fewest readings an hour must have, at two seconds each, to be counted: about two minutes of it. */
export const MIN_READINGS_PER_HOUR = 60;
/** How many days are kept. */
const KEEP_DAYS = 14;

interface HourSum {
  readonly sum: number;
  readonly n: number;
}
type Days = Record<string, readonly (HourSum | null)[]>;
type Store = Record<string, Days>;

function load(storage: Storage): Store {
  try {
    const raw = storage.getItem(MEASURED_STORAGE_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

function save(storage: Storage, store: Store): void {
  try {
    storage.setItem(MEASURED_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Best effort: it still counts for this visit.
  }
}

/** Adds one reading of PM2.5 (µg/m³) taken at `atMs` to the hour it falls in, for one unit. */
export function recordReading(
  storage: Storage,
  deviceId: string,
  atMs: number,
  pm25: number,
): void {
  if (!Number.isFinite(pm25) || pm25 < 0) return;
  const iso = new Date(atMs).toISOString();
  const date = isoDate(iso);
  const hour = Math.floor(hourOfDay(iso));
  const store = load(storage);
  const day: (HourSum | null)[] = [
    ...(store[deviceId]?.[date] ?? Array.from({ length: 24 }, () => null)),
  ];
  const had = day[hour] ?? { sum: 0, n: 0 };
  day[hour] = { sum: had.sum + pm25, n: had.n + 1 };
  // Keep the most recent days only.
  const days = Object.fromEntries<readonly (HourSum | null)[]>(
    Object.entries({ ...(store[deviceId] ?? {}), [date]: day })
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-KEEP_DAYS),
  );
  save(storage, { ...store, [deviceId]: days });
}

/** The measured mean PM2.5 for each hour of a date (undefined where too few readings), for one unit. */
export function measuredHourly(
  storage: Storage,
  deviceId: string,
  date: string,
): readonly (number | undefined)[] {
  const day = load(storage)[deviceId]?.[date];
  return Array.from({ length: 24 }, (_, hour) => {
    const got = day?.[hour];
    if (got === null || got === undefined || got.n < MIN_READINGS_PER_HOUR) return undefined;
    return Math.round((got.sum / got.n) * 10) / 10;
  });
}

/** Forgets everything a unit measured. */
export function forgetMeasured(storage: Storage, deviceId: string): void {
  const store = load(storage);
  if (store[deviceId] === undefined) return;
  save(storage, Object.fromEntries<Days>(Object.entries(store).filter(([id]) => id !== deviceId)));
}
