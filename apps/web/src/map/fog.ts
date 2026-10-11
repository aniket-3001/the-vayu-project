import { gradientColour, sampleField, type Window } from './field';
import type { Monitor } from './monitors';

/**
 * The air as a smooth, deep colour wash along the AQI scale, one level blending into the next with no break or grain,
 * the way a weather map's colour layer does: the colours mix into one another and there is depth where the air is
 * worst. It is translucent, so the streets and the wind show through it.
 */
export interface Fog {
  readonly width: number;
  readonly height: number;
  /** The colour at each pixel, three bytes, smooth from level to level. */
  readonly rgb: Uint8Array;
  /** How strong the wash is at each pixel, 0 where we know nothing. */
  readonly alpha: Uint8Array;
}

/** The picture is worked out on a coarse grid this many pixels across, and stretched up smoothly. */
const COARSE = 6;
/** The strongest the wash is, out of 255: deep, with the map still showing through. */
const STRONGEST = 235;
/** How much more vivid than the scale's own pastels the wash is drawn, and how much darker. */
const VIVID = 1.7;
const DEPTH = 0.82;

/** A colour pushed away from its own grey by `k`, so it is more vivid, and darkened a little. */
const vivid = (
  [r, g, b]: readonly [number, number, number],
  k: number,
): readonly [number, number, number] => {
  const grey = 0.299 * r + 0.587 * g + 0.114 * b;
  const push = (c: number): number =>
    Math.max(0, Math.min(255, Math.round((grey + (c - grey) * k) * DEPTH)));
  return [push(r), push(g), push(b)];
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
      const [r, g, b] = vivid(gradientColour(weighted / sure), VIVID);
      const at = y * width + x;
      rgb[at * 3] = r;
      rgb[at * 3 + 1] = g;
      rgb[at * 3 + 2] = b;
      // A little more than linear in how sure we are, so the edge falls away softly and the middle holds its depth.
      alpha[at] = Math.round(Math.min(1, sure ** 0.85) * STRONGEST);
    }
  }
  return { width, height, rgb, alpha };
}

/** Draws the wash into RGBA pixels (`out` is `width * height * 4`). */
export function paintFog(fog: Fog, out: Uint8ClampedArray): void {
  const { width, height, rgb, alpha } = fog;
  for (let at = 0; at < width * height; at++) {
    const o = at * 4;
    out[o] = rgb[at * 3] ?? 0;
    out[o + 1] = rgb[at * 3 + 1] ?? 0;
    out[o + 2] = rgb[at * 3 + 2] ?? 0;
    out[o + 3] = alpha[at] ?? 0;
  }
}
