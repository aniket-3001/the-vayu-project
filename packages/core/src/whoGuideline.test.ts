import { describe, expect, it } from 'vitest';
import { compareWithWhoGuideline } from './whoGuideline';

describe('compareWithWhoGuideline', () => {
  it('is within the guideline at or below 15 ug/m3', () => {
    expect(compareWithWhoGuideline(15)).toMatchObject({ within: true, times: 1 });
    expect(compareWithWhoGuideline(8)?.within).toBe(true);
  });
  it('says how many times over the guideline a dirtier day is', () => {
    const result = compareWithWhoGuideline(45);
    expect(result).toMatchObject({ within: false, times: 3, guideline: 15 });
  });
  it('gives nothing for a missing or impossible mean', () => {
    expect(compareWithWhoGuideline(Number.NaN)).toBeUndefined();
    expect(compareWithWhoGuideline(-2)).toBeUndefined();
  });
});
