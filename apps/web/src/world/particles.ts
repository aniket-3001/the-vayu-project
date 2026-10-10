import { seededRandom } from '@vayu/core';
import { ROOM } from './voxels';

export interface Point {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
export interface Bounds {
  readonly min: Point;
  readonly max: Point;
}

/** Where specks live inside the room: the floor area, from just above the floor to under the ceiling. */
export const INSIDE: Bounds = {
  min: { x: 0.2, y: 0.2, z: 0.2 },
  max: { x: ROOM.width - 0.2, y: ROOM.height - 0.3, z: ROOM.depth - 0.2 },
};

/** Where the haze is outside: beyond the back wall, wider and taller than the room. */
export const OUTSIDE: Bounds = {
  min: { x: -3, y: 0, z: -9 },
  max: { x: ROOM.width + 2, y: ROOM.height + 2, z: -1.8 },
};

/**
 * Where particle number `index` is at time `t` (seconds). Each particle's home and its drift are
 * fixed by its own number alone, so showing more particles never moves the ones already there, and
 * the same moment always draws the same picture. The drift is a slow wobble, under a block a second.
 */
export function particlePosition(index: number, t: number, bounds: Bounds, seed: number): Point {
  const random = seededRandom(index * 7919 + seed * 104_729 + 17);
  const home = { u: random(), v: random(), w: random() };
  const phase = { a: random() * 6.283, b: random() * 6.283, c: random() * 6.283 };
  const speed = 0.15 + random() * 0.25;
  const reach = 0.35 + random() * 0.35;

  const place = (low: number, high: number, unit: number, wobble: number): number =>
    Math.min(high, Math.max(low, low + unit * (high - low) + wobble));
  return {
    x: place(bounds.min.x, bounds.max.x, home.u, Math.sin(t * speed + phase.a) * reach),
    y: place(bounds.min.y, bounds.max.y, home.v, Math.sin(t * speed * 0.7 + phase.b) * reach * 0.6),
    z: place(bounds.min.z, bounds.max.z, home.w, Math.cos(t * speed + phase.c) * reach),
  };
}

/**
 * Draws a particle a fraction of the way toward the nearest purifier: the picture of a fan pulling
 * air through. It is a drawing, not physics; the numbers come from the room model.
 */
export function pullToward(from: Point, purifiers: readonly Point[], pull: number): Point {
  const strength = Math.min(1, Math.max(0, pull));
  let nearest: Point | undefined;
  let best = Infinity;
  for (const point of purifiers) {
    const distance = Math.hypot(point.x - from.x, point.y - from.y, point.z - from.z);
    if (distance < best) {
      best = distance;
      nearest = point;
    }
  }
  if (nearest === undefined || strength === 0) return from;
  return {
    x: from.x + (nearest.x - from.x) * strength,
    y: from.y + (nearest.y - from.y) * strength,
    z: from.z + (nearest.z - from.z) * strength,
  };
}
