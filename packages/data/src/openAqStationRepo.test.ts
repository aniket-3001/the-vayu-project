import { describe, expect, it, vi } from 'vitest';
import { openAqStationRepo } from './openAqStationRepo';

// Response shapes verified against docs.openaq.org on 5 Oct 2026 (see the client's own doc
// comment). No live network here — the whole point is these clients are testable without one.

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
  } as Response;
}

describe('openAqStationRepo', () => {
  it('turns a /locations response into stations, using the PM2.5 sensor id as the station id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        results: [
          {
            id: 42,
            name: 'Anand Vihar, Delhi - DPCC',
            coordinates: { latitude: 28.6469, longitude: 77.3157 },
            sensors: [
              { id: 991, parameter: { id: 2, name: 'pm25', units: 'µg/m³', displayName: 'PM2.5' } },
              { id: 992, parameter: { id: 1, name: 'pm10', units: 'µg/m³', displayName: 'PM10' } },
            ],
          },
          {
            id: 43,
            name: 'A station with no PM2.5 sensor',
            coordinates: { latitude: 28.5, longitude: 77.1 },
            sensors: [
              { id: 993, parameter: { id: 5, name: 'o3', units: 'ppm', displayName: 'O3' } },
            ],
          },
        ],
      }),
    );
    const repo = openAqStationRepo({ apiKey: 'test-key', fetchImpl });

    const stations = await repo.stationsNear({ lat: 28.6, lng: 77.2 }, '2026-10-05T00:00:00Z');

    expect(stations).toEqual([
      {
        id: 'openaq-sensor-991',
        name: 'Anand Vihar, Delhi - DPCC',
        lat: 28.6469,
        lng: 77.3157,
        hasPm25: true,
      },
      {
        id: 'openaq-location-43',
        name: 'A station with no PM2.5 sensor',
        lat: 28.5,
        lng: 77.1,
        hasPm25: false,
      },
    ]);

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('coordinates=28.6,77.2');
    expect((init.headers as Record<string, string>)['X-API-Key']).toBe('test-key');
  });

  it('parses /sensors/{id}/hours into valid RawHour shapes', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        results: [
          {
            value: 118.4,
            parameter: { id: 2, name: 'pm25', units: 'µg/m³', displayName: 'PM2.5' },
            period: {
              label: '1hour',
              interval: '01:00:00',
              datetimeFrom: { utc: '2026-10-04T23:00:00Z', local: '2026-10-05T04:30:00+05:30' },
              datetimeTo: { utc: '2026-10-05T00:00:00Z', local: '2026-10-05T05:30:00+05:30' },
            },
          },
        ],
      }),
    );
    const repo = openAqStationRepo({ apiKey: 'test-key', fetchImpl });

    const hours = await repo.hourlyFor('openaq-sensor-991', '2026-10-05T00:00:00Z');

    expect(hours).toEqual([{ hourStart: '2026-10-04T23:00:00Z', pm25: 118.4, pm10: null }]);
  });

  it('bounds the hours query from below so it returns the latest week, not the oldest (live-API finding)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ results: [] }));
    const repo = openAqStationRepo({ apiKey: 'test-key', fetchImpl });

    await repo.hourlyFor('openaq-sensor-991', '2026-10-05T00:00:00Z');

    const [url] = fetchImpl.mock.calls[0] as [string];
    expect(url).toContain('datetime_from=2026-09-28T00%3A00%3A00.000Z');
    expect(url).toContain('datetime_to=2026-10-05T00%3A00%3A00Z');
  });

  it('returns an empty series for a station id that carries no PM2.5 sensor', async () => {
    const fetchImpl = vi.fn();
    const repo = openAqStationRepo({ apiKey: 'test-key', fetchImpl });

    const hours = await repo.hourlyFor('openaq-location-43', '2026-10-05T00:00:00Z');

    expect(hours).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('throws a clear error when the API responds with a failure status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false));
    const repo = openAqStationRepo({ apiKey: 'bad-key', fetchImpl });

    await expect(
      repo.stationsNear({ lat: 28.6, lng: 77.2 }, '2026-10-05T00:00:00Z'),
    ).rejects.toThrow(/OpenAQ locations request failed/);
  });
});
