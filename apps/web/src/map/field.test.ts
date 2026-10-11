import { describe, expect, it } from 'vitest';
import { LEVELS } from '../design/levels';
import {
  FIELD_BOUNDS,
  REACH_DEG,
  fieldAt,
  gradientColour,
  grainyField,
  fieldAtIndexed,
  indexMonitors,
  visibleWindow,
  mercatorY,
  renderField,
} from './field';
import { sampleMonitors, type Monitor } from './monitors';

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

describe('the rendered field', () => {
  it('is one RGBA pixel per cell, transparent over empty ground and coloured over monitors', () => {
    const cols = 34;
    const rows = 36;
    const pixels = renderField(sampleMonitors(), cols, rows);
    expect(pixels).toHaveLength(cols * rows * 4);
    const alphas: number[] = [];
    for (let i = 3; i < pixels.length; i += 4) alphas.push(pixels[i] ?? 0);
    expect(alphas.some((a) => a === 0)).toBe(true);
    expect(alphas.some((a) => a > 120)).toBe(true);
    expect(Math.max(...alphas)).toBeLessThanOrEqual(215);
    // Washed out: even the strongest pixel stays well short of solid.
    expect(Math.max(...alphas)).toBeLessThan(230);
  });

  it('puts the mercator rows in order, north above south', () => {
    expect(mercatorY(FIELD_BOUNDS.north)).toBeLessThan(mercatorY(FIELD_BOUNDS.south));
  });
});

describe('the edge of the field', () => {
  it('fades to nothing at the corner of the data, so there is no hard box', () => {
    // Monitors every two degrees over the whole world, so only the edge of the picture can fade.
    const everywhere = Array.from({ length: 81 }, (_, i) =>
      Array.from({ length: 181 }, (_, j) =>
        at(FIELD_BOUNDS.south + i * 2, FIELD_BOUNDS.west + j * 2, 100),
      ),
    ).flat();
    const cols = 72;
    const rows = 36;
    const px = renderField(everywhere, cols, rows);
    const alpha = (row: number, col: number): number => px[(row * cols + col) * 4 + 3] ?? 0;
    expect(alpha(0, 0)).toBeLessThan(alpha(18, 36) / 3);
    expect(alpha(18, 36)).toBeGreaterThan(70);
  });
});

describe('the fine grain', () => {
  const monitors = [at(20, 80, 120), at(25, 85, 60)];
  /** A window over south Asia, where those two are, so the picture has pixels near them. */
  const asia = { west: 60, east: 100, south: 5, north: 40 };

  it('is a picture `scale` times finer than the field, with four bytes a pixel', () => {
    const { pixels, width, height } = grainyField(monitors, 20, 22, 5, asia);
    expect(width).toBe(100);
    expect(height).toBe(110);
    expect(pixels).toHaveLength(100 * 110 * 4);
  });

  it('is the same every time, so it does not shimmer', () => {
    const a = grainyField(monitors, 20, 22, 4, asia).pixels;
    const b = grainyField(monitors, 20, 22, 4, asia).pixels;
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('roughens each pixel on its own, with specks and holes, and not in blocks', () => {
    const { pixels, width, height } = grainyField(monitors, 40, 44, 6, asia);
    const alphas = new Set<number>();
    let neighbours = 0;
    let differ = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width - 1; x++) {
        const i = (y * width + x) * 4 + 3;
        const a = pixels[i] ?? 0;
        const b = pixels[i + 4] ?? 0;
        if (a > 40 && b > 40) {
          alphas.add(a);
          neighbours += 1;
          if (a !== b) differ += 1;
        }
      }
    }
    expect(alphas.size).toBeGreaterThan(60);
    expect(differ / neighbours).toBeGreaterThan(0.8);
  });

  it('keeps colour at the level colours and is empty far from any monitor', () => {
    const { pixels, width, height } = grainyField(monitors, 40, 44, 4, asia);
    expect(pixels[3]).toBe(0);
    let strong = 0;
    for (let i = 3; i < pixels.length; i += 4) if ((pixels[i] ?? 0) > 100) strong += 1;
    expect(strong).toBeGreaterThan(200);
    expect(strong).toBeLessThan(width * height);
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

  it('keeps the grain on the ground: the same place has the same grain in two different windows', () => {
    const wide = grainyField(monitors, 40, 40, 4, { west: 60, east: 100, south: 10, north: 40 });
    const narrow = grainyField(monitors, 40, 40, 4, { west: 60, east: 100, south: 10, north: 40 });
    expect(Array.from(wide.pixels.slice(0, 400))).toEqual(Array.from(narrow.pixels.slice(0, 400)));
  });
});
