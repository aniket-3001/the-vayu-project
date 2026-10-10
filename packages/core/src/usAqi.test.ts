import { describe, expect, it } from 'vitest';
import { maxPm25ForUsAqi, usAqi } from './usAqi';

describe('usAqi (US EPA, PM2.5)', () => {
  it('matches the figure IQAir showed for 48.2 ug/m3 on 7 Oct 2026', () => {
    expect(usAqi(48.2)).toMatchObject({
      value: 132,
      category: 'Unhealthy for Sensitive Groups',
      level: 2,
    });
  });

  it('hits the category edges of the 2024 EPA table', () => {
    expect(usAqi(0)).toMatchObject({ value: 0, category: 'Good' });
    expect(usAqi(9)).toMatchObject({ value: 50, category: 'Good' });
    expect(usAqi(9.1)).toMatchObject({ value: 51, category: 'Moderate' });
    expect(usAqi(35.4)).toMatchObject({ value: 100, category: 'Moderate' });
    expect(usAqi(35.5)).toMatchObject({ value: 101, category: 'Unhealthy for Sensitive Groups' });
    expect(usAqi(55.5)).toMatchObject({ value: 151, category: 'Unhealthy' });
    expect(usAqi(125.5)).toMatchObject({ value: 201, category: 'Very Unhealthy' });
    expect(usAqi(225.5)).toMatchObject({ value: 301, category: 'Hazardous' });
  });

  it('truncates to one decimal as the EPA does, and caps at 500', () => {
    expect(usAqi(9.04)).toMatchObject({ value: 50, category: 'Good' });
    expect(usAqi(900)?.value).toBe(500);
  });

  it('gives nothing for a missing or impossible value', () => {
    expect(usAqi(Number.NaN)).toBeUndefined();
    expect(usAqi(-1)).toBeUndefined();
  });
});

describe('maxPm25ForUsAqi', () => {
  it('finds the concentration at the top of each EPA category', () => {
    expect(maxPm25ForUsAqi(50)).toBe(9);
    expect(maxPm25ForUsAqi(100)).toBe(35.4);
    expect(maxPm25ForUsAqi(150)).toBe(55.4);
  });
});
