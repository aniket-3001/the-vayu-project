import { describe, expect, it } from 'vitest';
import { LEVELS } from '../design/levels';
import { FIELD_BOUNDS, REACH_DEG, fieldAt, gradientColour, mercatorY, renderField } from './field';
import { sampleMonitors, type Monitor } from './monitors';

const at = (lat: number, lng: number, aqi: number): Monitor => ({
  id: String(lat),
  name: 'm',
  lat,
  lng,
  pm25: aqi / 2,
  aqi,
  ageMinutes: 5,
  kind: 'government',
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
    expect(alphas.some((a) => a > 150)).toBe(true);
    expect(Math.max(...alphas)).toBeLessThanOrEqual(215);
  });

  it('puts the mercator rows in order, north above south', () => {
    expect(mercatorY(FIELD_BOUNDS.north)).toBeLessThan(mercatorY(FIELD_BOUNDS.south));
  });
});
