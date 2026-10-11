import { describe, expect, it } from 'vitest';
import { aqiText } from './levels';

describe('an AQI as it is written', () => {
  it('shows the ceiling of the US scale as 500+, because it means 500 or more', () => {
    expect(aqiText(500)).toBe('500+');
    expect(aqiText(499)).toBe('499');
    expect(aqiText(55)).toBe('55');
  });
});
