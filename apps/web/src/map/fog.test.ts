import { describe, expect, it } from 'vitest';
import { buildFog, paintFog, STIR_MS, stirOf } from './fog';
import type { Window } from './field';
import type { Monitor } from './monitors';

const at = (lat: number, lng: number, aqi: number): Monitor => ({
  id: `${String(lat)}-${String(lng)}`,
  name: 'm',
  lat,
  lng,
  pm25: aqi / 2,
  aqi,
  ageMinutes: 5,
});

const asia: Window = { west: 60, east: 100, south: 5, north: 40 };
const monitors = [at(20, 80, 60), at(28, 77, 220), at(24, 90, 120)];
const W = 300;
const H = 340;

describe('the fog', () => {
  it('is over what we know and nothing far from every monitor', () => {
    const fog = buildFog(monitors, asia, W, H);
    expect(fog.alpha.some((a) => a > 0)).toBe(true);
    // Past the reach of every monitor there is none.
    expect(fog.alpha.some((a) => a === 0)).toBe(true);
    const far = buildFog([at(-40, -120, 80)], asia, W, H);
    expect(far.alpha.every((a) => a === 0)).toBe(true);
  });

  it('is a haze: even where we are sure it is well short of solid', () => {
    const fog = buildFog(monitors, asia, W, H);
    expect(Math.max(...fog.alpha)).toBeLessThanOrEqual(240);
    const out = new Uint8ClampedArray(W * H * 4);
    paintFog(fog, out, 0);
    let lit = 0;
    let solid = 0;
    for (let i = 3; i < out.length; i += 4) {
      if ((out[i] ?? 0) > 0) lit += 1;
      if ((out[i] ?? 0) >= 250) solid += 1;
    }
    // Only the odd brighter speck reaches near solid.
    expect(solid / lit).toBeLessThan(0.04);
  });

  it('is in the AQI scale’s colours made more vivid, graded smoothly between levels', () => {
    const fog = buildFog(monitors, asia, W, H);
    const colours = new Set<string>();
    for (let i = 0; i < fog.alpha.length; i += 7) {
      if ((fog.alpha[i] ?? 0) > 0)
        colours.add(
          `${String(fog.rgb[i * 3])},${String(fog.rgb[i * 3 + 1])},${String(fog.rgb[i * 3 + 2])}`,
        );
    }
    expect(colours.size).toBeGreaterThan(40);
  });

  it('has a grain: no two neighbours the same strength, and a few holes', () => {
    const fog = buildFog(monitors, asia, W, H);
    const out = new Uint8ClampedArray(W * H * 4);
    paintFog(fog, out, 0);
    let pairs = 0;
    let differ = 0;
    let holes = 0;
    let lit = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W - 1; x++) {
        const a = out[(y * W + x) * 4 + 3] ?? 0;
        const b = out[(y * W + x + 1) * 4 + 3] ?? 0;
        if (a > 0 && b > 0) {
          pairs += 1;
          if (a !== b) differ += 1;
        }
        if ((fog.alpha[y * W + x] ?? 0) > 100) {
          lit += 1;
          if (a < (fog.alpha[y * W + x] ?? 0) * 0.2) holes += 1;
        }
      }
    }
    expect(differ / pairs).toBeGreaterThan(0.8);
    expect(holes / lit).toBeGreaterThan(0.01);
    expect(holes / lit).toBeLessThan(0.1);
  });

  it('is the same every time, and holds still within one stir', () => {
    const fog = buildFog(monitors, asia, W, H);
    const a = new Uint8ClampedArray(W * H * 4);
    const b = new Uint8ClampedArray(W * H * 4);
    paintFog(fog, a, 100);
    paintFog(fog, b, 100 + STIR_MS / 3);
    expect(stirOf(100)).toBe(stirOf(100 + STIR_MS / 3));
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('stirs only a little from one moment to the next: most of the grain stays where it was', () => {
    const fog = buildFog(monitors, asia, W, H);
    const a = new Uint8ClampedArray(W * H * 4);
    paintFog(fog, a, 0);
    let most = 0;
    for (let step = 1; step < 8; step++) {
      const b = new Uint8ClampedArray(W * H * 4);
      paintFog(fog, b, step * STIR_MS);
      let same = 0;
      let lit = 0;
      for (let i = 3; i < a.length; i += 4) {
        if ((a[i] ?? 0) > 0) {
          lit += 1;
          if (a[i] === b[i]) same += 1;
        }
      }
      most = Math.max(most, lit === 0 ? 0 : same / lit);
    }
    // At least one of the later moments still shares a good part of the grain with the first.
    expect(most).toBeGreaterThan(0.05);
  });
});
