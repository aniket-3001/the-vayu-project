import { compareWithWhoGuideline, usAqi } from '@vayu/core';
import { pinId, type Pin } from '../data/pins';
import { sampleIndoorPm25 } from '../devices/devices';
import { levelForAqi, type Level } from '../design/levels';
import { airStore } from '../air/store';
import { nowIso, todayKey } from '../clock';
import { dayMonth, hourOfDay, isoDate, weekday } from '../today/time';
import { INDOOR_SHARE, TREE_SHARE } from './assumptions';
import { AT_PLACE_KM, distanceKm } from './geo';
import type { Outing } from './outings';
import { SPOT_KINDS, isThere, runsOn, type Spot, type SpotKind, type Spots } from './spots';
import { unitNear, type Unit } from './units';

/** An India calendar date, "2026-10-10". */
export type DateKey = string;

/** Where a person was in an hour: one of their set places, or somewhere their live location put them. */
export type Where = SpotKind | 'live';

export type Source =
  /** Open air from the nearest monitor. */
  | 'outdoor'
  /** Open air, scaled for trees: assumed. */
  | 'trees'
  /** Indoors, scaled by the indoor assumption. */
  | 'assumed'
  /** Indoors, from a Vayu monitor the person added. */
  | 'device'
  /** Indoors, from a Vayu unit someone else put there, picked up automatically. */
  | 'unit';

export interface Cell {
  /** For a cell from the phone's location: the set place it was in, or outdoors if it was in none. */
  readonly at?: SpotKind;
  readonly hour: number;
  readonly where: Where;
  readonly pm25: number;
  readonly aqi: number;
  readonly source: Source;
  /** Outdoor cells: where it was, and how much of the hour was spent outside (0 to 1). */
  readonly pin?: Pin;
  readonly share?: number;
}

/** Rings, from the outside in. */
export const RINGS: readonly Where[] = ['home', 'work', 'school', 'outdoor', 'live'];

/**
 * When two places claim the same hour, the first of these wins in the day's total. What a person logged outdoors
 * comes first, since they said it themselves and the phone may have been left behind; then where the phone was;
 * then the timetable, and home for whatever is left.
 */
export const PRIORITY: readonly Where[] = ['outdoor', 'live', 'work', 'school', 'home'];

// Dates

/** Today's India calendar date, from the app's clock. */
export const today = (): DateKey => todayKey();

/** The date `n` days from `date`, negative for earlier. */
export const addDays = (date: DateKey, n: number): DateKey =>
  isoDate(new Date(Date.parse(`${date}T12:00:00+05:30`) + n * 86_400_000).toISOString());

export const yesterday = (): DateKey => addDays(today(), -1);

/** How many days back we look: the two weeks before today. */
export const HISTORY_DAYS = 14;
/** The earliest date we look for air on. */
export const earliest = (): DateKey => addDays(today(), -HISTORY_DAYS);

/** Whether a date is inside the two weeks we look back over. Whether there is air for it is up to the place. */
export const hasData = (date: DateKey): boolean => date >= earliest() && date <= today();

/** The seven days before today, oldest first. */
export const lastWeek = (): readonly DateKey[] =>
  Array.from({ length: 7 }, (_, i) => addDays(today(), i - 7));

/** "Sat 4 Oct". */
export function formatDate(date: DateKey): string {
  const at = new Date(Date.parse(`${date}T12:00:00+05:30`)).toISOString();
  return `${weekday(at)} ${dayMonth(at)}`;
}

/** Hours of a date (0 to 23) that have finished: 24 for past days, those so far for today, 0 for the rest. */
export function hoursSoFar(date: DateKey): number {
  if (date === today()) return Math.floor(hourOfDay(nowIso()));
  return hasData(date) ? 24 : 0;
}

/**
 * Hours of a date that count: those that have finished and, for today, the hour in progress, so a place set at
 * ten past midnight has its first hour straight away.
 */
export function hoursCounted(date: DateKey): number {
  return date === today() ? Math.min(24, hoursSoFar(date) + 1) : hoursSoFar(date);
}

/** Open-air PM2.5 for each hour of a date at a place; `undefined` where we have no finished reading. */
export function ambientByHour(pin: Pin, date: DateKey): readonly (number | undefined)[] {
  return hasData(date)
    ? airStore().ambient(pin, date)
    : Array.from({ length: 24 }, () => undefined);
}

// What a person breathes

const round1 = (value: number): number => Math.round(value * 10) / 10;

/**
 * The open-air figure for one hour. The hour in progress has no finished reading yet, so it takes the hour
 * before it, or the last hour of the day before, or the reading from right now.
 */
export function openAt(pin: Pin, date: DateKey, hour: number): number | undefined {
  const own = ambientByHour(pin, date)[hour];
  if (own !== undefined || date !== today() || hour !== hoursSoFar(date)) return own;
  const before =
    hour > 0 ? ambientByHour(pin, date)[hour - 1] : ambientByHour(pin, addDays(date, -1))[23];
  if (before !== undefined) return before;
  const now = airStore().today(pin);
  return now.status === 'ready' ? now.data.pm25 : undefined;
}

/** What a person breathes at a set place, given the open-air figure, any unit there, and the assumptions. */
export function breathed(
  spot: Spot,
  ambient: number,
  units: readonly Unit[],
): { readonly pm25: number; readonly source: Source } {
  const unit = unitNear(spot.pin, units);
  if (unit !== undefined)
    return { pm25: sampleIndoorPm25(ambient), source: unit.own ? 'device' : 'unit' };
  return { pm25: round1(ambient * INDOOR_SHARE), source: 'assumed' };
}

const cellOf = (hour: number, where: Where, pm25: number, source: Source): Cell => ({
  hour,
  where,
  pm25,
  aqi: usAqi(pm25)?.value ?? 0,
  source,
});

/** A person's logged fixes from live location: for each hour, where they were. */
export type LiveLog = Readonly<Record<string, { readonly lat: number; readonly lng: number }>>;

export { AT_PLACE_KM };

/**
 * How far from a set place a fix must be to count as somewhere else. A phone's coarse fix can be a kilometre
 * out, and a person at home should not be shown as outdoors for that.
 */
export const AWAY_KM = 1;

/** The set place a fix is in, if any. */
export function placeOfFix(
  fix: { readonly lat: number; readonly lng: number },
  spots: Spots,
): SpotKind | undefined {
  let best: { kind: SpotKind; distance: number } | undefined;
  for (const kind of SPOT_KINDS) {
    const spot = spots[kind];
    if (spot === undefined) continue;
    const distance = distanceKm(fix, spot.pin);
    if (distance <= AWAY_KM && (best === undefined || distance < best.distance))
      best = { kind, distance };
  }
  return best?.kind;
}

/**
 * A day, hour by hour, for every ring. Home is every hour; school and work are the hours in their window on
 * the days they run, so a weekend or a holiday is all home. Outdoor cells come from logged outings: an hour
 * the person spent partly outside counts the outside part. The live ring has a cell for each hour with a fix,
 * today only. A unit near a place, or near a live fix, is used automatically, whoever put it there.
 */
export function dayCells(
  spots: Spots,
  units: readonly Unit[],
  live: LiveLog,
  date: DateKey,
  outings: readonly Outing[] = [],
): readonly Cell[] {
  const cells: Cell[] = [];
  const upTo = hoursCounted(date);
  for (const kind of SPOT_KINDS) {
    const spot = spots[kind];
    if (spot === undefined || kind === 'outdoor' || !runsOn(kind, spot, date)) continue;
    for (let hour = 0; hour < upTo; hour++) {
      const open = openAt(spot.pin, date, hour);
      if (open === undefined || (kind !== 'home' && !isThere(spot, hour))) continue;
      const { pm25, source } = breathed(spot, open, units);
      cells.push(cellOf(hour, kind, pm25, source));
    }
  }
  cells.push(...outdoorCells(outings, date, upTo));
  if (date === today()) {
    for (const [key, fix] of Object.entries(live)) {
      const hour = Number(key);
      if (hour >= upTo) continue;
      const here = placeOfFix(fix, spots);
      const spot = here === undefined ? undefined : spots[here];
      const pin: Pin = spot?.pin ?? {
        id: pinId(fix.lat, fix.lng),
        name: 'Here',
        lat: fix.lat,
        lng: fix.lng,
      };
      const open = openAt(pin, date, hour);
      if (open === undefined) continue;
      const near = unitNear(fix, units);
      let got: { pm25: number; source: Source };
      if (here !== undefined && spot !== undefined) got = breathed(spot, open, units);
      else if (near !== undefined)
        got = { pm25: sampleIndoorPm25(open), source: near.own ? 'device' : 'unit' };
      else got = { pm25: open, source: 'outdoor' };
      cells.push({ ...cellOf(hour, 'live', got.pm25, got.source), at: here ?? 'outdoor' });
    }
  }
  return cells;
}

/** The outdoor cells for a date: one for each hour an outing touches that has finished, weighted by minutes. */
export function outdoorCells(
  outings: readonly Outing[],
  date: DateKey,
  upTo: number,
): readonly Cell[] {
  const byHour = new Map<number, { share: number; weighted: number; pin: Pin; trees: boolean }>();
  for (const outing of outings) {
    if (outing.date !== date) continue;
    const end = outing.start + outing.minutes;
    for (let hour = Math.floor(outing.start / 60); hour * 60 < end && hour < upTo; hour++) {
      const minutes = Math.min(end, hour * 60 + 60) - Math.max(outing.start, hour * 60);
      const open = openAt(outing.pin, date, hour);
      if (minutes <= 0 || open === undefined) continue;
      const pm = outing.trees ? open * TREE_SHARE : open;
      const share = minutes / 60;
      const now = byHour.get(hour);
      byHour.set(hour, {
        share: (now?.share ?? 0) + share,
        weighted: (now?.weighted ?? 0) + pm * share,
        pin: now?.pin ?? outing.pin,
        trees: (now?.trees ?? false) || outing.trees,
      });
    }
  }
  return [...byHour.entries()].map(([hour, got]) => ({
    ...cellOf(hour, 'outdoor', round1(got.weighted / got.share), got.trees ? 'trees' : 'outdoor'),
    pin: got.pin,
    share: Math.min(1, got.share),
  }));
}

/**
 * The one cell that counts for each hour in the day's total, by priority. An hour only partly spent outside
 * counts the outside part at the outside air and the rest at wherever else the person was.
 */
export function countedCells(cells: readonly Cell[]): readonly Cell[] {
  const counted: Cell[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const here = cells.filter((cell) => cell.hour === hour);
    for (const where of PRIORITY) {
      const found = here.find((cell) => cell.where === where);
      if (found === undefined) continue;
      const share = found.share ?? 1;
      if (where === 'outdoor' && share < 1) {
        const restWhere = PRIORITY.find(
          (w) => w !== 'outdoor' && here.some((cell) => cell.where === w),
        );
        const rest = here.find((cell) => cell.where === restWhere);
        if (rest !== undefined) {
          const pm25 = round1(found.pm25 * share + rest.pm25 * (1 - share));
          counted.push({ ...found, pm25, aqi: usAqi(pm25)?.value ?? 0 });
          break;
        }
      }
      counted.push(found);
      break;
    }
  }
  return counted;
}

export interface Summary {
  /** Hours with a reading. */
  readonly hours: number;
  readonly meanPm25: number;
  readonly aqi: number;
  readonly level: Level;
  /** The mean had the person spent the same hours in open air where each place is. */
  readonly openAirPm25: number;
  readonly openAirAqi: number;
  /** How many times the WHO 24-hour guideline; only meaningful over a full day. */
  readonly whoTimes: number;
  readonly fullDay: boolean;
  /** Hours counted in each level, indexed like LEVELS. */
  readonly hoursByLevel: readonly number[];
}

const LEVEL_NAMES = [
  'Good',
  'Moderate',
  'Unhealthy for sensitive groups',
  'Unhealthy',
  'Very unhealthy',
  'Hazardous',
];

export function summarise(
  counted: readonly Cell[],
  openAir: readonly number[],
): Summary | undefined {
  if (counted.length === 0) return undefined;
  const mean = counted.reduce((sum, cell) => sum + cell.pm25, 0) / counted.length;
  const outside = openAir.length === 0 ? mean : openAir.reduce((a, b) => a + b, 0) / openAir.length;
  const aqi = usAqi(mean)?.value ?? 0;
  const hoursByLevel = [0, 0, 0, 0, 0, 0];
  for (const cell of counted) {
    const i = LEVEL_NAMES.indexOf(levelForAqi(cell.aqi).name);
    hoursByLevel[i] = (hoursByLevel[i] ?? 0) + 1;
  }
  return {
    hours: counted.length,
    meanPm25: round1(mean),
    aqi,
    level: levelForAqi(aqi),
    openAirPm25: round1(outside),
    openAirAqi: usAqi(outside)?.value ?? 0,
    whoTimes: compareWithWhoGuideline(mean)?.times ?? 0,
    fullDay: counted.length >= 24,
    hoursByLevel,
  };
}

/** Open-air PM2.5 at the place each counted hour was spent: what the same hours would have been outdoors. */
export function openAirFor(
  counted: readonly Cell[],
  spots: Spots,
  live: LiveLog,
  date: DateKey,
): readonly number[] {
  const out: number[] = [];
  for (const cell of counted) {
    let pin: Pin | undefined;
    if (cell.where === 'live') {
      const fix = live[String(cell.hour)];
      if (fix !== undefined) {
        pin = spots[placeOfFix(fix, spots) ?? 'outdoor']?.pin ?? {
          id: pinId(fix.lat, fix.lng),
          name: 'Here',
          lat: fix.lat,
          lng: fix.lng,
        };
      }
    } else {
      pin = cell.pin ?? spots[cell.where]?.pin;
    }
    const open = pin === undefined ? undefined : openAt(pin, date, cell.hour);
    if (open !== undefined) out.push(open);
  }
  return out;
}

/** One date, start to finish: the cells, what counts, and the sum. */
export function daySummary(
  spots: Spots,
  units: readonly Unit[],
  live: LiveLog,
  date: DateKey,
  outings: readonly Outing[] = [],
): Summary | undefined {
  const counted = countedCells(dayCells(spots, units, live, date, outings));
  return summarise(counted, openAirFor(counted, spots, live, date));
}
