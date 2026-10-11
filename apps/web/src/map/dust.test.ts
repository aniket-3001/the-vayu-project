import { describe, expect, it } from 'vitest';
import { buildDust, paintDust } from './dust';
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
const W = 360;
const H = 420;

describe('the dust', () => {
  it('is a cloud of specks over what we know, and nothing far from every monitor', () => {
    const dust = buildDust(monitors, asia, W, H);
    expect(dust.count).toBeGreaterThan(2000);
    // A window with no monitor in reach has none.
    const far = buildDust([at(-40, -120, 80)], asia, W, H);
    expect(far.count).toBe(0);
  });

  it('is the same every time, and the same place has the same dust', () => {
    const a = buildDust(monitors, asia, W, H);
    const b = buildDust(monitors, asia, W, H);
    expect(a.count).toBe(b.count);
    expect(Array.from(a.x.slice(0, 50))).toEqual(Array.from(b.x.slice(0, 50)));
  });

  it('is in the colours of the AQI scale, smoothly graded between levels, with a few gold glints', () => {
    const dust = buildDust(monitors, asia, W, H);
    const colours = new Set<string>();
    let glints = 0;
    for (let i = 0; i < dust.count; i++) {
      colours.add(
        `${String(dust.rgba[i * 4])},${String(dust.rgba[i * 4 + 1])},${String(dust.rgba[i * 4 + 2])}`,
      );
      if ((dust.glint[i] ?? 0) > 0) glints += 1;
    }
    // Many shades, not six: it is a gradient.
    expect(colours.size).toBeGreaterThan(30);
    expect(glints).toBeGreaterThan(20);
    expect(glints).toBeLessThan(dust.count / 5);
  });

  it('is translucent: no speck is fully opaque on its own', () => {
    const dust = buildDust(monitors, asia, W, H);
    let strongest = 0;
    for (let i = 0; i < dust.count; i++) strongest = Math.max(strongest, dust.rgba[i * 4 + 3] ?? 0);
    expect(strongest).toBeLessThanOrEqual(255);
    const puffs = Array.from({ length: dust.count }, (_, i) => i).filter((i) => dust.size[i] === 3);
    expect(puffs.length).toBeGreaterThan(0);
    for (const i of puffs.slice(0, 200)) expect(dust.rgba[i * 4 + 3]).toBeLessThan(110);
  });

  it('keeps each speck near its place but moves it from one moment to the next', () => {
    const dust = buildDust(monitors, asia, W, H);
    const a = new Uint8ClampedArray(W * H * 4);
    const b = new Uint8ClampedArray(W * H * 4);
    paintDust(dust, a, 0);
    paintDust(dust, b, 500);
    let lit = 0;
    let differs = 0;
    for (let i = 3; i < a.length; i += 4) {
      if ((a[i] ?? 0) > 0 || (b[i] ?? 0) > 0) {
        lit += 1;
        if (a[i] !== b[i]) differs += 1;
      }
    }
    expect(lit).toBeGreaterThan(1000);
    // They shift, but most of the cloud is still where it was: it is a jostle, not a drift.
    expect(differs).toBeGreaterThan(lit * 0.05);
    expect(differs).toBeLessThan(lit * 0.9);
  });

  it('holds still when asked for the same moment twice', () => {
    const dust = buildDust(monitors, asia, W, H);
    const a = new Uint8ClampedArray(W * H * 4);
    const b = new Uint8ClampedArray(W * H * 4);
    paintDust(dust, a, 1234);
    paintDust(dust, b, 1234);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
