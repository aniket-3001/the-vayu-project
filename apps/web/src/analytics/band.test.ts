import { describe, expect, it } from 'vitest';
import { LEVELS } from '../design/levels';
import { bandOfAqi, createAirNote } from './band';
import { BANDS } from './types';

describe('bandOfAqi', () => {
  it('has one band for each of the app’s air levels', () => {
    expect(BANDS).toHaveLength(LEVELS.length);
  });

  it('follows the US AQI breakpoints', () => {
    expect(bandOfAqi(0)).toBe('good');
    expect(bandOfAqi(50)).toBe('good');
    expect(bandOfAqi(51)).toBe('moderate');
    expect(bandOfAqi(101)).toBe('sensitive');
    expect(bandOfAqi(155)).toBe('unhealthy');
    expect(bandOfAqi(250)).toBe('very_bad');
    expect(bandOfAqi(400)).toBe('hazardous');
    expect(bandOfAqi(999)).toBe('hazardous');
  });

  it('says nothing for a number that is not a reading', () => {
    expect(bandOfAqi(Number.NaN)).toBeUndefined();
  });
});

describe('createAirNote', () => {
  it('says each band once, however often the air refreshes, and remembers the latest', () => {
    const first: string[] = [];
    const air = createAirNote((band) => {
      first.push(band);
    });
    expect(air.current()).toBeUndefined();
    air.note(30);
    air.note(32);
    air.note(160);
    air.note(30);
    expect(first).toEqual(['good', 'unhealthy']);
    expect(air.current()).toBe('good');
  });

  it('ignores a missing or broken reading, and keeps what it had', () => {
    const first: string[] = [];
    const air = createAirNote((band) => {
      first.push(band);
    });
    air.note(undefined);
    air.note(Number.NaN);
    expect(first).toEqual([]);
    air.note(80);
    air.note(undefined);
    expect(air.current()).toBe('moderate');
  });
});
