import { gradientColour, mercatorY, noise, sampleField, type Window } from './field';
import type { Monitor } from './monitors';

/**
 * The air as a cloud of dust: fine, translucent specks in the AQI scale's colours (blended smoothly from one level to
 * the next), a few of them catching the light like gold. Each speck keeps its place and jostles about it a little, the
 * way dust hanging in a sunbeam does, so where two kinds of air meet they can be seen mixing.
 */
export interface Dust {
  readonly width: number;
  readonly height: number;
  readonly count: number;
  /** Where each speck rests, in picture pixels. */
  readonly x: Float32Array;
  readonly y: Float32Array;
  /** Colour and opacity, four bytes a speck. */
  readonly rgba: Uint8Array;
  /** How many pixels across: 1 or 2 for grains, 3 for the soft puffs between them. */
  readonly size: Uint8Array;
  /** A number that sets when this speck's glint peaks, or 0 for one that does not glint. */
  readonly glint: Float32Array;
  /** How far each wanders from its place, in pixels. */
  readonly wander: Float32Array;
}

/** The colour for each whole AQI, so a speck does not work out a blend of its own. */
const LUT = (() => {
  const table = new Uint8Array(501 * 3);
  for (let aqi = 0; aqi <= 500; aqi++) {
    const [r, g, b] = gradientColour(aqi);
    table[aqi * 3] = r;
    table[aqi * 3 + 1] = g;
    table[aqi * 3 + 2] = b;
  }
  return table;
})();

const GOLD: readonly [number, number, number] = [255, 224, 140];
/** The picture is worked out on a coarse grid this many pixels across, and the specks read from it. */
const COARSE = 6;

/**
 * The cloud for a window of the world at a picture size. A speck sits on a loose lattice `spacing` pixels apart, kept
 * in proportion to how sure we are of the air there (so the edges of what we know thin out into stray specks), and
 * the lattice is fixed to the ground, so the same place has the same dust whichever window it was drawn for.
 */
export function buildDust(
  monitors: readonly Monitor[],
  window: Window,
  width: number,
  height: number,
  spacing = 3,
): Dust {
  const cols = Math.max(2, Math.ceil(width / COARSE));
  const rows = Math.max(2, Math.ceil(height / COARSE));
  const { aqi, confidence } = sampleField(monitors, cols, rows, window);
  const degPerPx = (window.east - window.west) / width;
  const yPerPx = (mercatorY(window.south) - mercatorY(window.north)) / height;
  const offsetX = Math.round(window.west / degPerPx);
  const offsetY = Math.round(mercatorY(window.north) / yPerPx);

  const cap = Math.ceil(width / spacing) * Math.ceil(height / spacing) * 3;
  const x = new Float32Array(cap);
  const y = new Float32Array(cap);
  const rgba = new Uint8Array(cap * 4);
  const size = new Uint8Array(cap);
  const glint = new Float32Array(cap);
  const wander = new Float32Array(cap);
  let n = 0;

  const read = (px: number, py: number): { sure: number; value: number } => {
    const fx = px / COARSE - 0.5;
    const fy = py / COARSE - 0.5;
    const c0 = Math.floor(fx);
    const r0 = Math.floor(fy);
    const tx = fx - c0;
    const ty = fy - r0;
    let sure = 0;
    let weighted = 0;
    for (const [dc, dr, w] of [
      [0, 0, (1 - tx) * (1 - ty)],
      [1, 0, tx * (1 - ty)],
      [0, 1, (1 - tx) * ty],
      [1, 1, tx * ty],
    ] as const) {
      const i =
        Math.min(rows - 1, Math.max(0, r0 + dr)) * cols + Math.min(cols - 1, Math.max(0, c0 + dc));
      const c = confidence[i] ?? 0;
      sure += w * c;
      weighted += w * c * (aqi[i] ?? 0);
    }
    return { sure, value: sure === 0 ? 0 : weighted / sure };
  };

  const put = (
    px: number,
    py: number,
    value: number,
    alpha: number,
    px2: number,
    shine: number,
    wide: number,
    seed: number,
  ): void => {
    const level = Math.max(0, Math.min(500, Math.round(value)));
    let r = LUT[level * 3] ?? 0;
    let g = LUT[level * 3 + 1] ?? 0;
    let b = LUT[level * 3 + 2] ?? 0;
    let a = alpha;
    let gl = 0;
    if (shine > 0) {
      // A speck that catches the light: pulled towards gold, brighter, and it glints.
      r = Math.round(r * 0.35 + GOLD[0] * 0.65);
      g = Math.round(g * 0.35 + GOLD[1] * 0.65);
      b = Math.round(b * 0.35 + GOLD[2] * 0.65);
      a = Math.min(255, alpha * 1.25);
      gl = 1 + seed * 6;
    }
    x[n] = px;
    y[n] = py;
    rgba[n * 4] = r;
    rgba[n * 4 + 1] = g;
    rgba[n * 4 + 2] = b;
    rgba[n * 4 + 3] = Math.round(a);
    size[n] = px2;
    glint[n] = gl;
    wander[n] = wide;
    n += 1;
  };

  for (let cy = 0; cy * spacing < height; cy++) {
    for (let cx = 0; cx * spacing < width; cx++) {
      const gi = cx + Math.floor(offsetX / spacing);
      const gj = cy + Math.floor(offsetY / spacing);
      const jx = noise(gi, gj);
      const jy = noise(gj + 40503, gi + 7919);
      const px = (cx + jx) * spacing;
      const py = (cy + jy) * spacing;
      const { sure, value } = read(px, py);
      if (sure < 0.02) continue;
      // Kept in proportion to how sure we are: past the edge of what we know, only the odd stray speck.
      const keep = noise(gi + 91, gj + 17);
      if (keep > Math.min(1, sure * 1.6 + 0.04)) continue;
      // The air at each speck is a little off its neighbour's, so the colours grade through one another.
      const wobble = (noise(gi + 5, gj + 131) - 0.5) * 36;
      const strength = Math.min(1, sure * 1.3);
      // A soft puff, then two grains in it.
      put(px, py, value + wobble, 38 + 46 * strength, 3, 0, 1.6, 0);
      const g1 = noise(gi + 211, gj + 3);
      put(
        px + (noise(gi + 1, gj + 9) - 0.5) * spacing,
        py + (noise(gi + 9, gj + 1) - 0.5) * spacing,
        value + wobble * 1.4,
        120 + 120 * strength * (0.5 + 0.5 * g1),
        g1 > 0.62 ? 2 : 1,
        g1 > 0.93 ? 1 : 0,
        1.2 + g1,
        g1,
      );
      const g2 = noise(gi + 313, gj + 71);
      put(
        px + (noise(gi + 2, gj + 19) - 0.5) * spacing,
        py + (noise(gi + 19, gj + 2) - 0.5) * spacing,
        value + wobble * 0.6,
        90 + 130 * strength * (0.4 + 0.6 * g2),
        1,
        g2 > 0.9 ? 1 : 0,
        1 + g2 * 1.2,
        g2,
      );
    }
  }
  return { width, height, count: n, x, y, rgba, size, glint, wander };
}

const STEP_MS = 160;

/** A repeatable number from -1 to 1 for a speck at a beat of time. */
const beat = (i: number, step: number, axis: number): number => {
  let h = (Math.imul(i + 1, 374761393) ^ Math.imul(step + axis * 9176, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 2147483647.5 - 1;
};

/**
 * Draws the cloud at a moment into RGBA pixels (`out` is `width * height * 4`, cleared first). Each speck wanders
 * about its place, from one beat of random nudges to the next, smoothly, and the glints rise and fall.
 */
export function paintDust(dust: Dust, out: Uint8ClampedArray, ms: number): void {
  out.fill(0);
  const { width, height, count, x, y, rgba, size, glint, wander } = dust;
  const step = Math.floor(ms / STEP_MS);
  const f = (ms - step * STEP_MS) / STEP_MS;
  const s = f * f * (3 - 2 * f);
  for (let i = 0; i < count; i++) {
    const w = wander[i] ?? 1;
    const dx = (beat(i, step, 0) * (1 - s) + beat(i, step + 1, 0) * s) * w;
    const dy = (beat(i, step, 1) * (1 - s) + beat(i, step + 1, 1) * s) * w;
    const px = Math.round((x[i] ?? 0) + dx);
    const py = Math.round((y[i] ?? 0) + dy);
    const sz = size[i] ?? 1;
    if (px < 0 || py < 0 || px + sz > width || py + sz > height) continue;
    let a = rgba[i * 4 + 3] ?? 0;
    const gl = glint[i] ?? 0;
    if (gl > 0) a *= 0.55 + 0.45 * Math.sin(ms / 420 + gl * 5);
    const r = rgba[i * 4] ?? 0;
    const g = rgba[i * 4 + 1] ?? 0;
    const b = rgba[i * 4 + 2] ?? 0;
    for (let oy = 0; oy < sz; oy++) {
      for (let ox = 0; ox < sz; ox++) {
        const at = ((py + oy) * width + px + ox) * 4;
        const have = out[at + 3] ?? 0;
        // Over what is there: the stronger speck wins the colour, and the opacities add up.
        if (have === 0 || a >= have) {
          out[at] = r;
          out[at + 1] = g;
          out[at + 2] = b;
        }
        out[at + 3] = Math.min(255, have + a * (1 - have / 255));
      }
    }
  }
}
