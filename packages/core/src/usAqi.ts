export interface UsAqi {
  readonly value: number;
  readonly category: string;
  /** 0 (Good) to 5 (Hazardous), for choosing a colour and a glyph. */
  readonly level: number;
}

/** US EPA PM2.5 breakpoints (the 2024 revision): concentration range, AQI range, category. */
const BREAKPOINTS = [
  { cLow: 0, cHigh: 9, iLow: 0, iHigh: 50, category: 'Good' },
  { cLow: 9.1, cHigh: 35.4, iLow: 51, iHigh: 100, category: 'Moderate' },
  { cLow: 35.5, cHigh: 55.4, iLow: 101, iHigh: 150, category: 'Unhealthy for Sensitive Groups' },
  { cLow: 55.5, cHigh: 125.4, iLow: 151, iHigh: 200, category: 'Unhealthy' },
  { cLow: 125.5, cHigh: 225.4, iLow: 201, iHigh: 300, category: 'Very Unhealthy' },
  { cLow: 225.5, cHigh: 325.4, iLow: 301, iHigh: 500, category: 'Hazardous' },
] as const;

/**
 * The US AQI for a PM2.5 concentration in µg/m³. This is the scale IQAir shows; it is a different
 * scale from India's CPCB bands. The AQI on a card is this one; the CPCB scale is used for the GRAP stage, which the alert says. The EPA truncates the
 * concentration to one decimal before looking it up.
 */
export function usAqi(pm25: number): UsAqi | undefined {
  if (!Number.isFinite(pm25) || pm25 < 0) return undefined;
  const c = Math.floor(pm25 * 10 + 1e-9) / 10;
  const last = BREAKPOINTS[BREAKPOINTS.length - 1];
  if (last !== undefined && c > last.cHigh)
    return { value: 500, category: last.category, level: BREAKPOINTS.length - 1 };
  const row =
    BREAKPOINTS.find((bp) => c >= bp.cLow && c <= bp.cHigh) ??
    BREAKPOINTS.find((bp) => c < bp.cLow);
  if (row === undefined) return undefined;
  const value = Math.round(
    ((row.iHigh - row.iLow) / (row.cHigh - row.cLow)) * (c - row.cLow) + row.iLow,
  );
  return { value, category: row.category, level: BREAKPOINTS.indexOf(row) };
}

/** The highest PM2.5 (µg/m³, to 0.1) whose US AQI is still at or below `aqi`. */
export function maxPm25ForUsAqi(aqi: number): number {
  let best = 0;
  for (let tenths = 0; tenths <= 3254; tenths += 1) {
    const c = tenths / 10;
    const result = usAqi(c);
    if (result !== undefined && result.value <= aqi) best = c;
    else if (result !== undefined && result.value > aqi) break;
  }
  return best;
}
