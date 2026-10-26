import type { Map as MapLibreMap } from 'maplibre-gl';

/** MapLibre types paint names as a closed set; the names here are checked against the style at run time. */
type PaintName = Parameters<MapLibreMap['setPaintProperty']>[1];

/** What a colour is used for decides how it is turned over: ground goes dark, writing goes light. */
export type Role = 'surface' | 'text' | 'halo';

/** The paint properties of the base map that hold a colour, and what each is for. */
const COLOUR_PROPS: Readonly<Record<string, Role>> = {
  'background-color': 'surface',
  'fill-color': 'surface',
  'fill-outline-color': 'surface',
  'line-color': 'surface',
  'fill-extrusion-color': 'surface',
  'text-color': 'text',
  'icon-color': 'text',
  'text-halo-color': 'halo',
  'icon-halo-color': 'halo',
};

interface Hsla {
  readonly h: number;
  readonly s: number;
  readonly l: number;
  readonly a: number;
}

const clamp = (n: number, low = 0, high = 1): number => Math.min(high, Math.max(low, n));

function fromRgb(r: number, g: number, b: number, a: number): Hsla {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l, a };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h =
    max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l, a };
}

/** Reads `#rgb`, `#rrggbb`, `rgb()`, `rgba()`, `hsl()` and `hsla()`; anything else is not a colour. */
export function parseColour(text: string): Hsla | undefined {
  const value = text.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/u.exec(value)?.[1];
  if (hex !== undefined) {
    const full = hex.length === 3 ? hex.replace(/./gu, (c) => c + c) : hex;
    const n = (i: number): number => parseInt(full.slice(i, i + 2), 16) / 255;
    return fromRgb(n(0), n(2), n(4), 1);
  }
  const fn = /^(rgba?|hsla?)\(([^)]*)\)$/u.exec(value);
  if (fn === null) return undefined;
  const parts = (fn[2] ?? '').split(/[\s,/]+/u).filter((p) => p !== '');
  if (parts.length < 3) return undefined;
  const num = (p: string | undefined, scale = 1): number => {
    const x = parseFloat(p ?? '');
    return Number.isNaN(x) ? 0 : p?.endsWith('%') === true ? x / 100 : x / scale;
  };
  const a = parts[3] === undefined ? 1 : num(parts[3]);
  if (fn[1]?.startsWith('rgb') === true) return fromRgb(num(parts[0], 255), num(parts[1], 255), num(parts[2], 255), a);
  return { h: parseFloat(parts[0] ?? '0') || 0, s: num(parts[1]), l: num(parts[2]), a };
}

/** A light colour as its dark-look twin: lightness is flipped and squeezed so the ground stays dark. */
export function darkenColour(text: string, role: Role): string | undefined {
  const c = parseColour(text);
  if (c === undefined) return undefined;
  const flipped = 1 - c.l;
  const l =
    role === 'text' ? clamp(0.5 + flipped * 0.45, 0.55, 0.92) : role === 'halo' ? 0.09 : 0.07 + flipped * 0.2;
  const s = c.s * 0.75;
  return `hsla(${c.h.toFixed(0)}, ${(s * 100).toFixed(0)}%, ${(l * 100).toFixed(1)}%, ${c.a.toFixed(3)})`;
}

/** Turns every colour inside a paint value (a plain colour, or one inside a zoom or data expression). */
export function darkenValue(value: unknown, role: Role): unknown {
  if (typeof value === 'string') return darkenColour(value, role) ?? value;
  if (Array.isArray(value)) return value.map((item: unknown) => darkenValue(item, role));
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, key === 'stops' ? darkenValue(item, role) : item]),
    );
  return value;
}

const originals = new WeakMap<MapLibreMap, Map<string, unknown>>();

/**
 * Shows the base map's own layers (ground, water, roads, writing) light or dark. The layers added on top of it, the
 * air and the monitors, are left alone, which is why only the named base layers are touched.
 */
export function applyBasemapTheme(map: MapLibreMap, baseLayerIds: ReadonlySet<string>, dark: boolean): void {
  let saved = originals.get(map);
  if (saved === undefined) {
    saved = new Map();
    originals.set(map, saved);
  }
  for (const layer of map.getStyle().layers) {
    if (!baseLayerIds.has(layer.id)) continue;
    for (const [prop, role] of Object.entries(COLOUR_PROPS)) {
      const name = prop as PaintName;
      const key = `${layer.id}|${prop}`;
      if (!saved.has(key)) saved.set(key, map.getPaintProperty(layer.id, name));
      const original = saved.get(key);
      if (original === undefined) continue;
      try {
        map.setPaintProperty(layer.id, name, (dark ? darkenValue(original, role) : original) as never);
      } catch {
        // A property this layer cannot take: leave it as the style had it.
      }
    }
  }
}
