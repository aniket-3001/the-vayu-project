import { LEVELS, levelForAqi } from '../design/levels';
import { BANDS, type Band } from './types';

/** The AQI band a reading falls in: the same six levels the app colours its air by, best to worst. */
export function bandOfAqi(aqi: number): Band | undefined {
  if (!Number.isFinite(aqi)) return undefined;
  return BANDS[LEVELS.indexOf(levelForAqi(aqi))];
}

export interface AirNote {
  /** Tells it the AQI of the place the person is looking at. Says nothing for a number that is not a reading. */
  readonly note: (aqi: number | undefined) => void;
  /** The band showing now, once one has been seen. */
  readonly current: () => Band | undefined;
}

/**
 * Keeps the band the person is looking at, and says `onFirst` the first time each band is seen, which is once per
 * session per band when one of these lives for the session.
 */
export function createAirNote(onFirst: (band: Band) => void): AirNote {
  let current: Band | undefined;
  const seen = new Set<Band>();
  return {
    note(aqi) {
      const band = aqi === undefined ? undefined : bandOfAqi(aqi);
      if (band === undefined) return;
      current = band;
      if (seen.has(band)) return;
      seen.add(band);
      onFirst(band);
    },
    current: () => current,
  };
}
