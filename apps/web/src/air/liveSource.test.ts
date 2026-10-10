import { describe, expect, it, vi } from 'vitest';
import type { Pin } from '../data/pins';
import { liveAirSource } from './liveSource';

const pin: Pin = { id: '28.59,77.05', name: 'Home', lat: 28.5912, lng: 77.0488 };
const json = (body: unknown, status = 200): Response =>
  ({ ok: status < 400, status, json: () => Promise.resolve(body) }) as Response;
const make = (f: ReturnType<typeof vi.fn>, timeout = 50): ReturnType<typeof liveAirSource> =>
  liveAirSource('https://api.example/', f, timeout);

describe('the live source', () => {
  it('asks our API for a place by its coordinates, to the kilometre, and for fourteen days of history', async () => {
    const f = vi.fn().mockResolvedValue(json({ schemaVersion: 1, nonsense: true }));
    const source = make(f);
    await source.today(pin).catch(() => undefined);
    await source.history(pin).catch(() => undefined);
    expect(f.mock.calls[0]?.[0]).toBe('https://api.example/v1/today?lat=28.59&lng=77.05');
    expect(f.mock.calls[1]?.[0]).toBe('https://api.example/v1/history?lat=28.59&lng=77.05&days=14');
  });

  it('turns a history answer into hours, and a stations answer into monitors', async () => {
    const place = { id: 'gps', name: 'Your location', kind: 'other', lat: 28.59, lng: 77.05 };
    const prov = {
      mode: 'live',
      label: 'Nearby station',
      source: 'station',
      fetchedAt: 'x',
      asOf: 'x',
      ageMinutes: 0,
    };
    const f = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          schemaVersion: 1,
          place,
          asOf: 'x',
          mode: 'live',
          days: 14,
          hours: [
            { t: 'a', pm25: 5 },
            { t: 'b', pm25: null },
          ],
          prov,
        }),
      )
      .mockResolvedValueOnce(
        json({
          schemaVersion: 1,
          asOf: 'x',
          mode: 'live',
          source: 's',
          stations: [{ id: 'a', name: 'A', lat: 28, lng: 77, pm25: 50, at: 'z' }],
        }),
      );
    const source = make(f);
    expect(await source.history(pin)).toEqual([
      { t: 'a', pm25: 5 },
      { t: 'b', pm25: null },
    ]);
    expect(await source.stations()).toHaveLength(1);
  });

  it('says in words what went wrong: offline, slow, an error from the API, a body it cannot read', async () => {
    await expect(
      make(vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))).today(pin),
    ).rejects.toThrow('We could not reach the server. Check your connection.');
    const slow = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );
    await expect(make(slow, 20).today(pin)).rejects.toThrow('The server took too long to answer.');
    const api = json(
      {
        error: {
          code: 'bad_location',
          message: 'lat and lng must both be numbers inside north India',
        },
      },
      400,
    );
    await expect(make(vi.fn().mockResolvedValue(api)).today(pin)).rejects.toThrow(
      'inside north India',
    );
    await expect(make(vi.fn().mockResolvedValue(json(null, 502))).today(pin)).rejects.toThrow(
      '(502)',
    );
    const broken = {
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('bad json')),
    } as Response;
    await expect(make(vi.fn().mockResolvedValue(broken)).today(pin)).rejects.toThrow(
      'could not read',
    );
    await expect(make(vi.fn().mockResolvedValue(json({ hello: 1 }))).today(pin)).rejects.toThrow(
      'did not expect',
    );
  });
});
