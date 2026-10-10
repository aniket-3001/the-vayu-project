import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';
import { INK, LEVELS, levelForAqi } from './levels';

describe('AQI levels', () => {
  it('has the six US AQI levels, worst last', () => {
    expect(LEVELS.map((level) => level.name)).toEqual([
      'Good',
      'Moderate',
      'Unhealthy for sensitive groups',
      'Unhealthy',
      'Very unhealthy',
      'Hazardous',
    ]);
  });

  it('puts text on every level colour at 4.5:1 or better (IQAir’s white on coral does not manage it)', () => {
    for (const level of LEVELS) {
      expect(contrastRatio(level.onSolid, level.solid), level.name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the page ink readable on the soft tints used as washes and tiles', () => {
    for (const level of LEVELS) {
      expect(contrastRatio(INK, level.soft), level.name).toBeGreaterThanOrEqual(7);
    }
  });

  it('maps an AQI to its level at the EPA boundaries', () => {
    const at = (aqi: number): string => levelForAqi(aqi).name;
    expect(at(0)).toBe('Good');
    expect(at(50)).toBe('Good');
    expect(at(51)).toBe('Moderate');
    expect(at(100)).toBe('Moderate');
    expect(at(101)).toBe('Unhealthy for sensitive groups');
    expect(at(150)).toBe('Unhealthy for sensitive groups');
    expect(at(151)).toBe('Unhealthy');
    expect(at(200)).toBe('Unhealthy');
    expect(at(201)).toBe('Very unhealthy');
    expect(at(300)).toBe('Very unhealthy');
    expect(at(301)).toBe('Hazardous');
    expect(at(999)).toBe('Hazardous');
  });

  it('never fails on a nonsense number: negative or not-a-number reads as Good, not a crash', () => {
    expect(levelForAqi(-5).name).toBe('Good');
    expect(levelForAqi(Number.NaN).name).toBe('Good');
  });

  it('gives each level a short plain label for chips and a distinct face', () => {
    expect(new Set(LEVELS.map((level) => level.short)).size).toBe(6);
    expect(new Set(LEVELS.map((level) => level.face)).size).toBeGreaterThanOrEqual(4);
  });
});
