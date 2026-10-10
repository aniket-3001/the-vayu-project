import type { HourPoint } from '@vayu/contracts';
import { HOUR_MS, toMs } from './time';

/** The mean PM2.5 over `lengthHours` consecutive hours from `startIso`, or `null` if any hour is missing. */
export function windowMean(
  hours: readonly HourPoint[],
  startIso: string,
  lengthHours = 1,
): number | null {
  const byStart = new Map(hours.map((hour) => [toMs(hour.hourStart), hour.pm25]));
  const start = toMs(startIso);
  let total = 0;
  for (let offset = 0; offset < lengthHours; offset++) {
    const value = byStart.get(start + offset * HOUR_MS);
    if (value === undefined || value === null) return null;
    total += value;
  }
  return total / lengthHours;
}

export interface ExposureAvoided {
  readonly usualMean: number;
  readonly chosenMean: number;
  /** Positive when the chosen hour is cleaner. Never above 100. */
  readonly avoidedPct: number;
  /** The difference in µg·h/m³ over the window. */
  readonly avoidedMicrogramHours: number;
}

/** What moving an activity from the usual hour to the chosen hour saves, from the same day's series. */
export function exposureAvoided(
  hours: readonly HourPoint[],
  usualStartIso: string,
  chosenStartIso: string,
  lengthHours = 1,
): ExposureAvoided | null {
  const usual = windowMean(hours, usualStartIso, lengthHours);
  const chosen = windowMean(hours, chosenStartIso, lengthHours);
  if (usual === null || chosen === null || usual <= 0) return null;
  return {
    usualMean: usual,
    chosenMean: chosen,
    avoidedPct: Math.min(100, ((usual - chosen) / usual) * 100),
    avoidedMicrogramHours: (usual - chosen) * lengthHours,
  };
}

/** A long-term rule of thumb: about 22 µg/m³ averaged over a day is one cigarette. Never a headline. */
export const cigaretteRule = (meanPm25: number, hours: number): number =>
  (meanPm25 / 22) * (hours / 24);
