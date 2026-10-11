import { WindGrid } from '@vayu/contracts';
import { fixedClock } from '@vayu/core';
import { describe, expect, it } from 'vitest';
import { handleWind } from './windRoute';

const ask = (
  grid: () => Promise<readonly { lat: number; lng: number; speed: number; fromDeg: number }[]>,
  method = 'GET',
): ReturnType<typeof handleWind> =>
  handleWind(
    { method, path: '/v1/wind', query: {}, headers: {} },
    { wind: { grid }, clock: fixedClock('2026-10-11T08:00:00.000Z') },
  );

describe('GET /v1/wind', () => {
  it('gives the wind grid, and says a shared cache may keep it half an hour', async () => {
    const response = await ask(() =>
      Promise.resolve([{ lat: 28, lng: 77, speed: 3.2, fromDeg: 300 }]),
    );
    const body = WindGrid.parse(response.body);
    expect(body.points).toHaveLength(1);
    expect(body.source).toMatch(/Open-Meteo/u);
    expect(response.headers).toEqual({ 'cache-control': 'public, max-age=1800' });
  });

  it('answers 502 rather than a made-up wind when the model cannot be reached', async () => {
    const response = await ask(() => Promise.reject(new Error('429')));
    expect(response.statusCode).toBe(502);
  });

  it('takes only a GET', async () => {
    expect((await ask(() => Promise.resolve([]), 'POST')).statusCode).toBe(405);
  });
});
