import { describe, expect, it } from 'vitest';
import { INSIDE, OUTSIDE, particlePosition, pullToward } from './particles';

const inBounds = (p: { x: number; y: number; z: number }, b: typeof INSIDE): boolean =>
  p.x >= b.min.x &&
  p.x <= b.max.x &&
  p.y >= b.min.y &&
  p.y <= b.max.y &&
  p.z >= b.min.z &&
  p.z <= b.max.z;

describe('particlePosition', () => {
  it('is repeatable: the same particle at the same time is always in the same place', () => {
    expect(particlePosition(7, 12.5, INSIDE, 1)).toEqual(particlePosition(7, 12.5, INSIDE, 1));
  });

  it('stays inside the room or the haze, whatever the time', () => {
    for (let i = 0; i < 300; i++) {
      for (const t of [0, 3.3, 41.7, 1000.1]) {
        expect(inBounds(particlePosition(i, t, INSIDE, 1), INSIDE)).toBe(true);
        expect(inBounds(particlePosition(i, t, OUTSIDE, 2), OUTSIDE)).toBe(true);
      }
    }
  });

  it('keeps each particle where it was when more are added: a thicker haze only adds specks', () => {
    // Particle 5 does not depend on how many others there are, so drawing 100 or 200 leaves it alone.
    expect(particlePosition(5, 9, INSIDE, 1)).toEqual(particlePosition(5, 9, INSIDE, 1));
    const a = particlePosition(5, 9, INSIDE, 1);
    const b = particlePosition(6, 9, INSIDE, 1);
    expect(a).not.toEqual(b);
  });

  it('moves slowly: a particle drifts less than a block in a second', () => {
    for (let i = 0; i < 50; i++) {
      const a = particlePosition(i, 10, INSIDE, 1);
      const b = particlePosition(i, 11, INSIDE, 1);
      expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThan(1);
    }
  });

  it('spreads out through the whole room, not in one corner', () => {
    const xs = Array.from({ length: 200 }, (_, i) => particlePosition(i, 0, INSIDE, 1).x);
    expect(Math.min(...xs)).toBeLessThan(INSIDE.min.x + 2);
    expect(Math.max(...xs)).toBeGreaterThan(INSIDE.max.x - 2);
  });
});

describe('pullToward', () => {
  const from = { x: 8, y: 2, z: 5 };
  const target = { x: 3, y: 1, z: 0 };
  it('moves a particle toward the purifier, by a fraction, and never past it', () => {
    const moved = pullToward(from, [target], 0.4);
    expect(Math.hypot(moved.x - target.x, moved.y - target.y, moved.z - target.z)).toBeLessThan(
      Math.hypot(from.x - target.x, from.y - target.y, from.z - target.z),
    );
    const all = pullToward(from, [target], 1);
    expect(all).toEqual(target);
  });
  it('leaves a particle alone when there is no purifier, or no pull', () => {
    expect(pullToward(from, [], 0.5)).toEqual(from);
    expect(pullToward(from, [target], 0)).toEqual(from);
  });
  it('is drawn to the nearest purifier when there are several', () => {
    const near = { x: 7, y: 2, z: 5 };
    const far = { x: 0, y: 0, z: 0 };
    const moved = pullToward(from, [far, near], 1);
    expect(moved).toEqual(near);
  });
  it('clamps a silly pull to between none and all', () => {
    expect(pullToward(from, [target], 5)).toEqual(target);
    expect(pullToward(from, [target], -3)).toEqual(from);
  });
});
