import { useEffect, useRef, useState } from 'react';
import {
  fetchAirModel,
  fetchWindFromApi,
  fetchWindFromMetNo,
  recall,
  remember,
  type WindPoint,
} from './live';
import { API_URL } from '../config';
import { readDemo } from '../demo/state';
import { weekScene } from '../week/active';
import { airStore } from '../air/store';
import { fetchFires, type Fire } from './fires';
import { usAqi } from '@vayu/core';
import type { Monitor } from './monitors';

export interface MapData {
  readonly wind: readonly WindPoint[];
  /** A made-up grid of air quality, for the prototype only: the deployed map is coloured from real monitors. */
  readonly air: readonly Monitor[];
  /**
   * The regional air model across the globe, from our API, for colouring the map where no monitor reports. A model
   * estimate: empty in the prototype, which has its own made-up grid, and until it arrives.
   */
  readonly modelAir: readonly Monitor[];
  readonly windLive: boolean;
  /** Fires counted in the last 24 hours, from our API, or undefined. */
  readonly fires: number | undefined;
  /** Where they were seen. */
  readonly fireList: readonly Fire[];
}

const isWind = (v: unknown): v is readonly WindPoint[] => Array.isArray(v) && v.length > 0;

/**
 * What the map is drawn from. In the deployed app it starts empty and fills in as the live wind and air
 * (Open-Meteo) and the fires (our API, from NASA) arrive; whatever fails stays empty and the screen says so. Only
 * the prototype build and the tests start from made-up data.
 */
export function useMapData(fetchImpl: typeof fetch = fetch): MapData {
  const [data, setData] = useState<MapData>(() => {
    const wind = recall('wind');
    // Only the prototype's source has made-up map data; the deployed app starts empty.
    const made = airStore().madeUpMap();
    const staged = readDemo()?.fires;
    // A recorded day draws its own wind and fires, and asks for nothing.
    const week = weekScene();
    if (week !== undefined)
      return {
        wind: week.wind,
        air: [],
        modelAir: [],
        windLive: true,
        fires: week.fires.length,
        fireList: week.fires,
      };
    return {
      wind: isWind(wind) ? wind : (made?.wind ?? []),
      air: made?.air ?? [],
      modelAir: [],
      windLive: isWind(wind),
      fires: staged,
      fireList: made?.fires ?? [],
    };
  });

  // What was missing when the map opened; only that is asked for.
  const missing = useRef({ wind: !data.windLive });

  useEffect(() => {
    if (weekScene() !== undefined) return undefined;
    let current = true;
    const apply = (patch: Partial<MapData>): void => {
      if (current) setData((now) => ({ ...now, ...patch }));
    };
    if (missing.current.wind) {
      // Our API first (the wind is asked of the weather models once for everyone, and kept). If it has none, MET
      // Norway, which has no daily allowance to spend; Open-Meteo is not asked from a visitor's browser, because
      // each point is a call against its allowance for that address. Never a made-up wind.
      fetchWindFromApi(API_URL, fetchImpl)
        .catch(() => fetchWindFromMetNo(fetchImpl))
        .then(
          (wind) => {
            remember('wind', wind);
            apply({ wind, windLive: true });
          },
          () => undefined,
        );
    }
    // The deployed app asks for the air model too, to colour the map where no monitor has a recent reading.
    if (airStore().madeUpMap() === undefined) {
      fetchAirModel(API_URL, fetchImpl).then(
        (points) => {
          apply({
            modelAir: points.map((p) => ({
              id: `model-${String(p.lat)}-${String(p.lng)}`,
              name: 'Air model',
              lat: p.lat,
              lng: p.lng,
              pm25: p.pm25,
              aqi: usAqi(p.pm25)?.value ?? 0,
              ageMinutes: 0,
            })),
          });
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
