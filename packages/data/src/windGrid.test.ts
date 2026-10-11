import { describe, expect, it } from 'vitest';
import { openMeteoWindGridRepo, windGridPoints } from './windGrid';

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
  it('covers south Asia closely and the rest of the globe coarsely, a few hundred points in all', () => {
    const points = windGridPoints();
    expect(points.length).toBeGreaterThan(300);
    expect(points.length).toBeLessThan(800);
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
    t = 31 * 60_000;
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
