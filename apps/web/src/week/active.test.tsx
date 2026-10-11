// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useFires } from '../alerts/useFires';
import { useMapData } from '../map/useMapData';
import { setWeekScene, weekActive } from './active';

afterEach(() => {
  setWeekScene(undefined);
});

const fire = (
  id: string,
  lat: number,
  lng: number,
): { id: string; lat: number; lng: number; frp: number; hoursAgo: number } => ({
  id,
  lat,
  lng,
  frp: 10,
  hoursAgo: 3,
});

describe('a recorded day outside the air store', () => {
  it('is off until a scene is set', () => {
    expect(weekActive()).toBe(false);
    setWeekScene({ fires: [], wind: [] });
    expect(weekActive()).toBe(true);
  });

  it('counts the recorded fires near a place, and asks our API for none', () => {
    setWeekScene({ fires: [fire('a', 28.7, 77.1), fire('b', 31.0, 75.0)], wind: [] });
    const asked: string[] = [];
    const fetcher = ((url: string) => {
      asked.push(url);
      return Promise.reject(new Error('no network in a recorded day'));
    }) as unknown as typeof fetch;
    const { result } = renderHook(() => useFires({ lat: 28.6, lng: 77.2 }, undefined, fetcher));
    expect(result.current).toBe(1);
    expect(asked).toHaveLength(0);
  });

  it('draws the map from the recorded fires and wind, and fetches nothing', () => {
    const wind = [{ lat: 28, lng: 77, speed: 4, fromDeg: 300 }];
    setWeekScene({ fires: [fire('a', 28.7, 77.1)], wind });
    const asked: string[] = [];
    const fetcher = ((url: string) => {
      asked.push(url);
      return Promise.reject(new Error('no network'));
    }) as unknown as typeof fetch;
    const { result } = renderHook(() => useMapData(fetcher));
    expect(result.current.wind).toEqual(wind);
    expect(result.current.windLive).toBe(true);
    expect(result.current.fires).toBe(1);
    expect(result.current.fireList).toHaveLength(1);
    expect(asked).toHaveLength(0);
  });
});
