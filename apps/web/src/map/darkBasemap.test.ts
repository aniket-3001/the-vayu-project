import { describe, expect, it } from 'vitest';
import { darkenColour, darkenValue, parseColour } from './darkBasemap';

const lightness = (text: string | undefined): number => {
  const c = parseColour(text ?? '');
  if (c === undefined) throw new Error(`not a colour: ${String(text)}`);
  return c.l;
};

describe('darkenColour', () => {
  it('reads the colour forms the base map uses', () => {
    expect(parseColour('#fff')?.l).toBeCloseTo(1);
    expect(parseColour('#000000')?.l).toBeCloseTo(0);
    expect(parseColour('rgb(255, 0, 0)')?.h).toBeCloseTo(0);
    expect(parseColour('hsl(120, 50%, 40%)')?.l).toBeCloseTo(0.4);
    expect(parseColour('hsla(210, 20%, 80%, 0.5)')?.a).toBeCloseTo(0.5);
    expect(parseColour('interpolate')).toBeUndefined();
  });

  it('makes ground dark, writing light, and halos dark', () => {
    expect(lightness(darkenColour('#eef2f7', 'surface'))).toBeLessThan(0.15);
    expect(lightness(darkenColour('#ffffff', 'surface'))).toBeLessThan(0.15);
    expect(lightness(darkenColour('#334155', 'text'))).toBeGreaterThan(0.7);
    expect(lightness(darkenColour('#ffffff', 'halo'))).toBeLessThan(0.15);
  });

  it('keeps the order of the greys, turned over, so features still stand apart', () => {
    const land = lightness(darkenColour('#e0e0e0', 'surface'));
    const road = lightness(darkenColour('#ffffff', 'surface'));
    expect(land).toBeGreaterThan(road);
  });
});

describe('darkenValue', () => {
  it('reaches colours inside zoom expressions and leaves the operators alone', () => {
    const out = darkenValue(['interpolate', ['linear'], ['zoom'], 5, '#ffffff', 10, '#cccccc'], 'surface') as unknown[];
    expect(out[0]).toBe('interpolate');
    expect(out[2]).toEqual(['zoom']);
    expect(lightness(out[4] as string)).toBeLessThan(0.15);
    expect(typeof out[5]).toBe('number');
  });

  it('turns the stops of an old-style function', () => {
    const out = darkenValue({ base: 1, stops: [[5, '#ffffff']] }, 'surface') as { base: number; stops: [number, string][] };
    expect(out.base).toBe(1);
    expect(lightness(out.stops[0]?.[1])).toBeLessThan(0.15);
  });
});
