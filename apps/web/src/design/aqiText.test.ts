import { describe, expect, it } from 'vitest';
import { aqiText } from './levels';

describe('an AQI as it is written', () => {
  it('writes the number itself, including past 500 where the scale is carried on', () => {
    expect(aqiText(55)).toBe('55');
    expect(aqiText(500)).toBe('500');
    expect(aqiText(1246)).toBe('1246');
  });
});
