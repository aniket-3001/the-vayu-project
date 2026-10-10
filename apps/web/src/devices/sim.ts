import { usAqi } from '@vayu/core';
import { SAMPLE_INDOOR_SHARE, type DeviceMode } from './devices';

/** With nothing running, this share of the outdoor PM2.5 gets indoors. An assumption, the same one the exposure model uses. */
export const LEAKY_SHARE = 0.6;
/** How far the room moves toward where it is heading in an hour. Made up for the sample, to be replaced by readings. */
const PACE = 0.65;
/** The maker's claim for the filter, in hours (DEVICE.md). Not yet tested by us. */
export const FILTER_HOURS = 3000;
/** How long the sample filter has already run before today. Made up. */
export const SAMPLE_FILTER_HOURS_BEFORE = 410;

export interface DeviceHour {
  readonly hour: number;
  readonly outdoor: number;
  readonly indoor: number;
  readonly fan: boolean;
}

/**
 * A made-up day for a monitor and the cleaner beside it, from the outside air hour by hour. The room drifts
 * toward a share of the outside air: a big share with the cleaner off, a small one with it on. Auto switches
 * the cleaner on above a level and off again well below it, so it does not flick on and off. It is a sample
 * until the real device sends readings, and every screen that shows it says so.
 */
export function simulateDay(
  outdoor: readonly number[],
  mode: DeviceMode,
  autoAbove: number,
): readonly DeviceHour[] {
  const hours: DeviceHour[] = [];
  let indoor = (outdoor[0] ?? 0) * LEAKY_SHARE;
  let fan = false;
  outdoor.forEach((out, hour) => {
    if (mode === 'on') fan = true;
    else if (mode === 'off') fan = false;
    else fan = fan ? indoor > autoAbove * 0.7 : indoor > autoAbove;
    const heading = out * (fan ? SAMPLE_INDOOR_SHARE : LEAKY_SHARE);
    indoor += (heading - indoor) * PACE;
    hours.push({ hour, outdoor: out, indoor: Math.round(indoor * 10) / 10, fan });
  });
  return hours;
}

export interface DeviceStats {
  readonly fanHours: number;
  readonly meanIndoor: number;
  readonly meanOutdoor: number;
  /** The share of the hours so far in which the room's air was Good (AQI 50 or less). */
  readonly goodShare: number;
  /** The first hour the cleaner came on, and what the room's PM2.5 did over the three hours after. */
  readonly firstOn?: { readonly hour: number; readonly from: number; readonly to: number };
  /** Filter life left, from the sample hours run. */
  readonly filterLeftPct: number;
}

const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;

export function statsFor(hours: readonly DeviceHour[]): DeviceStats {
  const fanHours = hours.filter((h) => h.fan).length;
  const good = hours.filter((h) => (usAqi(h.indoor)?.value ?? 0) <= 50).length;
  const on = hours.find((h) => h.fan);
  const after = on === undefined ? undefined : hours[Math.min(hours.length - 1, on.hour + 3)];
  const run = SAMPLE_FILTER_HOURS_BEFORE + fanHours;
  return {
    fanHours,
    meanIndoor: mean(hours.map((h) => h.indoor)),
    meanOutdoor: mean(hours.map((h) => h.outdoor)),
    goodShare: hours.length === 0 ? 0 : good / hours.length,
    ...(on === undefined || after === undefined
      ? {}
      : { firstOn: { hour: on.hour, from: on.indoor, to: after.indoor } }),
    filterLeftPct: Math.max(0, Math.round(100 - (run / FILTER_HOURS) * 100)),
  };
}
