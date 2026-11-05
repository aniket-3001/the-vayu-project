import { describe, expect, it } from 'vitest';
import { percentile, summarise } from '../../scripts/loadStats.mjs';

describe('load test statistics', () => {
  it('splits the first request for each address from the repeats', () => {
    const s = summarise([
      { path: '/a', ms: 4000 },
      { path: '/b', ms: 5000 },
      { path: '/a', ms: 20 },
      { path: '/a', ms: 30 },
      { path: '/b', ms: 25 },
    ]);
    expect(s.first.n).toBe(2);
    expect(s.first.max).toBe(5000);
    expect(s.repeat.n).toBe(3);
    expect(s.repeat.max).toBe(30);
  });

  it('does not let slow first looks hide in the repeat figure, nor the reverse', () => {
    const s = summarise([
      { path: '/a', ms: 9000 },
      { path: '/a', ms: 10 },
    ]);
    expect(s.repeat.p95).toBe(10);
    expect(s.first.p95).toBe(9000);
  });

  it('copes with no samples', () => {
    expect(percentile([], 0.95)).toBe(0);
    expect(summarise([]).repeat.n).toBe(0);
  });
});
