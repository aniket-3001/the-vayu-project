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

const twelve = (hour: number): string => String(hour % 12 === 0 ? 12 : hour % 12);
const meridiem = (hour: number): string => (hour % 24 < 12 ? 'am' : 'pm');

/** "4 pm", "12 am", or "4:30 pm" when there are minutes: an hour of the day (0 to 23) as a person says it. */
export function hourName(hour: number, minutes = 0): string {
  const h = ((hour % 24) + 24) % 24;
  const m = minutes === 0 ? '' : `:${String(minutes).padStart(2, '0')}`;
  return `${twelve(h)}${m} ${meridiem(h)}`;
}

/** "4–5 pm", or "11 am–12 pm" when the hour crosses noon or midnight. */
export function hourRange(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const end = (h + 1) % 24;
  return meridiem(h) === meridiem(end)
    ? `${twelve(h)}–${twelve(end)} ${meridiem(end)}`
    : `${twelve(h)} ${meridiem(h)}–${twelve(end)} ${meridiem(end)}`;
}

/** "4 pm", India time, 12-hour, with minutes only when there are some. */
export function clock12(iso: string): string {
  const d = india(iso);
  return hourName(d.getUTCHours(), d.getUTCMinutes());
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
