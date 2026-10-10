import { rules, type Band, type Rules } from '@vayu/contracts';

export type Pollutant = 'pm25' | 'pm10';

const BAND_ORDER: readonly Band[] = [
  'good',
  'satisfactory',
  'moderate',
  'poor',
  'very_poor',
  'severe',
];

export const bandRank = (band: Band): number => BAND_ORDER.indexOf(band);
export const worseBand = (a: Band, b: Band): Band => (bandRank(a) >= bandRank(b) ? a : b);
export const bandAtMost = (band: Band, limit: Band): boolean => bandRank(band) <= bandRank(limit);

type BreakpointRow = Rules['cpcb']['pm25'][number];

function breakpointRow(pollutant: Pollutant, concentration: number): BreakpointRow {
  const table = rules.cpcb[pollutant];
  const row = table.find((candidate) => concentration < candidate.bpHi) ?? table.at(-1);
  if (row === undefined) throw new Error(`No breakpoints configured for ${pollutant}`);
  return row;
}

/**
 * The CPCB sub-index by linear interpolation:
 * `I = (Ihi - Ilo) / (BPhi - BPlo) * (C - BPlo) + Ilo`, capped at the top of the scale.
 */
export function subIndex(pollutant: Pollutant, concentration: number): number {
  if (!Number.isFinite(concentration) || concentration < 0) {
    throw new RangeError(`Concentration must be a non-negative number, got ${concentration}`);
  }
  const row = breakpointRow(pollutant, concentration);
  const capped = Math.min(concentration, row.bpHi);
  return ((row.iHi - row.iLo) / (row.bpHi - row.bpLo)) * (capped - row.bpLo) + row.iLo;
}

/**
 * The inverse of `subIndex`: the concentration (µg/m³) at which the CPCB sub-index equals `aqi`.
 * Used to say what "the level where GRAP Stage IV is ordered" means in PM2.5. Throws outside 0 to 500.
 */
export function concentrationForAqi(pollutant: Pollutant, aqi: number): number {
  if (!Number.isFinite(aqi) || aqi < 0 || aqi > 500) {
    throw new RangeError(`AQI must be between 0 and 500, got ${aqi}`);
  }
  const table = rules.cpcb[pollutant];
  const row = table.find((candidate) => aqi <= candidate.iHi) ?? table.at(-1);
  if (row === undefined) throw new Error(`No breakpoints configured for ${pollutant}`);
  return ((aqi - row.iLo) / (row.iHi - row.iLo)) * (row.bpHi - row.bpLo) + row.bpLo;
}

/** The colour band of one concentration. Used for the hourly timeline ("hourly, CPCB bands"). */
export function bandFromConcentration(pollutant: Pollutant, concentration: number): Band {
  return breakpointRow(pollutant, concentration).band;
}

export function bandFromAqi(aqi: number): Band {
  if (aqi <= 50) return 'good';
  if (aqi <= 100) return 'satisfactory';
  if (aqi <= 200) return 'moderate';
  if (aqi <= 300) return 'poor';
  if (aqi <= 400) return 'very_poor';
  return 'severe';
}

export interface Aqi24h {
  readonly aqi: number;
  readonly band: Band;
  readonly driver: Pollutant;
  readonly validHours: { readonly pm25: number; readonly pm10: number };
}

const present = (values: readonly (number | null)[]): number[] =>
  values.filter((value): value is number => value !== null && Number.isFinite(value));

const average = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * The 24-hour AQI from the last 24 hourly values. CPCB needs at least 16 valid hours per
 * pollutant; with fewer the answer is `null` ("not enough data"), never a guess. Uses PM2.5
 * and PM10 only.
 */
export function aqi24h(
  pm25: readonly (number | null)[],
  pm10: readonly (number | null)[],
  minValidHours: number = rules.cpcb.minValidHours,
): Aqi24h | null {
  const valid25 = present(pm25);
  const valid10 = present(pm10);
  const candidates: { driver: Pollutant; index: number }[] = [];
  if (valid25.length >= minValidHours) {
    candidates.push({ driver: 'pm25', index: subIndex('pm25', average(valid25)) });
  }
  if (valid10.length >= minValidHours) {
    candidates.push({ driver: 'pm10', index: subIndex('pm10', average(valid10)) });
  }
  const worst = candidates.reduce<(typeof candidates)[number] | undefined>(
    (top, candidate) => (top === undefined || candidate.index > top.index ? candidate : top),
    undefined,
  );
  if (worst === undefined) return null;
  return {
    aqi: worst.index,
    band: bandFromAqi(worst.index),
    driver: worst.driver,
    validHours: { pm25: valid25.length, pm10: valid10.length },
  };
}
