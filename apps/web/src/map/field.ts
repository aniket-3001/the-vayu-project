import { LEVELS } from '../design/levels';
import type { Monitor } from './monitors';

/** The patch of the world the colour field covers, in degrees. */
export const FIELD_BOUNDS = { west: 62, east: 96, south: 2, north: 38 } as const;

/** How far from a monitor, in degrees, the field still colours anything. Past this we have no idea, so we say nothing. */
export const REACH_DEG = 3.2;

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

/** RGBA pixels for the field over `FIELD_BOUNDS`, `cols` by `rows`, rows spaced evenly in mercator y. */
export function renderField(
  monitors: readonly Monitor[],
  cols: number,
  rows: number,
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(cols * rows * 4);
  const yTop = mercatorY(FIELD_BOUNDS.north);
  const yBottom = mercatorY(FIELD_BOUNDS.south);
  for (let row = 0; row < rows; row++) {
    const lat = latOfMercatorY(yTop + ((row + 0.5) / rows) * (yBottom - yTop));
    for (let col = 0; col < cols; col++) {
      const lng =
        FIELD_BOUNDS.west + ((col + 0.5) / cols) * (FIELD_BOUNDS.east - FIELD_BOUNDS.west);
      const value = fieldAt(lat, lng, monitors);
      if (value === undefined) continue;
      const [r, g, b] = gradientColour(value.aqi);
      const i = (row * cols + col) * 4;
      // A little grain in the colour and more in the opacity, so the field reads as washed out and gritty.
      const grain = noise(col, row);
      pixels[i] = Math.max(0, Math.min(255, r + (grain - 0.5) * 26));
      pixels[i + 1] = Math.max(0, Math.min(255, g + (grain - 0.5) * 26));
      pixels[i + 2] = Math.max(0, Math.min(255, b + (grain - 0.5) * 26));
      const edge = Math.min(
        lat - FIELD_BOUNDS.south,
        FIELD_BOUNDS.north - lat,
        lng - FIELD_BOUNDS.west,
        FIELD_BOUNDS.east - lng,
      );
      // Fade out towards the edge of the data, so the field does not end in a hard box.
      pixels[i + 3] = Math.round(
        value.confidence * Math.min(1, edge / 5) * (150 + (noise(row, col) - 0.5) * 120),
      );
    }
  }
  return pixels;
}
