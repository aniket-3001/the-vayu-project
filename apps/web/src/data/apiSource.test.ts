import { describe, expect, it, vi } from 'vitest';
import { apiDataSource } from './apiSource';

const PROV = {
  mode: 'live',
  label: 'Nearby station',
  source: 'station',
  fetchedAt: '2026-10-06T05:00:00.000Z',
  asOf: '2026-10-06T05:00:00.000Z',
  ageMinutes: 0,
  simulated: false,
  stationId: 'openaq-sensor-1',
  stationName: 'Air Check',
  distanceKm: 3.6,
};
const hour = (hourStart: string, kind: string, pm25: number | null): unknown => ({
  hourStart,
  pm25,
  pm10: null,
  band: null,
  kind,
  prov: PROV,
});
const timeline = (over: Record<string, unknown> = {}): unknown => ({
  schemaVersion: 1,
  place: { id: 'park', name: 'Park', kind: 'park', lat: 28.6, lng: 77.2 },
  asOf: '2026-10-06T05:00:00.000Z',
  mode: 'live',
  hours: [
    hour('2026-10-06T03:00:00.000Z', 'observed', 48),
    hour('2026-10-06T04:00:00.000Z', 'observed', 50),
    hour('2026-10-06T06:00:00.000Z', 'forecast', 60),
  ],
  week: [],
  windows: [],
  headline: 'x',
  prov: PROV,
  ...over,
});
const reply = (body: unknown, ok = true): typeof fetch =>
  vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) });

describe('apiDataSource', () => {
  it('keeps only observed hours and carries the station and live label through', async () => {
    const fetchImpl = reply(timeline());
    const result = await apiDataSource('https://api.example.com/', fetchImpl).load('park');
    expect(fetchImpl).toHaveBeenCalledWith('https://api.example.com/v1/timeline?place=park');
    expect(result.observed).toEqual([
      { hourStart: '2026-10-06T03:00:00.000Z', pm25: 48, pm10: null },
      { hourStart: '2026-10-06T04:00:00.000Z', pm25: 50, pm10: null },
    ]);
    expect(result.mode).toBe('live');
    expect(result.simulated).toBe(false);
    expect(result.station).toEqual({ id: 'openaq-sensor-1', name: 'Air Check', distanceKm: 3.6 });
  });

  it('says so when the API fell back to the model: no station, no observed hours, simulated', async () => {
    const modelProv = {
      ...PROV,
      mode: 'model',
      source: 'model',
      simulated: true,
      stationId: undefined,
      stationName: undefined,
      distanceKm: undefined,
    };
    const result = await apiDataSource(
      'https://x',
      reply(timeline({ mode: 'model', hours: [], prov: modelProv })),
    ).load('home');
    expect(result.observed).toEqual([]);
    expect(result.simulated).toBe(true);
    expect(result.station).toBeUndefined();
  });

  it('fails loudly on an HTTP error or a response that is not a timeline', async () => {
    await expect(apiDataSource('https://x', reply({}, false)).load('park')).rejects.toThrow(
      /failed: 500/,
    );
    await expect(apiDataSource('https://x', reply({ nope: 1 })).load('park')).rejects.toThrow();
  });

  it('carries the weather through when the API has it, and has none when it does not', async () => {
    const weather = {
      at: '2026-10-06T04:30:00.000Z',
      windKmh: 6,
      windFromDeg: 310,
      rhPct: 45,
      tempC: 28,
    };
    const withWeather = await apiDataSource('https://x', reply(timeline({ weather }))).load('park');
    expect(withWeather.weather).toEqual(weather);
    const without = await apiDataSource('https://x', reply(timeline())).load('park');
    expect(without.weather).toBeUndefined();
  });
});
