import { describe, expect, it } from 'vitest';
import { WIND_RANGE, windPixels } from './windTexture';
import type { WindPoint } from './live';

const decode = (byte: number): number => (byte / 255) * 2 * WIND_RANGE - WIND_RANGE;
const at = (lat: number, lng: number, speed: number, fromDeg: number): WindPoint => ({
  lat,
  lng,
  speed,
  fromDeg,
});

describe('the wind picture', () => {
  const bounds = { west: 0, east: 10, south: 0, north: 10 };

  it('holds eastward speed in red and northward in green, for a wind blowing from the west', () => {
    const px = windPixels([at(5, 5, 10, 270)], 4, 4, bounds);
    expect(decode(px[0] ?? 0)).toBeGreaterThan(9);
    expect(Math.abs(decode(px[1] ?? 0))).toBeLessThan(0.3);
    expect(px[3]).toBe(255);
  });

  it('turns a wind from the south into northward flow, and from the north into southward', () => {
    expect(decode(windPixels([at(5, 5, 8, 180)], 2, 2, bounds)[1] ?? 0)).toBeGreaterThan(7);
    expect(decode(windPixels([at(5, 5, 8, 0)], 2, 2, bounds)[1] ?? 0)).toBeLessThan(-7);
  });

  it('blends between two winds and is one pixel of four bytes for each cell', () => {
    const px = windPixels([at(5, 0, 10, 270), at(5, 10, 10, 90)], 10, 2, bounds);
    expect(px).toHaveLength(10 * 2 * 4);
    const left = decode(px[0] ?? 0);
    const right = decode(px[(10 - 1) * 4] ?? 0);
    expect(left).toBeGreaterThan(0);
    expect(right).toBeLessThan(0);
  });

  it('keeps speeds past the range from wrapping, and has a still picture when there are no points', () => {
    expect(decode(windPixels([at(5, 5, 90, 270)], 2, 2, bounds)[0] ?? 0)).toBeCloseTo(
      WIND_RANGE,
      0,
    );
    expect(decode(windPixels([], 2, 2, bounds)[0] ?? 0)).toBeCloseTo(0, 0);
  });
});

describe('the wind field', () => {
  it('gives the wind at any point from the grid, and stays in range off the edge', async () => {
    const { makeWindField } = await import('./windTexture');
    const { GRID } = await import('./live');
    const mid = { lat: (GRID.north + GRID.south) / 2, lng: (GRID.east + GRID.west) / 2 };
    const field = makeWindField([at(mid.lat, mid.lng, 6, 270)]);
    const here = field(mid.lat, mid.lng);
    expect(here.u).toBeGreaterThan(5);
    expect(Math.abs(here.v)).toBeLessThan(0.5);
    const off = field(-50, 200);
    expect(Number.isFinite(off.u)).toBe(true);
    expect(Number.isFinite(off.v)).toBe(true);
  });
});
