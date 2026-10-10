// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GRID,
  fetchAirGrid,
  fetchFireCount,
  fetchWindGrid,
  gridPoints,
  worldPoints,
  recall,
  remember,
  towardsDeg,
} from './live';

beforeEach(() => {
  window.sessionStorage.clear();
});

const reply = (rows: readonly object[]): typeof fetch =>
  vi.fn(() => Promise.resolve(new Response(JSON.stringify(rows), { status: 200 })));

const echo = (current: Record<string, number>): typeof fetch =>
  vi.fn((url: string) => {
    const lats = new URL(url).searchParams.get('latitude')?.split(',') ?? [];
    return Promise.resolve(
      new Response(
        JSON.stringify(lats.map((lat) => ({ latitude: Number(lat), longitude: 0, current }))),
        { status: 200 },
      ),
    );
  }) as unknown as typeof fetch;

describe('the grid', () => {
  it('covers south Asia at the step asked, with a point at each corner', () => {
    const points = gridPoints(4);
    expect(points[0]).toEqual({ lat: GRID.south, lng: GRID.west });
    expect(points.at(-1)).toEqual({ lat: GRID.north, lng: GRID.east });
    expect(gridPoints(2).length).toBeGreaterThan(gridPoints(4).length * 3);
  });
});

describe('wind from Open-Meteo', () => {
  it('asks in metres per second, in batches, and returns one point per place', async () => {
    const fetcher = echo({ wind_speed_10m: 4, wind_direction_10m: 270 });
    const wind = await fetchWindGrid(fetcher);
    expect(wind).toHaveLength(gridPoints(3).length);
    expect(wind[0]).toMatchObject({ speed: 4, fromDeg: 270 });
    const urls = (fetcher as unknown as { mock: { calls: string[][] } }).mock.calls.map(
      (c) => c[0] ?? '',
    );
    expect(urls.length).toBeGreaterThan(1);
    expect(
      urls.every((u) => u.includes('wind_speed_unit=ms') && u.includes('wind_direction_10m')),
    ).toBe(true);
  });

  it('fails plainly when the service is down or sends nothing', async () => {
    await expect(
      fetchWindGrid(
        vi.fn(() =>
          Promise.resolve(new Response('no', { status: 500 })),
        ) as unknown as typeof fetch,
      ),
    ).rejects.toThrow(/500/u);
    await expect(fetchWindGrid(echo({}))).rejects.toThrow(/No wind/u);
  });

  it('turns where the wind comes from into where it is going', () => {
    expect(towardsDeg(270)).toBe(90);
    expect(towardsDeg(0)).toBe(180);
    expect(towardsDeg(315)).toBe(135);
  });
});

describe('the world grid', () => {
  it('covers the planet from pole to pole, without repeating the close grid', () => {
    const world = worldPoints(10);
    expect(world.some((p) => p.lat < -60)).toBe(true);
    expect(world.some((p) => p.lat > 60)).toBe(true);
    expect(world.some((p) => p.lng < -150)).toBe(true);
    expect(world.some((p) => p.lat === 28 && p.lng === 78)).toBe(false);
    expect(world.length).toBeLessThan(700);
  });
});

describe('air quality from Open-Meteo', () => {
  it('becomes model-grid points with PM2.5 and the AQI the model reports', async () => {
    const air = await fetchAirGrid(echo({ pm2_5: 62.9, us_aqi: 159 }));
    // The close grid over south Asia, and a coarse one for the rest of the world.
    expect(air).toHaveLength(gridPoints(2).length + worldPoints(10).length);
    expect(air[0]).toMatchObject({ pm25: 62.9, aqi: 159, name: 'Model grid' });
  });

  it('works out the AQI from PM2.5 when the model gives none, and skips points with no reading', async () => {
    const air = await fetchAirGrid(echo({ pm2_5: 12 }));
    expect(air[0]?.aqi).toBeGreaterThan(40);
    await expect(fetchAirGrid(reply([{ latitude: 1, longitude: 1, current: {} }]))).rejects.toThrow(
      /No air quality/u,
    );
  });
});

describe('fire count from our API', () => {
  it('reads the number of detections in the last 24 hours', async () => {
    expect(await fetchFireCount('https://x.test/', reply([]))).toBeUndefined();
    const ok = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ counts: { last24h: 127 } }), { status: 200 })),
    ) as unknown as typeof fetch;
    expect(await fetchFireCount('https://x.test/', ok)).toBe(127);
  });

  it('says nothing, rather than guessing, when the API fails or the answer is odd', async () => {
    const bad = vi.fn(() =>
      Promise.resolve(new Response('no', { status: 502 })),
    ) as unknown as typeof fetch;
    expect(await fetchFireCount('https://x.test', bad)).toBeUndefined();
    const odd = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ counts: { last24h: 'many' } }), { status: 200 }),
      ),
    ) as unknown as typeof fetch;
    expect(await fetchFireCount('https://x.test', odd)).toBeUndefined();
  });
});

describe('remembering for half an hour', () => {
  it('gives back what was stored, and nothing once it is old', () => {
    remember('x', { a: 1 });
    expect(recall('x')).toEqual({ a: 1 });
    const old = window.sessionStorage.getItem('vayu.mapdata.v1.x');
    window.sessionStorage.setItem('vayu.mapdata.v1.x', (old ?? '').replace(/"at":\d+/u, '"at":1'));
    expect(recall('x')).toBeUndefined();
    expect(recall('nothing')).toBeUndefined();
  });
});
