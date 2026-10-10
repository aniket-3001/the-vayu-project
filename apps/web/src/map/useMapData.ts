import { useEffect, useRef, useState } from 'react';
import { fetchAirGrid, fetchWindGrid, recall, remember, type WindPoint } from './live';
import { API_URL } from '../config';
import { readDemo } from '../demo/state';
import { airStore } from '../air/store';
import { fetchFires, sampleFires, type Fire } from './fires';
import { sampleMonitors, type Monitor } from './monitors';
import { sampleWindGrid } from './wind';

export interface MapData {
  readonly wind: readonly WindPoint[];
  /** The grid of air quality that colours the map between monitors. */
  readonly air: readonly Monitor[];
  readonly windLive: boolean;
  readonly airLive: boolean;
  /** Fires counted in the last 24 hours, from our API, or undefined. */
  readonly fires: number | undefined;
  /** Where they were seen. */
  readonly fireList: readonly Fire[];
}

const isWind = (v: unknown): v is readonly WindPoint[] => Array.isArray(v) && v.length > 0;
const isAir = (v: unknown): v is readonly Monitor[] => Array.isArray(v) && v.length > 0;

/**
 * What the map is drawn from. In the deployed app it starts empty and fills in as the live wind and air
 * (Open-Meteo) and the fires (our API, from NASA) arrive; whatever fails stays empty and the screen says so. Only
 * the prototype build and the tests start from made-up data.
 */
export function useMapData(fetchImpl: typeof fetch = fetch): MapData {
  const [data, setData] = useState<MapData>(() => {
    const wind = recall('wind');
    const air = recall('air');
    const sample = airStore().kind === 'sample';
    const staged = readDemo()?.fires;
    return {
      wind: isWind(wind) ? wind : sample ? sampleWindGrid() : [],
      air: isAir(air) ? air : sample ? sampleMonitors() : [],
      windLive: isWind(wind),
      airLive: isAir(air),
      fires: staged,
      fireList: sample ? sampleFires() : [],
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
    if (readDemo()?.fires === undefined) {
      fetchFires(API_URL, fetchImpl).then(
        (found) => {
          if (found !== undefined) apply({ fires: found.count, fireList: found.fires });
        },
        () => undefined,
      );
    }
    return () => {
      current = false;
    };
  }, [fetchImpl]);

  return data;
}
