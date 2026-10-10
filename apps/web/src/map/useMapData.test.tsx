// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMapData } from './useMapData';

beforeEach(() => {
  window.sessionStorage.clear();
});

const answer = (url: string): Response => {
  const lats = new URL(url).searchParams.get('latitude')?.split(',') ?? [];
  if (url.includes('/v1/fires'))
    return new Response(JSON.stringify({ counts: { last24h: 127 } }), { status: 200 });
  const current = url.includes('air-quality')
    ? { pm2_5: 60, us_aqi: 154 }
    : { wind_speed_10m: 3, wind_direction_10m: 270 };
  return new Response(
    JSON.stringify(lats.map((lat) => ({ latitude: Number(lat), longitude: 0, current }))),
    { status: 200 },
  );
};

describe('the map’s data', () => {
  it('starts as a sample so the screen is never empty, then swaps in the live wind, air and fires', async () => {
    const fetcher = vi.fn((url: string) => Promise.resolve(answer(url))) as unknown as typeof fetch;
    const { result } = renderHook(() => useMapData(fetcher));
    expect(result.current.windLive).toBe(false);
    expect(result.current.wind.length).toBeGreaterThan(0);
    expect(result.current.air.length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(
        result.current.windLive && result.current.airLive && result.current.fires === 127,
      ).toBe(true);
    });
    expect(result.current.air[0]?.name).toBe('Model grid');
  });

  it('stays a sample, without failing, when the services cannot be reached', async () => {
    const down = vi.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;
    const { result } = renderHook(() => useMapData(down));
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current.windLive).toBe(false);
    expect(result.current.airLive).toBe(false);
    expect(result.current.fires).toBeUndefined();
    expect(result.current.wind.length).toBeGreaterThan(0);
  });

  it('does not ask again for wind and air it has just been given', async () => {
    const fetcher = vi.fn((url: string) => Promise.resolve(answer(url))) as unknown as typeof fetch;
    const first = renderHook(() => useMapData(fetcher));
    await waitFor(() => {
      expect(first.result.current.windLive && first.result.current.airLive).toBe(true);
    });
    const calls = (fetcher as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    first.unmount();
    const again = renderHook(() => useMapData(fetcher));
    expect(again.result.current.windLive).toBe(true);
    await new Promise((r) => setTimeout(r, 30));
    const after = (fetcher as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    expect(after - calls).toBeLessThanOrEqual(1);
  });
});
