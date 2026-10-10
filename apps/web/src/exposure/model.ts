import { compareWithWhoGuideline, usAqi } from '@vayu/core';
import type { Device } from '../devices/devices';
import { sampleIndoorPm25 } from '../devices/devices';
import { pinId, type Pin } from '../data/pins';
import { levelForAqi, type Level } from '../design/levels';
import { readingForPin } from '../places/placeSample';
import { SAMPLE_AS_OF } from '../today/sample';
import { hourOfDay, isoDate } from '../today/time';
import { INDOOR_SHARE, TREE_SHARE } from './assumptions';
import { SPOT_KINDS, isThere, type Spot, type SpotKind, type Spots } from './spots';

export type Day = 'today' | 'yesterday';

/** Where a person was in an hour: one of their set places, or somewhere their live location put them. */
export type Where = SpotKind | 'live';

export type Source =
  /** Open air from the nearest monitor. */
  | 'outdoor'
  /** Open air, scaled for trees: assumed. */
  | 'trees'
  /** Indoor, scaled by the indoor assumption. */
  | 'assumed'
  /** Indoor, from a Vayu monitor in that place (sample until the device exists). */
  | 'device';

export interface Cell {
  readonly hour: number;
  readonly where: Where;
  readonly pm25: number;
  readonly aqi: number;
  readonly source: Source;
}

/** Rings, from the outside in. The order is also the order they are listed on screen. */
export const RINGS: readonly Where[] = ['home', 'work', 'school', 'outdoor', 'live'];

/** When two places claim the same hour, the first of these wins in the day's total. */
export const PRIORITY: readonly Where[] = ['live', 'outdoor', 'work', 'school', 'home'];

/** Hours of this day (0 to 23) that have already happened, at the sample moment. */
export function hoursSoFar(day: Day): number {
  return day === 'yesterday' ? 24 : Math.floor(hourOfDay(SAMPLE_AS_OF));
}

/** Open-air PM2.5 for each hour of a day at a place; `undefined` for hours that have not happened. */
export function ambientByHour(pin: Pin, day: Day): readonly (number | undefined)[] {
  const history = readingForPin(pin).history;
  const key = isoDate(
    day === 'today' ? SAMPLE_AS_OF : new Date(Date.parse(SAMPLE_AS_OF) - 86_400_000).toISOString(),
  );
  const hours: (number | undefined)[] = Array.from({ length: 24 }, () => undefined);
  for (const point of history) {
    if (isoDate(point.at) === key) hours[Math.floor(hourOfDay(point.at))] = point.pm25;
  }
  return hours;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

/** What a person breathes at a set place, given the open-air figure, any monitor there, and the assumptions. */
export function breathed(
  kind: SpotKind,
  spot: Spot,
  ambient: number,
  devices: readonly Device[],
): { readonly pm25: number; readonly source: Source } {
  if (kind === 'outdoor') {
    return spot.trees === true
      ? { pm25: round1(ambient * TREE_SHARE), source: 'trees' }
      : { pm25: ambient, source: 'outdoor' };
  }
  if (devices.some((device) => device.where === kind)) {
    return { pm25: sampleIndoorPm25(ambient), source: 'device' };
  }
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

const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(h));
};

/** How close a live fix must be to a set place to count as being in it. */
export const AT_PLACE_KM = 0.3;

/** The set place a fix is in, if any. */
export function placeOfFix(
  fix: { readonly lat: number; readonly lng: number },
  spots: Spots,
): SpotKind | undefined {
  let best: { kind: SpotKind; distance: number } | undefined;
  for (const kind of SPOT_KINDS) {
    const spot = spots[kind];
    if (spot === undefined) continue;
    const distance = km(fix, spot.pin);
    if (distance <= AT_PLACE_KM && (best === undefined || distance < best.distance))
      best = { kind, distance };
  }
  return best?.kind;
}

/**
 * A day, hour by hour, for every ring. A set place has a cell for each hour in its window that has
 * happened; the live ring has a cell for each hour with a fix. Hours with nothing are left out.
 */
export function dayCells(
  spots: Spots,
  devices: readonly Device[],
  live: LiveLog,
  day: Day,
): readonly Cell[] {
  const cells: Cell[] = [];
  const upTo = hoursSoFar(day);
  for (const kind of SPOT_KINDS) {
    const spot = spots[kind];
    if (spot === undefined) continue;
    const ambient = ambientByHour(spot.pin, day);
    for (let hour = 0; hour < upTo; hour++) {
      const open = ambient[hour];
      if (open === undefined || !isThere(spot, hour)) continue;
      const { pm25, source } = breathed(kind, spot, open, devices);
      cells.push(cellOf(hour, kind, pm25, source));
    }
  }
  if (day === 'today') {
    for (const [key, fix] of Object.entries(live)) {
      const hour = Number(key);
      // A fix can come from the hour in progress, which the schedule leaves out.
      if (hour > upTo) continue;
      const here = placeOfFix(fix, spots);
      const spot = here === undefined ? undefined : spots[here];
      const pin: Pin = spot?.pin ?? {
        id: pinId(fix.lat, fix.lng),
        name: 'Here',
        lat: fix.lat,
        lng: fix.lng,
      };
      const open = ambientByHour(pin, day)[hour];
      if (open === undefined) continue;
      const got =
        here !== undefined && spot !== undefined
          ? breathed(here, spot, open, devices)
          : { pm25: open, source: 'outdoor' as const };
      cells.push(cellOf(hour, 'live', got.pm25, got.source));
    }
  }
  return cells;
}

/** The one cell that counts for each hour in the day's total, by priority. */
export function countedCells(cells: readonly Cell[]): readonly Cell[] {
  const counted: Cell[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const here = cells.filter((cell) => cell.hour === hour);
    for (const where of PRIORITY) {
      const found = here.find((cell) => cell.where === where);
      if (found !== undefined) {
        counted.push(found);
        break;
      }
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
    const i = [
      'Good',
      'Moderate',
      'Unhealthy for sensitive groups',
      'Unhealthy',
      'Very unhealthy',
      'Hazardous',
    ].indexOf(levelForAqi(cell.aqi).name);
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
  day: Day,
): readonly number[] {
  const out: number[] = [];
  for (const cell of counted) {
    let pin: Pin | undefined;
    if (cell.where === 'live') {
      const fix = live[String(cell.hour)];
      if (fix !== undefined)
        pin = spots[placeOfFix(fix, spots) ?? 'outdoor']?.pin ?? {
          id: pinId(fix.lat, fix.lng),
          name: 'Here',
          lat: fix.lat,
          lng: fix.lng,
        };
    } else {
      pin = spots[cell.where]?.pin;
    }
    const open = pin === undefined ? undefined : ambientByHour(pin, day)[cell.hour];
    if (open !== undefined) out.push(open);
  }
  return out;
}
