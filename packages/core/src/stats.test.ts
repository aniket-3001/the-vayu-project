import { describe, expect, it } from 'vitest';
import { median } from './stats';

describe('median', () => {
  it('is the middle value of an odd count, whatever the order', () => {
    expect(median([9, 1, 5])).toBe(5);
  });
  it('is the mean of the two middle values of an even count', () => {
    expect(median([1, 2, 3, 10])).toBe(2.5);
  });
  it('is not pulled by one wild value, unlike a mean', () => {
    expect(median([40, 41, 39, 40, 5000])).toBe(40);
  });
  it('does not change the list it is given', () => {
    const values = [3, 1, 2];
    median(values);
    expect(values).toEqual([3, 1, 2]);
  });
  it('refuses an empty list rather than invent a number', () => {
    expect(() => median([])).toThrow(RangeError);
  });
});
