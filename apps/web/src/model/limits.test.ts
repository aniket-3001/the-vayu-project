import { describe, expect, it } from 'vitest';
import { limitSentence, walkLimit } from './limits';

describe('walk limits', () => {
  it('is stricter for sensitive people than for other adults', () => {
    expect(walkLimit(true).pm25).toBeLessThan(walkLimit(false).pm25);
    expect(walkLimit(true).usAqi).toBeLessThan(walkLimit(false).usAqi);
    expect([walkLimit(true).usAqi, walkLimit(false).usAqi]).toEqual([100, 150]);
  });

  it('says who gets which limit, with the concentration and the US AQI', () => {
    expect(limitSentence('Aarav', true)).toMatch(
      /^For Aarav, the stricter limit applies: .* US AQI \d+ \(PM2\.5 [\d.]+ µg\/m³\)\.$/,
    );
    expect(limitSentence('Me', false)).toMatch(/standard limit applies/);
  });
});
