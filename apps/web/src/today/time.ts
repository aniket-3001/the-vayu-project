const IST_MINUTES = 330;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** An ISO instant, shifted to India time, read back as UTC fields. */
const india = (iso: string): Date => new Date(Date.parse(iso) + IST_MINUTES * 60_000);

/** "09:30", India time, 24-hour, as IQAir shows it. */
export function clock24(iso: string): string {
  return india(iso).toISOString().slice(11, 16);
}

/** The hour of the day in India time, 0 to 23.99. */
export function hourOfDay(iso: string): number {
  const d = india(iso);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
}

/** "Sat", "Sun"… for a day, India time. */
export function weekday(iso: string): string {
  return DAYS[india(iso).getUTCDay()] ?? '';
}

/** "10 Oct", India time. */
export function dayMonth(iso: string): string {
  const d = india(iso);
  return `${String(d.getUTCDate())} ${MONTHS[d.getUTCMonth()] ?? ''}`;
}

/** The India calendar date, "2026-10-10", for telling when a new day starts. */
export function isoDate(iso: string): string {
  return india(iso).toISOString().slice(0, 10);
}

/** Midnight at the start of the India day containing `iso`, as an ISO instant. */
export function startOfDay(iso: string): string {
  const d = india(iso);
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() - IST_MINUTES * 60_000).toISOString();
}

/** Minutes between two instants, rounded. */
export const minutesBetween = (from: string, to: string): number =>
  Math.round((Date.parse(to) - Date.parse(from)) / 60_000);
