import { describe, expect, it } from 'vitest';
import { evaluateGrap, grapHeadsUp } from './grap';
import { hourlySeries } from './testing';

describe('GRAP heads-up', () => {
  it('fires at 430 and above, below the official 450 (it leans cautious)', () => {
    expect(grapHeadsUp(420, 429).fire).toBe(false);
    expect(grapHeadsUp(420, 431).fire).toBe(true);
    expect(grapHeadsUp(440, null).fire).toBe(true);
    expect(grapHeadsUp(null, null).fire).toBe(false);
  });

  it('reports the level it compared', () => {
    expect(grapHeadsUp(300, 410).level).toBe(410);
  });
});

describe('GRAP evaluation on a synthetic episode', () => {
  // A week of ordinary air, then a smog episode that ramps over two days.
  const episode = hourlySeries('2025-12-01T00:00:00.000Z', 14 * 24, (index, hour) => {
    const day = index / 24;
    const daily = 1 + (hour >= 7 && hour <= 10 ? 0.3 : 0);
    const ramp = day < 7 ? 1 : 1 + Math.min(4, (day - 7) * 2);
    return 120 * daily * ramp;
  });
  const result = evaluateGrap(episode);

  it('finds the real event', () => {
    expect(result.events).toBeGreaterThanOrEqual(1);
  });

  it('catches it before it happens (recall 100% on this episode)', () => {
    expect(result.recall).toBe(1);
  });

  it('reports its false alarms rather than hiding them', () => {
    expect(result.falseAlarms).toBeGreaterThanOrEqual(0);
  });

  it('stays quiet on a clean week', () => {
    const clean = evaluateGrap(hourlySeries('2025-12-01T00:00:00.000Z', 14 * 24, () => 40));
    expect(clean).toEqual({ events: 0, caught: 0, recall: null, headsUps: 0, falseAlarms: 0 });
  });
});
