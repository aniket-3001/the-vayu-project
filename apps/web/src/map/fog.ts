import { gradientColour, mercatorY, sampleField, type Window } from './field';
import type { Monitor } from './monitors';

/**
 * The air as a translucent fog in the AQI scale's washed-out colours, blended smoothly from one level to the next, with
 * a fine grain through it like dust hanging in the air. It is light enough that the wind lines show through it. The
 * grain stirs very slightly, a pixel or so every moment, so where two kinds of air meet they seem to mix.
 */
export interface Fog {
  readonly width: number;
  readonly height: number;
  /** The colour at each pixel, three bytes, smooth from level to level. */
  readonly rgb: Uint8Array;
  /** How strong the fog is at each pixel, 0 where we know nothing, up to 215 where we are sure. */
  readonly alpha: Uint8Array;
  /** The grain is fixed to the ground: where this window starts, in grain cells. */
  readonly offsetX: number;
  readonly offsetY: number;
}

/** The picture is worked out on a coarse grid this many pixels across, and stretched up smoothly. */
const COARSE = 6;
/** The strongest the fog is, out of 255: it is a haze, so the map shows through. */
const STRONGEST = 215;

/** A repeatable number between 0 and 1 for a grain cell. */
const cell = (x: number, y: number): number => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

/**
 * The fog for a window of the world at a picture size: the field's estimate stretched smoothly over the picture and
 * coloured along the AQI scale, thinning to nothing where we know nothing, and fading at the edge of the data.
 */
export function buildFog(
  monitors: readonly Monitor[],
  window: Window,
  width: number,
  height: number,
): Fog {
  const cols = Math.max(2, Math.ceil(width / COARSE));
  const rows = Math.max(2, Math.ceil(height / COARSE));
  const { aqi, confidence } = sampleField(monitors, cols, rows, window);
  const rgb = new Uint8Array(width * height * 3);
  const alpha = new Uint8Array(width * height);
  const index = (c: number, r: number): number =>
    Math.min(rows - 1, Math.max(0, r)) * cols + Math.min(cols - 1, Math.max(0, c));
  for (let y = 0; y < height; y++) {
    const fy = (y + 0.5) / COARSE - 0.5;
    const r0 = Math.floor(fy);
    const ty = fy - r0;
    for (let x = 0; x < width; x++) {
      const fx = (x + 0.5) / COARSE - 0.5;
      const c0 = Math.floor(fx);
      const tx = fx - c0;
      // The four neighbours, the air weighted by how sure we are so empty ground does not pull it down.
      let sure = 0;
      let weighted = 0;
      for (const [dc, dr, w] of [
        [0, 0, (1 - tx) * (1 - ty)],
        [1, 0, tx * (1 - ty)],
        [0, 1, (1 - tx) * ty],
        [1, 1, tx * ty],
      ] as const) {
        const i = index(c0 + dc, r0 + dr);
        const c = confidence[i] ?? 0;
        sure += w * c;
        weighted += w * c * (aqi[i] ?? 0);
      }
      if (sure < 0.02) continue;
      const [r, g, b] = gradientColour(weighted / sure);
      const at = y * width + x;
      rgb[at * 3] = r;
      rgb[at * 3 + 1] = g;
      rgb[at * 3 + 2] = b;
      alpha[at] = Math.round(Math.min(1, sure) * STRONGEST);
    }
  }
  const degPerPx = (window.east - window.west) / width;
  const yPerPx = (mercatorY(window.south) - mercatorY(window.north)) / height;
  return {
    width,
    height,
    rgb,
    alpha,
    offsetX: Math.round(window.west / degPerPx),
    offsetY: Math.round(mercatorY(window.north) / yPerPx),
  };
}

/** How long the grain holds one place before it is stirred a pixel, in milliseconds. */
export const STIR_MS = 900;

/** Which stir a moment falls in, so a caller can skip drawing the same one again. */
export const stirOf = (ms: number): number => Math.floor(ms / STIR_MS);

/** The small nudge, -1, 0 or 1 pixel, the grain has at a stir. */
const nudge = (step: number, axis: number): number =>
  Math.floor(cell(step * 7 + axis * 31, axis * 977 + 13) * 3) - 1;

/**
 * Draws the fog at a moment into RGBA pixels (`out` is `width * height * 4`). Each pixel's strength is roughened with
 * grain: mostly 60 to 100 percent, with the odd brighter speck and the odd hole. The grain is a fixed pattern on the
 * ground, moved a pixel at most from one stir to the next, so it shimmers a little and does not drift.
 */
export function paintFog(fog: Fog, out: Uint8ClampedArray, ms: number): void {
  const { width, height, rgb, alpha, offsetX, offsetY } = fog;
  const step = stirOf(ms);
  const ox = offsetX + nudge(step, 0);
  const oy = offsetY + nudge(step, 1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = y * width + x;
      const base = alpha[at] ?? 0;
      const o = at * 4;
      if (base === 0) {
        out[o + 3] = 0;
        continue;
      }
      const n = cell(x + ox, y + oy);
      const n2 = cell(y + oy + 7919, x + ox + 104729);
      let grain = 0.6 + 0.4 * n;
      if (n2 > 0.97) grain = 1.35;
      else if (n2 < 0.04) grain = 0.12;
      const shade = (n - 0.5) * 22;
      out[o] = (rgb[at * 3] ?? 0) + shade;
      out[o + 1] = (rgb[at * 3 + 1] ?? 0) + shade;
      out[o + 2] = (rgb[at * 3 + 2] ?? 0) + shade;
      out[o + 3] = base * grain;
    }
  }
}
