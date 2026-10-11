// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GRID,
  fetchFireCount,
  fetchWindFromApi,
  fetchWindFromMetNo,
  metNoPoints,
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

const requestUrl = (input: RequestInfo | URL): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

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
    // The close grid over south Asia, and a coarse one for the rest of the world.
    expect(wind).toHaveLength(gridPoints(3).length + worldPoints(15).length);
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
    const world = worldPoints(15);
    expect(world.some((p) => p.lat < -60)).toBe(true);
    expect(world.some((p) => p.lat > 60)).toBe(true);
    expect(world.some((p) => p.lng < -150)).toBe(true);
    expect(world.some((p) => p.lat === 30 && p.lng === 75)).toBe(false);
    // About 600 points with the close grid: what a visitor spends of a day's free allowance each time.
    expect(world.length + gridPoints(3).length).toBeLessThan(700);
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

  it('takes the wind from our own API, so no visitor spends their own daily allowance on it', async () => {
    const urls: string[] = [];
    const wind = await fetchWindFromApi('https://api.example/', (input) => {
      urls.push(requestUrl(input));
      return Promise.resolve(
        new Response(
          JSON.stringify({
            points: [
              { lat: 28, lng: 77, speed: 3.5, fromDeg: 310 },
              { lat: 1, lng: 'x' },
            ],
          }),
          { status: 200 },
        ),
      );
    });
    expect(urls).toEqual(['https://api.example/v1/wind']);
    expect(wind).toEqual([{ lat: 28, lng: 77, speed: 3.5, fromDeg: 310 }]);
  });

  it('throws when our API has no wind, so the caller can fall back and never invents one', async () => {
    await expect(
      fetchWindFromApi('', () => Promise.resolve(new Response('{}', { status: 502 }))),
    ).rejects.toThrow(/502/u);
    await expect(
      fetchWindFromApi('', () => Promise.resolve(new Response('{"points":[]}', { status: 200 }))),
    ).rejects.toThrow(/No wind/u);
  });

  it('has a second source, MET Norway, on a coarser grid of about two hundred points', async () => {
    const points = metNoPoints();
    expect(points.length).toBeGreaterThan(150);
    expect(points.length).toBeLessThan(260);
    const urls: string[] = [];
    const wind = await fetchWindFromMetNo((input) => {
      urls.push(requestUrl(input));
      return Promise.resolve(
        new Response(
          JSON.stringify({
            properties: {
              timeseries: [
                { data: { instant: { details: { wind_speed: 4.2, wind_from_direction: 285 } } } },
              ],
            },
          }),
          { status: 200 },
        ),
      );
    });
    expect(wind).toHaveLength(points.length);
    expect(urls[0]).toMatch(/api\.met\.no.*lat=.*lon=/u);
    expect(wind[0]).toMatchObject({ speed: 4.2, fromDeg: 285 });
  });

  it('gives no wind from MET Norway when most points fail, rather than a patchy one', async () => {
    await expect(
      fetchWindFromMetNo(() => Promise.resolve(new Response('', { status: 429 }))),
    ).rejects.toThrow(/too little/u);
  });
});
