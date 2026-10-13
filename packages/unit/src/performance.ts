/** How recent a room reading and a purifier reading must both be, to be compared. */
export const PERFORMANCE_WINDOW_MS = 10 * 60_000;

export interface Sample {
  readonly pm25: number;
  readonly atMs: number;
}

/**
 * How much cleaner the air at the purifier's output is than the room, in per cent, from the unit's latest reading off
 * the purifier and its latest reading on it. Null (not enough to say) unless both are fresh and the room has particles
 * to remove; never a negative figure.
 */
export function purifierPerformance(
  free: Sample | undefined,
  purified: Sample | undefined,
  nowMs: number,
): { readonly cleanerPct: number } | null {
  if (free === undefined || purified === undefined) return null;
  if (nowMs - free.atMs > PERFORMANCE_WINDOW_MS || nowMs - purified.atMs > PERFORMANCE_WINDOW_MS) {
    return null;
  }
  if (free.pm25 <= 0) return null;
  const pct = Math.round(((free.pm25 - purified.pm25) / free.pm25) * 100);
  return { cleanerPct: Math.max(0, pct) };
}
