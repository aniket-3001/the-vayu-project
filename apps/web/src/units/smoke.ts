import { maxPm25ForUsAqi } from '@vayu/core';

/**
 * A rule of thumb from Berkeley Earth: breathing 22 µg/m³ of PM2.5 for a day is about the same as smoking
 * one cigarette. It is a way to make a number feel real, not a medical measure, and the screen says so.
 */
export const PM25_PER_CIGARETTE = 22;

export const cigarettesPerDay = (pm25: number): number =>
  Math.max(0, Math.round((pm25 / PM25_PER_CIGARETTE) * 10) / 10);

/** From an AQI, for places that only have the AQI to hand. */
export const cigarettesForAqi = (aqi: number): number => cigarettesPerDay(maxPm25ForUsAqi(aqi));

/** "about 3 cigarettes a day", "less than half a cigarette a day". */
export function describeCigarettes(perDay: number): string {
  if (perDay < 0.5) return 'less than half a cigarette a day';
  const shown = perDay >= 10 ? String(Math.round(perDay)) : String(Math.round(perDay * 10) / 10);
  return `about ${shown} ${shown === '1' ? 'cigarette' : 'cigarettes'} a day`;
}

export const SMOKE_CAVEAT =
  'A rule of thumb: 22 µg/m³ of PM2.5 over a day is about one cigarette (Berkeley Earth). It makes the number easier to feel. It is not a medical measure.';
