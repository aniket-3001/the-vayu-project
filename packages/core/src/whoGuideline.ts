/** WHO Global Air Quality Guidelines (2021): PM2.5, 24-hour mean, in µg/m³. Not an index. */
export const WHO_PM25_24H_GUIDELINE = 15;

export interface WhoComparison {
  /** The 24-hour mean that was compared. */
  readonly mean: number;
  readonly guideline: number;
  /** How many times the guideline the mean is (1 means exactly at it). */
  readonly times: number;
  readonly within: boolean;
}

/**
 * Compares a 24-hour mean PM2.5 with the WHO 24-hour guideline. WHO publishes limit values, not an
 * AQI, so the honest answer is "within it" or "this many times over it". The guideline is for a
 * 24-hour mean, so never pass a single hour here.
 */
export function compareWithWhoGuideline(mean24h: number): WhoComparison | undefined {
  if (!Number.isFinite(mean24h) || mean24h < 0) return undefined;
  return {
    mean: mean24h,
    guideline: WHO_PM25_24H_GUIDELINE,
    times: mean24h / WHO_PM25_24H_GUIDELINE,
    within: mean24h <= WHO_PM25_24H_GUIDELINE,
  };
}
