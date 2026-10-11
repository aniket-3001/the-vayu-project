import { describe, expect, it } from 'vitest';
import { gradientColour } from './field';
import { buildFog, paintFog } from './fog';
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

describe('the colour wash', () => {
  it('is over what we know and nothing far from every monitor', () => {
    const fog = buildFog(monitors, asia, W, H);
    expect(fog.alpha.some((a) => a > 0)).toBe(true);
    // Past the reach of every monitor there is none.
    expect(fog.alpha.some((a) => a === 0)).toBe(true);
    const far = buildFog([at(-40, -120, 80)], asia, W, H);
    expect(far.alpha.every((a) => a === 0)).toBe(true);
  });

  it('is deep but translucent: strong where we are sure, never solid', () => {
    const fog = buildFog(monitors, asia, W, H);
    const strongest = Math.max(...fog.alpha);
    expect(strongest).toBeGreaterThan(150);
    expect(strongest).toBeLessThan(255);
  });

  it('is smooth: no grain, neighbouring pixels differ only a little', () => {
    const fog = buildFog(monitors, asia, W, H);
    const out = new Uint8ClampedArray(W * H * 4);
    paintFog(fog, out);
    let biggest = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W - 1; x++) {
        const a = out[(y * W + x) * 4 + 3] ?? 0;
        const b = out[(y * W + x + 1) * 4 + 3] ?? 0;
        if (a > 0 && b > 0) biggest = Math.max(biggest, Math.abs(a - b));
      }
    }
    expect(biggest).toBeLessThan(20);
  });

  it('is darker and more vivid than the scale’s own pastels, and graded through many shades', () => {
    const fog = buildFog(monitors, asia, W, H);
    const colours = new Set<string>();
    let darker = 0;
    let counted = 0;
    for (let i = 0; i < fog.alpha.length; i += 5) {
      if ((fog.alpha[i] ?? 0) < 100) continue;
      colours.add(
        `${String(fog.rgb[i * 3])},${String(fog.rgb[i * 3 + 1])},${String(fog.rgb[i * 3 + 2])}`,
      );
      counted += 1;
      const lum = (fog.rgb[i * 3] ?? 0) + (fog.rgb[i * 3 + 1] ?? 0) + (fog.rgb[i * 3 + 2] ?? 0);
      const [r, g, b] = gradientColour(120);
      if (lum < r + g + b) darker += 1;
    }
    expect(colours.size).toBeGreaterThan(40);
    expect(darker / counted).toBeGreaterThan(0.5);
  });

  it('is the same every time: it holds still', () => {
    const a = new Uint8ClampedArray(W * H * 4);
    const b = new Uint8ClampedArray(W * H * 4);
    paintFog(buildFog(monitors, asia, W, H), a);
    paintFog(buildFog(monitors, asia, W, H), b);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
