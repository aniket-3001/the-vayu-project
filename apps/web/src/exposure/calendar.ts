/** An India calendar date, "2026-10-10". */
type DateKey = string;

/** 0 is Sunday, 6 is Saturday, for an India calendar date. */
export const weekdayOf = (date: DateKey): number => new Date(`${date}T12:00:00+05:30`).getUTCDay();

/** Monday to Friday: when school and work usually run. */
export const WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5];

/** Monday first, the way a week is read here. */
export const DAY_ORDER: readonly number[] = [1, 2, 3, 4, 5, 6, 0];
export const DAY_INITIALS: Readonly<Record<number, string>> = {
  0: 'S',
  1: 'M',
  2: 'T',
  3: 'W',
  4: 'T',
  5: 'F',
  6: 'S',
};
export const DAY_NAMES: Readonly<Record<number, string>> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

/**
 * Public holidays when schools and offices are shut. Only the fixed national ones and the big festivals for
 * the year the sample covers, not a full calendar.
 */
export const PUBLIC_HOLIDAYS: ReadonlySet<DateKey> = new Set([
  '2026-01-26', // Republic Day
  '2026-08-15', // Independence Day
  '2026-10-02', // Gandhi Jayanti
  '2026-10-20', // Dussehra
  '2026-11-08', // Diwali
]);

export const isHoliday = (date: DateKey): boolean => PUBLIC_HOLIDAYS.has(date);
