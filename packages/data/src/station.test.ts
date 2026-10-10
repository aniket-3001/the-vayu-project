import { describe, expect, it } from 'vitest';
import { haversineKm, nearestStation, type Station } from './station';

describe('haversineKm', () => {
  it('is zero for the same point', () => {
    expect(haversineKm({ lat: 28.6, lng: 77.2 }, { lat: 28.6, lng: 77.2 })).toBe(0);
  });

  it('matches a known distance within half a percent', () => {
    // Connaught Place to India Gate, Delhi: roughly 3.3 km apart.
    const cp = { lat: 28.6315, lng: 77.2167 };
    const indiaGate = { lat: 28.6129, lng: 77.2295 };
    const distance = haversineKm(cp, indiaGate);
    expect(distance).toBeGreaterThan(2);
    expect(distance).toBeLessThan(4);
  });
});

describe('nearestStation', () => {
  const point = { lat: 28.6, lng: 77.2 };

  const far: Station = { id: 'far', name: 'Far', lat: 29.0, lng: 78.0, hasPm25: true };
  const closeNoSensor: Station = {
    id: 'close-no-sensor',
    name: 'Close but no PM2.5',
    lat: 28.601,
    lng: 77.201,
    hasPm25: false,
  };
  const closeWithSensor: Station = {
    id: 'close-with-sensor',
    name: 'Close with PM2.5',
    lat: 28.61,
    lng: 77.21,
    hasPm25: true,
  };

  it('picks the nearest station that actually reports PM2.5', () => {
    const result = nearestStation(point, [far, closeNoSensor, closeWithSensor]);
    expect(result?.station.id).toBe('close-with-sensor');
  });

  it('skips a geographically closer station that has no PM2.5 sensor', () => {
    const result = nearestStation(point, [closeNoSensor, closeWithSensor]);
    expect(result?.station.id).not.toBe('close-no-sensor');
  });

  it('returns undefined when nothing nearby reports PM2.5', () => {
    expect(nearestStation(point, [closeNoSensor])).toBeUndefined();
  });

  it('returns undefined for an empty station list', () => {
    expect(nearestStation(point, [])).toBeUndefined();
  });
});
