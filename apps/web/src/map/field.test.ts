import { describe, expect, it } from 'vitest';
import { LEVELS } from '../design/levels';
import {
  FIELD_BOUNDS,
  REACH_DEG,
  fieldAt,
  gradientColour,
  fieldAtIndexed,
  indexMonitors,
  visibleWindow,
  mercatorY,
  sampleField,
} from './field';
import type { Monitor } from './monitors';

const at = (lat: number, lng: number, aqi: number): Monitor => ({
  id: String(lat),
  name: 'm',
  lat,
  lng,
  pm25: aqi / 2,
  aqi,
  ageMinutes: 5,
});

describe('the colour field between monitors', () => {
  it('reads a monitor’s own value on top of it, with full confidence', () => {
    const v = fieldAt(20, 80, [at(20, 80, 120), at(24, 84, 40)]);
    expect(v?.aqi).toBeCloseTo(120, 0);
    expect(v?.confidence).toBeGreaterThan(0.95);
  });

  it('blends between two monitors, nearer the nearer one', () => {
    const monitors = [at(20, 78, 40), at(20, 82, 160)];
    const mid = fieldAt(20, 80, monitors)?.aqi ?? 0;
    const nearLow = fieldAt(20, 78.8, monitors)?.aqi ?? 0;
    const nearHigh = fieldAt(20, 81.2, monitors)?.aqi ?? 0;
    expect(mid).toBeGreaterThan(40);
    expect(mid).toBeLessThan(160);
    expect(nearLow).toBeLessThan(mid);
    expect(nearHigh).toBeGreaterThan(mid);
  });

  it('says nothing where no monitor is within reach, and less the further away', () => {
    const monitors = [at(20, 80, 100)];
    expect(fieldAt(20, 80 + REACH_DEG + 0.5, monitors)).toBeUndefined();
    const close = fieldAt(20, 80.5, monitors)?.confidence ?? 0;
    const far = fieldAt(20, 82.5, monitors)?.confidence ?? 0;
    expect(close).toBeGreaterThan(far);
    expect(fieldAt(20, 80, [])).toBeUndefined();
  });
});

describe('the gradient', () => {
  it('is the level colour at the middle of each band, and smooth in between', () => {
    expect(gradientColour(25)).toEqual([0xa9, 0xd6, 0x7e]);
    const between = gradientColour(60);
    const good = gradientColour(25);
    const moderate = gradientColour(75.5);
    expect(between[0]).toBeGreaterThan(Math.min(good[0], moderate[0]) - 1);
    expect(between[0]).toBeLessThan(Math.max(good[0], moderate[0]) + 1);
    expect(gradientColour(-5)).toEqual(gradientColour(0));
    expect(gradientColour(9999)).toEqual(gradientColour(500));
  });

  it('has a colour for every level', () => {
    for (const level of LEVELS) expect(gradientColour(level.from + 1)).toHaveLength(3);
  });
});

describe('the field as grids', () => {
  it('gives an AQI and a confidence for each cell, nothing over empty ground and fading at the corner', () => {
    const { aqi, confidence } = sampleField([at(20, 80, 120)], 36, 36);
    expect(aqi).toHaveLength(36 * 36);
    expect(Math.max(...confidence)).toBeGreaterThan(0.2);
    expect(Array.from(confidence).some((c) => c === 0)).toBe(true);
    expect(Math.max(...aqi)).toBeCloseTo(120, 0);
  });

  it('puts the mercator rows in order, north above south', () => {
    expect(mercatorY(FIELD_BOUNDS.north)).toBeLessThan(mercatorY(FIELD_BOUNDS.south));
  });
});

describe('the field for what is on screen', () => {
  const monitors = [
    { id: 'a', name: 'A', lat: 28.6, lng: 77.2, aqi: 180, pm25: 100, ageMinutes: 10 },
    { id: 'b', name: 'B', lat: 31.1, lng: 75.4, aqi: 90, pm25: 30, ageMinutes: 10 },
    { id: 'c', name: 'C', lat: -33.9, lng: 151.2, aqi: 40, pm25: 9, ageMinutes: 10 },
    { id: 'd', name: 'D', lat: 51.5, lng: -0.1, aqi: 60, pm25: 17, ageMinutes: 10 },
  ];

  it('gives the same answer through the index as by looking at every monitor', () => {
    const index = indexMonitors(monitors);
    for (const [lat, lng] of [
      [28.7, 77.3],
      [30, 76],
      [-30, 150],
      [51, 0],
      [0, 0],
      [60, 170],
      [40, 179.5],
    ] as const) {
      const direct = fieldAt(lat, lng, monitors);
      const indexed = fieldAtIndexed(lat, lng, index);
      expect(indexed === undefined, `${String(lat)},${String(lng)}`).toBe(direct === undefined);
      if (direct !== undefined && indexed !== undefined) {
        expect(indexed.aqi).toBeCloseTo(direct.aqi, 6);
        expect(indexed.confidence).toBeCloseTo(direct.confidence, 6);
      }
    }
  });

  it('takes only the part of a tile that is on screen, with a little over, and none when it is off screen', () => {
    const tile = { west: 0, east: 90, south: -80, north: 80 };
    const view = { west: 70, east: 80, south: 20, north: 30 };
    const window = visibleWindow(tile, view);
    expect(window?.west).toBeCloseTo(68.5, 5);
    expect(window?.east).toBeCloseTo(81.5, 5);
    expect(window?.north).toBeCloseTo(31.5, 5);
    expect(visibleWindow(tile, { west: 120, east: 130, south: 0, north: 10 })).toBeUndefined();
  });
});
