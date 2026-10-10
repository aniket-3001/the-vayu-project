/** Time helpers. India has no daylight saving, so local time is a fixed UTC+05:30. */

export const HOUR_MS = 3_600_000;
export const IST_OFFSET_MINUTES = 330;

/** Milliseconds since the epoch for an ISO timestamp. Throws on an invalid timestamp (a bug, not a user error). */
export function toMs(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new RangeError(`Invalid timestamp: ${iso}`);
  return ms;
}

export const toIso = (ms: number): string => new Date(ms).toISOString();

export const floorToHourMs = (ms: number): number => Math.floor(ms / HOUR_MS) * HOUR_MS;

/** The hour of day, 0 to 23, in India. */
export function localHour(iso: string): number {
  return new Date(toMs(iso) + IST_OFFSET_MINUTES * 60_000).getUTCHours();
}

/** The calendar date, YYYY-MM-DD, in India. */
export function localDate(iso: string): string {
  return new Date(toMs(iso) + IST_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}

/** "05:00" becomes 5. */
export function hourOfDay(hhmm: string): number {
  const hour = Number(hhmm.split(':')[0]);
  if (!Number.isInteger(hour)) throw new RangeError(`Invalid time of day: ${hhmm}`);
  return hour;
}

/** "3 pm" in India time, with a no-break space so a time never wraps in the middle. */
export function formatHour(iso: string): string {
  const hour = localHour(iso);
  const suffix = hour >= 12 ? 'pm' : 'am';
  return `${hour % 12 === 0 ? 12 : hour % 12}\u00a0${suffix}`;
}
