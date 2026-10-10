import { describe, expect, it } from 'vitest';
import { scalePosition } from './AqiScale';

describe('scalePosition', () => {
  it('puts each level in its own sixth, in order', () => {
    expect(scalePosition(0)).toBe(0);
    expect(scalePosition(25)).toBeCloseTo((0.5 / 6) * 0.98, 1);
    expect(scalePosition(51)).toBeCloseTo(1 / 6, 2);
    expect(scalePosition(160)).toBeGreaterThan(3 / 6);
    expect(scalePosition(160)).toBeLessThan(4 / 6);
    expect(scalePosition(350)).toBeGreaterThan(5 / 6);
  });

  it('never leaves the bar, however odd the number', () => {
    expect(scalePosition(-5)).toBe(0);
    expect(scalePosition(5000)).toBe(1);
    expect(scalePosition(Number.NaN)).toBe(0);
  });
});
