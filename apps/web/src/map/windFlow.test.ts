import { describe, expect, it } from 'vitest';
import {
  advanceStreak,
  buildFlowGrid,
  newStreak,
  pixelsPerFrame,
  sampleFlow,
  streakAlpha,
  type FlowSource,
} from './windFlow';

// A flat, north-up screen 100 x 100 where 1 pixel is 0.01 degree, so east is right and north is up.
const flat = (
  u: number,
  v: number,
  covered: (lat: number, lng: number) => boolean = () => true,
): FlowSource => ({
  width: 100,
  height: 100,
  unproject: (x, y) =>
    covered(50 - y * 0.01, x * 0.01) ? { lat: 50 - y * 0.01, lng: x * 0.01 } : undefined,
  project: (lat, lng) => ({ x: lng / 0.01, y: (50 - lat) / 0.01 }),
  field: () => ({ u, v }),
});

describe('pixelsPerFrame', () => {
  it('grows with the wind and never becomes a blur', () => {
    expect(pixelsPerFrame(1)).toBeLessThan(pixelsPerFrame(8));
    expect(pixelsPerFrame(100)).toBeLessThanOrEqual(4.2);
    expect(pixelsPerFrame(0)).toBeGreaterThan(0);
  });
});

describe('the flow grid', () => {
  it('points east wind to the right of the screen and north wind up it', () => {
    const east = sampleFlow(buildFlowGrid(flat(6, 0)), 40, 40);
    expect(east?.vx).toBeGreaterThan(0.5);
    expect(Math.abs(east?.vy ?? 1)).toBeLessThan(0.01);
    const north = sampleFlow(buildFlowGrid(flat(0, 6)), 40, 40);
    expect(north?.vy).toBeLessThan(-0.5);
    expect(Math.abs(north?.vx ?? 1)).toBeLessThan(0.01);
  });

  it('moves faster where the wind is stronger', () => {
    const slow = sampleFlow(buildFlowGrid(flat(2, 0)), 40, 40);
    const fast = sampleFlow(buildFlowGrid(flat(12, 0)), 40, 40);
    expect(fast?.vx).toBeGreaterThan(slow?.vx ?? 99);
  });

  it('has no flow where there is no wind data or outside the screen', () => {
    const grid = buildFlowGrid(flat(6, 0, (_lat, lng) => lng < 0.5));
    expect(sampleFlow(grid, 20, 40)).toBeDefined();
    expect(sampleFlow(grid, 90, 40)).toBeUndefined();
    expect(sampleFlow(grid, -5, 40)).toBeUndefined();
    expect(sampleFlow(grid, 40, 500)).toBeUndefined();
  });
});

describe('a streak', () => {
  it('moves along the flow, remembers where it was, and fades in and out over its life', () => {
    const grid = buildFlowGrid(flat(6, 0));
    const s = { x: 20, y: 40, px: 20, py: 40, age: 0, life: 100 };
    expect(advanceStreak(grid, s, 100, 100)).toBe(true);
    expect(s.px).toBe(20);
    expect(s.x).toBeGreaterThan(20);
    expect(streakAlpha({ ...s, age: 0 })).toBe(0);
    expect(streakAlpha({ ...s, age: 50 })).toBeCloseTo(1);
    expect(streakAlpha({ ...s, age: 100 })).toBeCloseTo(0);
  });

  it('is spent when it is old, leaves the screen, or reaches ground with no wind data', () => {
    const grid = buildFlowGrid(flat(6, 0));
    expect(advanceStreak(grid, { x: 20, y: 40, px: 0, py: 0, age: 99, life: 100 }, 100, 100)).toBe(
      false,
    );
    expect(advanceStreak(grid, { x: 99.9, y: 40, px: 0, py: 0, age: 1, life: 100 }, 100, 100)).toBe(
      false,
    );
    const gap = buildFlowGrid(flat(6, 0, (_lat, lng) => lng < 0.3));
    expect(advanceStreak(gap, { x: 80, y: 40, px: 0, py: 0, age: 1, life: 100 }, 100, 100)).toBe(
      false,
    );
  });

  it('is born somewhere on the screen with a life of its own', () => {
    let n = 0;
    const s = newStreak(100, 100, () => (n++ % 2 === 0 ? 0.25 : 0.75));
    expect(s.x).toBe(25);
    expect(s.y).toBe(75);
    expect(s.life).toBeGreaterThan(0);
  });
});
