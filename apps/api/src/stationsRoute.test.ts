import { Stations } from '@vayu/contracts';
import { fixedClock } from '@vayu/core';
import { describe, expect, it } from 'vitest';
import { handleStations } from './stationsRoute';

const AS_OF = '2026-10-10T12:00:00.000Z';
const station = (id: number, at: string): unknown => ({
  id: `openaq-location-${String(id)}`,
  name: `S${String(id)}`,
  lat: 28.6,
  lng: 77.2,
  pm25: 100 + id,
  at,
});
const ask = (snapshot: unknown, method = 'GET'): ReturnType<typeof handleStations> =>
  handleStations(
    { method, path: '/v1/stations', query: {}, headers: {} },
    { stations: () => Promise.resolve(snapshot), clock: fixedClock(AS_OF) },
  );

describe('GET /v1/stations', () => {
  it('gives the monitors the last snapshot saw, for the map', async () => {
    const response = await ask({
      harvestedAt: '2026-10-10T11:40:00.000Z',
      stations: [station(1, '2026-10-10T11:00:00.000Z'), station(2, '2026-10-10T10:00:00.000Z')],
    });
    const body = Stations.parse(response.body);
    expect(body.mode).toBe('live');
    expect(body.stations.map((s) => s.pm25)).toEqual([101, 102]);
    expect(response.headers).toEqual({ 'cache-control': 'public, max-age=300' });
  });

  it('drops a reading older than six hours or from the future (rule I3)', async () => {
    const response = await ask({
      harvestedAt: '2026-10-10T11:40:00.000Z',
      stations: [
        station(1, '2026-10-10T05:00:00.000Z'),
        station(2, '2026-10-10T13:00:00.000Z'),
        station(3, '2026-10-10T08:00:00.000Z'),
      ],
    });
    expect(Stations.parse(response.body).stations.map((s) => s.name)).toEqual(['S3']);
  });

  it('says there are none, rather than guessing, when there is no snapshot or it is garbled', async () => {
    for (const snapshot of [undefined, { nonsense: true }, null]) {
      const body = Stations.parse((await ask(snapshot)).body);
      expect(body.stations).toEqual([]);
      expect(body.mode).toBe('model');
    }
  });

  it('does not take a POST', async () => {
    expect((await ask(undefined, 'POST')).statusCode).toBe(405);
  });
});
