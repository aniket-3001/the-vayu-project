import { AirGrid } from '@vayu/contracts';
import { fixedClock } from '@vayu/core';
import { describe, expect, it } from 'vitest';
import { handleAirGrid } from './airGridRoute';

const ask = (
  grid: () => Promise<readonly { lat: number; lng: number; pm25: number }[]>,
  method = 'GET',
): ReturnType<typeof handleAirGrid> =>
  handleAirGrid(
    { method, path: '/v1/airgrid', query: {}, headers: {} },
    { air: { grid }, clock: fixedClock('2026-10-11T08:00:00.000Z') },
  );

describe('GET /v1/airgrid', () => {
  it('gives the model’s PM2.5, says it is a model, and may be kept half an hour', async () => {
    const response = await ask(() => Promise.resolve([{ lat: 28, lng: 77, pm25: 61 }]));
    const body = AirGrid.parse(response.body);
    expect(body.mode).toBe('model');
    expect(body.source).toMatch(/estimate, not a measurement/u);
    expect(response.headers).toEqual({ 'cache-control': 'public, max-age=1800' });
  });

  it('answers 502 rather than a guess, and takes only a GET', async () => {
    expect((await ask(() => Promise.reject(new Error('429')))).statusCode).toBe(502);
    expect((await ask(() => Promise.resolve([]), 'POST')).statusCode).toBe(405);
  });
});
