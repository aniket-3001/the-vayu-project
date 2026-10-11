import { LEVELS } from '../design/levels';
import type { Monitor } from './monitors';

/** The patch of the world the colour field covers, in degrees. */
export const FIELD_BOUNDS = { west: -180, east: 180, south: -80, north: 80 } as const;

/** How far from a monitor, in degrees, the field still colours anything. Past this we have no idea, so we say nothing. */
export const REACH_DEG = 4;

const distanceDeg = (lat: number, lng: number, m: Monitor): number => {
  const dLat = lat - m.lat;
  const dLng = (lng - m.lng) * Math.cos((lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
};

export interface FieldValue {
  /** Estimated AQI at the point. */
  readonly aqi: number;
  /** 0 where we know nothing, 1 on top of a monitor. */
  readonly confidence: number;
}

/**
 * An estimate of the AQI between monitors: an inverse-distance blend of those nearby, fading to nothing
 * far from every monitor. This is a model, not a measurement, and the map says so.
 */
export function fieldAt(
  lat: number,
  lng: number,
  monitors: readonly Monitor[],
): FieldValue | undefined {
  let weightSum = 0;
  let valueSum = 0;
  let nearest = Infinity;
  for (const m of monitors) {
    const d = distanceDeg(lat, lng, m);
    nearest = Math.min(nearest, d);
    if (d > REACH_DEG * 1.6) continue;
    const w = 1 / Math.max(d, 0.05) ** 2;
    weightSum += w;
    valueSum += w * m.aqi;
  }
  if (weightSum === 0 || nearest >= REACH_DEG) return undefined;
  const confidence = Math.max(0, 1 - nearest / REACH_DEG) ** 0.7;
  return { aqi: valueSum / weightSum, confidence };
}

/** The monitors in 4-degree cells, so a point looks only at those near it and not at all of them. */
const CELL_DEG = 4;
export interface FieldIndex {
  readonly cells: ReadonlyMap<string, readonly Monitor[]>;
}
const cellKey = (lat: number, lng: number): string =>
  `${String(Math.floor(lat / CELL_DEG))}:${String(Math.floor(lng / CELL_DEG))}`;

export function indexMonitors(monitors: readonly Monitor[]): FieldIndex {
  const cells = new Map<string, Monitor[]>();
  for (const m of monitors) {
    const key = cellKey(m.lat, m.lng);
    const list = cells.get(key);
    if (list === undefined) cells.set(key, [m]);
    else list.push(m);
  }
  return { cells };
}

/** `fieldAt` over an index: the same answer, looking only at the cells within reach. */
export function fieldAtIndexed(
  lat: number,
  lng: number,
  index: FieldIndex,
): FieldValue | undefined {
  const reach = REACH_DEG * 1.6;
  const rowsOut = Math.ceil(reach / CELL_DEG);
  const colsOut = Math.min(
    12,
    Math.ceil(reach / (CELL_DEG * Math.max(0.2, Math.cos((lat * Math.PI) / 180)))),
  );
  const row = Math.floor(lat / CELL_DEG);
  const col = Math.floor(lng / CELL_DEG);
  const wrap = Math.round(360 / CELL_DEG);
  const nearby: Monitor[] = [];
  for (let dr = -rowsOut; dr <= rowsOut; dr++) {
    for (let dc = -colsOut; dc <= colsOut; dc++) {
      const c = ((((col + dc) % wrap) + wrap + wrap / 2) % wrap) - wrap / 2;
      const cell = index.cells.get(`${String(row + dr)}:${String(c)}`);
      if (cell !== undefined) nearby.push(...cell);
    }
  }
  return fieldAt(lat, lng, nearby);
}

const hexToRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/**
 * The colour of an AQI, blended smoothly between the level colours (each level's colour sits at the
 * middle of its band), so the map shows a gradient and not stripes.
 */
export function gradientColour(aqi: number): [number, number, number] {
  const stops = LEVELS.map((level, i) => {
    const next = LEVELS[i + 1]?.from ?? 501;
    return { at: (level.from + next - 1) / 2, rgb: hexToRgb(level.solid) };
  });
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (first === undefined || last === undefined) return [0, 0, 0];
  if (aqi <= first.at) return first.rgb;
  if (aqi >= last.at) return last.rgb;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (a !== undefined && b !== undefined && aqi >= a.at && aqi <= b.at) {
      const t = (aqi - a.at) / (b.at - a.at);
      return [0, 1, 2].map((k) =>
        Math.round((a.rgb[k] ?? 0) + ((b.rgb[k] ?? 0) - (a.rgb[k] ?? 0)) * t),
      ) as [number, number, number];
    }
  }
  return last.rgb;
}

/** Web-mercator y for a latitude, 0 to 1 from the top, so a picture of the field lines up on the map. */
export const mercatorY = (lat: number): number => {
  const s = Math.sin((lat * Math.PI) / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
};

const latOfMercatorY = (y: number): number =>
  (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;

/** A repeatable number between 0 and 1 for a pixel, so the grain does not shimmer from one draw to the next. */
const noise = (col: number, row: number): number => {
  let h = (col * 374761393 + row * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

/** A window onto the field, in degrees: the whole world is drawn as several of these side by side. */
export interface Window {
  readonly west: number;
  readonly east: number;
  readonly south: number;
  readonly north: number;
}

/**
 * The world in four pictures, each a quarter of the way round. One picture three hundred and sixty degrees wide
 * cannot be placed on a map (its corners would be on opposite sides of the globe), so each is placed on its own.
 */
export const FIELD_TILES: readonly Window[] = [-180, -90, 0, 90].map((west) => ({
  west,
  east: west + 90,
  south: FIELD_BOUNDS.south,
  north: FIELD_BOUNDS.north,
}));

/** RGBA pixels for the field over a window (all of `FIELD_BOUNDS` by default), rows spaced evenly in mercator y. */
export function renderField(
  monitors: readonly Monitor[],
  cols: number,
  rows: number,
  window: Window = FIELD_BOUNDS,
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(cols * rows * 4);
  const index = indexMonitors(monitors);
  const yTop = mercatorY(window.north);
  const yBottom = mercatorY(window.south);
  for (let row = 0; row < rows; row++) {
    const lat = latOfMercatorY(yTop + ((row + 0.5) / rows) * (yBottom - yTop));
    for (let col = 0; col < cols; col++) {
      const lng = window.west + ((col + 0.5) / cols) * (window.east - window.west);
      const value = fieldAtIndexed(lat, lng, index);
      if (value === undefined) continue;
      const [r, g, b] = gradientColour(value.aqi);
      const i = (row * cols + col) * 4;
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      const edge = Math.min(
        lat - FIELD_BOUNDS.south,
        FIELD_BOUNDS.north - lat,
        lng - FIELD_BOUNDS.west,
        FIELD_BOUNDS.east - lng,
      );
      // Fade out towards the edge of the data, so the field does not end in a hard box.
      pixels[i + 3] = Math.round(value.confidence * Math.min(1, edge / 3) * 215);
    }
  }
  return pixels;
}

/**
 * The field as a fine picture: the smooth colours are stretched up by `scale` with bilinear blending, then
 * every pixel is roughened with grain, so the air reads like dust or fog and not like blocks. A few pixels are
 * brighter specks and a few are holes. The grain is a fixed pattern, so it does not shimmer between draws.
 */
export function grainyField(
  monitors: readonly Monitor[],
  cols: number,
  rows: number,
  scale: number,
  window: Window = FIELD_BOUNDS,
): { readonly pixels: Uint8ClampedArray; readonly width: number; readonly height: number } {
  const coarse = renderField(monitors, cols, rows, window);
  const width = cols * scale;
  const height = rows * scale;
  // The grain is fixed to the ground, not to the picture: a pixel at a place has the same grain whichever window
  // it was drawn in, so the dust does not crawl when the map is moved and the picture drawn again.
  const degPerPx = (window.east - window.west) / width;
  const yPerPx = (mercatorY(window.south) - mercatorY(window.north)) / height;
  const offsetX = Math.round(window.west / degPerPx);
  const offsetY = Math.round(mercatorY(window.north) / yPerPx);
  const pixels = new Uint8ClampedArray(width * height * 4);
  const at = (c: number, r: number, k: number): number =>
    coarse[
      (Math.min(rows - 1, Math.max(0, r)) * cols + Math.min(cols - 1, Math.max(0, c))) * 4 + k
    ] ?? 0;
  for (let y = 0; y < height; y++) {
    const fy = (y + 0.5) / scale - 0.5;
    const r0 = Math.floor(fy);
    const ty = fy - r0;
    for (let x = 0; x < width; x++) {
      const fx = (x + 0.5) / scale - 0.5;
      const c0 = Math.floor(fx);
      const tx = fx - c0;
      // Blend the four neighbours, weighting colour by opacity so empty ground does not darken the edges.
      let a = 0;
      let rr = 0;
      let gg = 0;
      let bb = 0;
      for (const [dc, dr, w] of [
        [0, 0, (1 - tx) * (1 - ty)],
        [1, 0, tx * (1 - ty)],
        [0, 1, (1 - tx) * ty],
        [1, 1, tx * ty],
      ] as const) {
        const alpha = at(c0 + dc, r0 + dr, 3);
        a += w * alpha;
        rr += w * alpha * at(c0 + dc, r0 + dr, 0);
        gg += w * alpha * at(c0 + dc, r0 + dr, 1);
        bb += w * alpha * at(c0 + dc, r0 + dr, 2);
      }
      if (a < 0.5) continue;
      const n = noise(x + offsetX, y + offsetY);
      const n2 = noise(y + offsetY + 7919, x + offsetX + 104729);
      // Grain in the opacity: mostly 60 to 100 percent, with the odd brighter speck and the odd hole.
      let grain = 0.6 + 0.4 * n;
      if (n2 > 0.97) grain = 1.35;
      else if (n2 < 0.04) grain = 0.12;
      const shade = (n - 0.5) * 22;
      const i = (y * width + x) * 4;
      pixels[i] = Math.max(0, Math.min(255, rr / a + shade));
      pixels[i + 1] = Math.max(0, Math.min(255, gg / a + shade));
      pixels[i + 2] = Math.max(0, Math.min(255, bb / a + shade));
      pixels[i + 3] = Math.max(0, Math.min(255, a * grain));
    }
  }
  return { pixels, width, height };
}

/** What part of a window the viewport sees, padded a little so a small pan does not show an edge; undefined if none. */
export function visibleWindow(
  tile: Window,
  view: {
    readonly west: number;
    readonly east: number;
    readonly south: number;
    readonly north: number;
  },
  pad = 0.15,
): Window | undefined {
  const padLng = (view.east - view.west) * pad;
  const padLat = (view.north - view.south) * pad;
  const west = Math.max(tile.west, view.west - padLng);
  const east = Math.min(tile.east, view.east + padLng);
  const south = Math.max(tile.south, view.south - padLat);
  const north = Math.min(tile.north, view.north + padLat);
  if (east - west < 0.01 || north - south < 0.01) return undefined;
  return { west, east, south, north };
}
