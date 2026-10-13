import { advectWith, speedOf, type Wind } from './wind';

/**
 * The wind as it looks on the screen: for a coarse grid of screen points, which way the wind blows there and how many
 * pixels a streak should move in a frame. The streaks are then moved over this grid in plain pixels, with no map
 * calls per streak per frame, which is what lets thousands of them run on a phone.
 */
export interface FlowGrid {
  readonly cols: number;
  readonly rows: number;
  readonly cell: number;
  /** Pixels per frame, towards the right and towards the bottom of the screen. */
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  /** 0 where the point has no wind data (off the globe, outside the area covered). */
  readonly ok: Uint8Array;
}

/** How far a streak moves in a frame for a wind of this speed (m/s): quick enough to read as flow, never a blur. */
export const pixelsPerFrame = (speed: number): number =>
  Math.min(4.2, 0.55 + Math.min(speed, 16) * 0.24);

export interface FlowSource {
  readonly width: number;
  readonly height: number;
  /** Where a point of the screen is on the ground, or nothing if it is not on the ground (the sky round a globe). */
  readonly unproject: (x: number, y: number) => { lat: number; lng: number } | undefined;
  readonly project: (lat: number, lng: number) => { x: number; y: number };
  readonly field: (lat: number, lng: number) => Wind;
}

export function buildFlowGrid(source: FlowSource, cell = 24): FlowGrid {
  const cols = Math.max(2, Math.ceil(source.width / cell) + 1);
  const rows = Math.max(2, Math.ceil(source.height / cell) + 1);
  const vx = new Float32Array(cols * rows);
  const vy = new Float32Array(cols * rows);
  const ok = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cell;
      const y = r * cell;
      const here = source.unproject(x, y);
      if (here === undefined) continue;
      const wind = source.field(here.lat, here.lng);
      const speed = speedOf(wind);
      const ahead = advectWith(source.field, here.lat, here.lng, 3600);
      const to = source.project(ahead.lat, ahead.lng);
      const dx = to.x - x;
      const dy = to.y - y;
      const length = Math.hypot(dx, dy);
      if (!Number.isFinite(length)) continue;
      const i = r * cols + c;
      ok[i] = 1;
      if (length > 1e-6) {
        const step = pixelsPerFrame(speed);
        vx[i] = (dx / length) * step;
        vy[i] = (dy / length) * step;
      }
    }
  }
  return { cols, rows, cell, vx, vy, ok };
}

/** The flow at a screen point, blended from the four grid points round it; nothing if one of them has no wind. */
export function sampleFlow(
  grid: FlowGrid,
  x: number,
  y: number,
): { vx: number; vy: number } | undefined {
  const gx = x / grid.cell;
  const gy = y / grid.cell;
  if (gx < 0 || gy < 0 || gx > grid.cols - 1 || gy > grid.rows - 1) return undefined;
  const c0 = Math.min(grid.cols - 2, Math.floor(gx));
  const r0 = Math.min(grid.rows - 2, Math.floor(gy));
  const fx = gx - c0;
  const fy = gy - r0;
  const a = r0 * grid.cols + c0;
  const b = a + 1;
  const c = a + grid.cols;
  const d = c + 1;
  if (!grid.ok[a] || !grid.ok[b] || !grid.ok[c] || !grid.ok[d]) return undefined;
  const mix = (v: Float32Array): number =>
    (v[a] ?? 0) * (1 - fx) * (1 - fy) +
    (v[b] ?? 0) * fx * (1 - fy) +
    (v[c] ?? 0) * (1 - fx) * fy +
    (v[d] ?? 0) * fx * fy;
  return { vx: mix(grid.vx), vy: mix(grid.vy) };
}

/** A streak: where it is, how long it has lived and will live, and where it was a frame ago. */
export interface Streak {
  x: number;
  y: number;
  px: number;
  py: number;
  age: number;
  life: number;
}

export const LIFE_MIN = 70;
export const LIFE_MAX = 160;

export const newStreak = (width: number, height: number, random: () => number): Streak => {
  const x = random() * width;
  const y = random() * height;
  return {
    x,
    y,
    px: x,
    py: y,
    age: random() * LIFE_MAX,
    life: LIFE_MIN + random() * (LIFE_MAX - LIFE_MIN),
  };
};

/** Moves a streak one frame along the flow. Returns false when it is spent: too old, or off the wind's area. */
export function advanceStreak(grid: FlowGrid, s: Streak, width: number, height: number): boolean {
  s.px = s.x;
  s.py = s.y;
  const flow = sampleFlow(grid, s.x, s.y);
  if (flow === undefined) return false;
  s.x += flow.vx;
  s.y += flow.vy;
  s.age += 1;
  return s.age < s.life && s.x >= 0 && s.y >= 0 && s.x <= width && s.y <= height;
}

/** Fades a streak in as it is born and out as it ends, 0 to 1. */
export const streakAlpha = (s: Streak): number => Math.sin(Math.PI * Math.min(1, s.age / s.life));
