import type { Map as MapLibreMap } from 'maplibre-gl';
import { describe, expect, it } from 'vitest';
import { applyBasemapTheme, darkenColour, darkenValue, parseColour } from './darkBasemap';

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
    expect(lightness(darkenColour('#000000', 'surface'))).toBeLessThan(0.45);
    expect(lightness(darkenColour('#334155', 'text'))).toBeGreaterThan(0.7);
    expect(lightness(darkenColour('#ffffff', 'halo'))).toBeLessThan(0.15);
  });

  it('keeps ground turned over but a road paler than the ground it crosses, so it stands out', () => {
    const land = lightness(darkenColour('#f2f3f0', 'surface'));
    const road = lightness(darkenColour('#ffffff', 'line'));
    expect(road).toBeGreaterThan(land + 0.1);
    expect(lightness(darkenColour('#cccccc', 'line'))).toBeLessThan(road);
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

describe('applyBasemapTheme', () => {
  // A stand-in for MapLibre, which throws when asked for a paint property the layer's kind does not have.
  const allowed: Record<string, string[]> = {
    background: ['background-color'],
    fill: ['fill-color', 'fill-outline-color'],
    line: ['line-color'],
    symbol: ['text-color', 'text-halo-color', 'icon-color', 'icon-halo-color'],
  };
  const fakeMap = (): { map: MapLibreMap; paint: Record<string, Record<string, unknown>> } => {
    const layers = [
      { id: 'bg', type: 'background' },
      { id: 'water', type: 'fill' },
      { id: 'road', type: 'line' },
      { id: 'label', type: 'symbol' },
      { id: 'ours', type: 'fill' },
    ];
    const paint: Record<string, Record<string, unknown>> = {
      bg: { 'background-color': '#eef2f7' },
      water: { 'fill-color': '#d6e4f0' },
      road: { 'line-color': ['interpolate', ['linear'], ['zoom'], 5, '#ffffff', 10, '#cccccc'] },
      label: { 'text-color': '#334155', 'text-halo-color': '#ffffff' },
      ours: { 'fill-color': '#ff0000' },
    };
    const kind = (id: string): string => layers.find((l) => l.id === id)?.type ?? '';
    const check = (id: string, prop: string): void => {
      if (!allowed[kind(id)]?.includes(prop)) throw new TypeError("Cannot read properties of undefined (reading 'value')");
    };
    const map = {
      getStyle: () => ({ layers }),
      getPaintProperty: (id: string, prop: string) => {
        check(id, prop);
        return paint[id]?.[prop];
      },
      setPaintProperty: (id: string, prop: string, value: unknown) => {
        check(id, prop);
        (paint[id] ??= {})[prop] = value;
      },
    } as unknown as MapLibreMap;
    return { map, paint };
  };
  const base = new Set(['bg', 'water', 'road', 'label']);

  it('darkens the base layers only, asks each kind only for its own properties, and puts the light look back', () => {
    const { map, paint } = fakeMap();
    expect(() => {
      applyBasemapTheme(map, base, true);
    }).not.toThrow();
    expect(lightness(paint.bg?.['background-color'] as string)).toBeLessThan(0.15);
    expect(lightness(paint.label?.['text-color'] as string)).toBeGreaterThan(0.7);
    expect(paint.ours?.['fill-color']).toBe('#ff0000');
    applyBasemapTheme(map, base, false);
    expect(paint.bg?.['background-color']).toBe('#eef2f7');
    expect(paint.road?.['line-color']).toEqual(['interpolate', ['linear'], ['zoom'], 5, '#ffffff', 10, '#cccccc']);
  });
});
