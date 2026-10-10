import { describe, expect, it } from 'vitest';
import { walkAdviceFor } from './walkAdvice';

describe('what to say about the cleanest hour', () => {
  it('says to walk anywhere, as long as you like, when it is good or fine', () => {
    for (const aqi of [20, 50, 75, 100]) {
      const advice = walkAdviceFor(aqi);
      expect(advice.long, String(aqi)).toMatch(/anywhere/u);
      expect(advice.long, String(aqi)).toMatch(/as long as you like/u);
    }
  });

  it('says keep it short, in a park with trees, from AQI 101, and 150 is the example', () => {
    const at150 = walkAdviceFor(150);
    expect(at150.band).toBe('short');
    expect(at150.long).toMatch(/keep it short/u);
    expect(at150.long).toMatch(/park with trees/u);
    expect(walkAdviceFor(101).band).toBe('short');
  });

  it('gets stricter as the air gets worse, never says there is no clean hour, and asks for a mask', () => {
    const bands = [40, 90, 130, 180, 260].map((aqi) => walkAdviceFor(aqi).band);
    expect(bands).toEqual(['free', 'fine', 'short', 'brief', 'minimal']);
    for (const aqi of [10, 80, 140, 190, 400]) {
      const { long, short } = walkAdviceFor(aqi);
      expect(`${long} ${short}`).not.toMatch(/no clean hour/iu);
    }
    expect(walkAdviceFor(190).long).toMatch(/N95/u);
    expect(walkAdviceFor(400).long).toMatch(/10 minutes at most/u);
  });
});
