import { describe, expect, it } from 'vitest';
import {
  metNoWindGridRepo,
  metNoWindPoints,
  openMeteoWindGridRepo,
  windGridPoints,
  windGridWithFallback,
} from './windGrid';

const answerFor = (url: string): unknown => {
  const q = new URL(url).searchParams;
  const lats = (q.get('latitude') ?? '').split(',');
  const lngs = (q.get('longitude') ?? '').split(',');
  return lats.map((lat, i) => ({
    latitude: Number(lat),
    longitude: Number(lngs[i]),
    current: { wind_speed_10m: 4 + (i % 5), wind_direction_10m: 270 + (i % 3) * 10 },
  }));
};

const requestUrl = (input: Parameters<typeof fetch>[0]): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

describe('the wind grid', () => {
  it('covers south Asia closely and the rest of the globe coarsely, a couple of hundred points in all', () => {
    const points = windGridPoints();
    expect(points.length).toBeGreaterThan(200);
    expect(points.length).toBeLessThan(400);
    expect(points.some((p) => p.lat === 28 && p.lng === 77)).toBe(true);
    expect(points.some((p) => p.lat < -60)).toBe(true);
    expect(points.some((p) => p.lng < -150)).toBe(true);
    expect(new Set(points.map((p) => `${String(p.lat)},${String(p.lng)}`)).size).toBe(
      points.length,
    );
  });

  it('asks the weather model a hundred points at a time and returns every point it answered', async () => {
    const urls: string[] = [];
    const repo = openMeteoWindGridRepo({
      fetchImpl: (input) => {
        const url = requestUrl(input);
        urls.push(url);
        return Promise.resolve(new Response(JSON.stringify(answerFor(url)), { status: 200 }));
      },
    });
    const points = await repo.grid();
    expect(points).toHaveLength(windGridPoints().length);
    expect(urls.length).toBeGreaterThan(3);
    for (const url of urls) {
      expect(
        (new URL(url).searchParams.get('latitude') ?? '').split(',').length,
      ).toBeLessThanOrEqual(90);
      expect(url).toContain('wind_speed_unit=ms');
    }
    expect(points[0]?.fromDeg).toBeGreaterThanOrEqual(0);
  });

  it('keeps the answer, so a crowd costs the model one round of requests', async () => {
    let calls = 0;
    let t = 0;
    const repo = openMeteoWindGridRepo({
      now: () => t,
      fetchImpl: (input) => {
        calls += 1;
        return Promise.resolve(
          new Response(JSON.stringify(answerFor(requestUrl(input))), { status: 200 }),
        );
      },
    });
    await repo.grid();
    const first = calls;
    t = 10 * 60_000;
    await repo.grid();
    expect(calls).toBe(first);
    t = 3 * 3_600_000 + 60_000;
    await repo.grid();
    expect(calls).toBe(first * 2);
  });

  it('leaves out a reading the model left out, and fails rather than inventing wind', async () => {
    const holes = openMeteoWindGridRepo({
      fetchImpl: (input) => {
        const rows = (answerFor(requestUrl(input)) as { current: Record<string, unknown> }[]).map(
          (row, i) => (i % 2 === 0 ? { ...row, current: { wind_speed_10m: null } } : row),
        );
        return Promise.resolve(new Response(JSON.stringify(rows), { status: 200 }));
      },
    });
    expect((await holes.grid()).length).toBeLessThan(windGridPoints().length);
    const down = openMeteoWindGridRepo({
      fetchImpl: () => Promise.resolve(new Response('{}', { status: 429 })),
    });
    await expect(down.grid()).rejects.toThrow(/429/u);
  });
});

describe('the second source, MET Norway', () => {
  const metAnswer = (url: string): unknown => {
    const q = new URL(url).searchParams;
    return {
      properties: {
        timeseries: [
          {
            data: {
              instant: {
                details: {
                  wind_speed: 3 + Number(q.get('lat')) / 40,
                  wind_from_direction: 200 + Number(q.get('lon')) / 2,
                },
              },
            },
          },
        ],
      },
    };
  };

  it('has a grid of about two hundred points over the whole globe', () => {
    const points = metNoWindPoints();
    expect(points.length).toBeGreaterThan(150);
    expect(points.length).toBeLessThan(260);
    expect(points.some((p) => p.lat <= -60)).toBe(true);
    expect(points.some((p) => p.lng <= -170)).toBe(true);
  });

  it('asks a point at a time, says who it is, and returns the wind it was given', async () => {
    const agents = new Set<string>();
    let busy = 0;
    let most = 0;
    const repo = metNoWindGridRepo({
      concurrency: 5,
      fetchImpl: async (input, init) => {
        agents.add(String((init?.headers as Record<string, string> | undefined)?.['user-agent']));
        busy += 1;
        most = Math.max(most, busy);
        await Promise.resolve();
        busy -= 1;
        return new Response(JSON.stringify(metAnswer(requestUrl(input))), { status: 200 });
      },
    });
    const points = await repo.grid();
    expect(points).toHaveLength(metNoWindPoints().length);
    expect([...agents]).toHaveLength(1);
    expect([...agents][0]).toMatch(/TheVayuProject/u);
    expect(most).toBeLessThanOrEqual(5);
    expect(points[0]?.speed).toBeGreaterThan(0);
  });

  it('gives up, rather than a patchy wind, when most points fail', async () => {
    let n = 0;
    const repo = metNoWindGridRepo({
      fetchImpl: (input) => {
        n += 1;
        return Promise.resolve(
          n % 4 === 0
            ? new Response(JSON.stringify(metAnswer(requestUrl(input))), { status: 200 })
            : new Response('', { status: 429 }),
        );
      },
    });
    await expect(repo.grid()).rejects.toThrow(/too little/u);
  });

  it('is used only when the first source fails', async () => {
    const good = { grid: () => Promise.resolve([{ lat: 1, lng: 2, speed: 3, fromDeg: 4 }]) };
    const down = { grid: () => Promise.reject(new Error('429')) };
    const spare = { grid: () => Promise.resolve([{ lat: 9, lng: 9, speed: 9, fromDeg: 9 }]) };
    expect((await windGridWithFallback(good, spare).grid())[0]?.lat).toBe(1);
    expect((await windGridWithFallback(down, spare).grid())[0]?.lat).toBe(9);
    await expect(windGridWithFallback(down, down).grid()).rejects.toThrow(/429/u);
  });
});
