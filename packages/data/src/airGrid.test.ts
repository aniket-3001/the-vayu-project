import { describe, expect, it } from 'vitest';
import { airGridPoints, openMeteoAirGridRepo } from './airGrid';

const urlOf = (input: Parameters<typeof fetch>[0]): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

const answer = (url: string): unknown => {
  const lats = (new URL(url).searchParams.get('latitude') ?? '').split(',');
  return lats.map((_, i) => ({ current: { pm2_5: 10 + (i % 7) } }));
};

describe('the air grid', () => {
  it('covers south Asia every three degrees and the globe every nine, some six hundred points', () => {
    const points = airGridPoints();
    expect(points.length).toBeGreaterThan(450);
    expect(points.length).toBeLessThan(900);
    expect(points.some((p) => p.lat === 28 && p.lng === 77)).toBe(true);
    expect(points.some((p) => p.lat <= -70)).toBe(true);
    expect(new Set(points.map((p) => `${String(p.lat)},${String(p.lng)}`)).size).toBe(
      points.length,
    );
  });

  it('asks the model a few chunks at a time and returns each point it answered, once, for a while', async () => {
    let calls = 0;
    let t = 0;
    const repo = openMeteoAirGridRepo({
      now: () => t,
      fetchImpl: (input) => {
        calls += 1;
        return Promise.resolve(new Response(JSON.stringify(answer(urlOf(input))), { status: 200 }));
      },
    });
    const points = await repo.grid();
    expect(points).toHaveLength(airGridPoints().length);
    const first = calls;
    t = 5 * 60_000;
    await repo.grid();
    expect(calls).toBe(first);
    t = 40 * 60_000;
    await repo.grid();
    expect(calls).toBe(first * 2);
  });

  it('leaves out a point the model left out, and fails rather than inventing air', async () => {
    const holes = openMeteoAirGridRepo({
      fetchImpl: (input) => {
        const rows = (answer(urlOf(input)) as { current: { pm2_5: number | null } }[]).map(
          (row, i) => (i % 3 === 0 ? { current: { pm2_5: null } } : row),
        );
        return Promise.resolve(new Response(JSON.stringify(rows), { status: 200 }));
      },
    });
    expect((await holes.grid()).length).toBeLessThan(airGridPoints().length);
    const down = openMeteoAirGridRepo({
      fetchImpl: () => Promise.resolve(new Response('{}', { status: 429 })),
    });
    await expect(down.grid()).rejects.toThrow(/429/u);
  });
});
