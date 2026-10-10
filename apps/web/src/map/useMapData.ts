import { useEffect, useRef, useState } from 'react';
import {
  fetchAirGrid,
  fetchFireCount,
  fetchWindGrid,
  recall,
  remember,
  type WindPoint,
} from './live';
import { sampleMonitors, type Monitor } from './monitors';
import { sampleWindGrid } from './wind';

/** Our deployed API, which counts the fires NASA's satellites saw. Public and read-only. */
export const API_URL =
  import.meta.env.VITE_API_URL ?? 'https://niu33luxo8.execute-api.ap-south-1.amazonaws.com';

export interface MapData {
  readonly wind: readonly WindPoint[];
  /** The grid of air quality that colours the map between monitors. */
  readonly air: readonly Monitor[];
  readonly windLive: boolean;
  readonly airLive: boolean;
  /** Fires counted in the last 24 hours, from our API, or undefined. */
  readonly fires: number | undefined;
}

const isWind = (v: unknown): v is readonly WindPoint[] => Array.isArray(v) && v.length > 0;
const isAir = (v: unknown): v is readonly Monitor[] => Array.isArray(v) && v.length > 0;

/**
 * What the map is drawn from. It starts with sample data so the screen is never empty, then swaps in the
 * live wind and air from Open-Meteo and the live fire count from our API as each arrives. Whatever fails
 * stays a sample, and the screen says which is which.
 */
export function useMapData(fetchImpl: typeof fetch = fetch): MapData {
  const [data, setData] = useState<MapData>(() => {
    const wind = recall('wind');
    const air = recall('air');
    return {
      wind: isWind(wind) ? wind : sampleWindGrid(),
      air: isAir(air) ? air : sampleMonitors(),
      windLive: isWind(wind),
      airLive: isAir(air),
      fires: undefined,
    };
  });

  // What was missing when the map opened; only that is asked for.
  const missing = useRef({ wind: !data.windLive, air: !data.airLive });

  useEffect(() => {
    let current = true;
    const apply = (patch: Partial<MapData>): void => {
      if (current) setData((now) => ({ ...now, ...patch }));
    };
    if (missing.current.wind) {
      fetchWindGrid(fetchImpl).then(
        (wind) => {
          remember('wind', wind);
          apply({ wind, windLive: true });
        },
        () => undefined,
      );
    }
    if (missing.current.air) {
      fetchAirGrid(fetchImpl).then(
        (air) => {
          remember('air', air);
          apply({ air, airLive: true });
        },
        () => undefined,
      );
    }
    fetchFireCount(API_URL, fetchImpl).then(
      (fires) => {
        apply({ fires });
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [fetchImpl]);

  return data;
}
