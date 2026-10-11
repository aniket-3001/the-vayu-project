// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { SAMPLE_TRACK, SAMPLE_UNITS } from '../testing/sampleExposure';
import { LIVE_STORAGE_KEY, currentHour, loadLive, recordFix, saveLive } from './live';
import { today, dayCells } from './model';
import { sampleSpotsFor } from './spots';

beforeEach(() => {
  window.localStorage.clear();
});

describe('live location log', () => {
  it('starts empty and survives rubbish in storage', () => {
    expect(loadLive(window.localStorage)).toEqual({});
    window.localStorage.setItem(LIVE_STORAGE_KEY, '{{');
    expect(loadLive(window.localStorage)).toEqual({});
    window.localStorage.setItem(
      LIVE_STORAGE_KEY,
      JSON.stringify({ '9': { lat: 'x' }, '10': { lat: 1, lng: 2 } }),
    );
    expect(loadLive(window.localStorage)).toEqual({ '10': { lat: 1, lng: 2 } });
  });

  it('records a fix against the current hour and replaces an earlier one in the same hour', () => {
    const one = recordFix({}, 28.6, 77.2);
    expect(Object.keys(one)).toEqual([String(currentHour())]);
    const two = recordFix(one, 28.7, 77.3);
    expect(Object.keys(two)).toHaveLength(1);
    expect(two[String(currentHour())]).toEqual({ lat: 28.7, lng: 77.3 });
    saveLive(window.localStorage, two);
    expect(loadLive(window.localStorage)).toEqual(two);
  });

  it('lets a fix from the hour in progress show on the live ring', () => {
    const cells = dayCells(sampleSpotsFor('adult'), [], recordFix({}, 28.6, 77.2), today());
    expect(cells.some((c) => c.where === 'live' && c.hour === currentHour())).toBe(true);
  });

  it('has a sample track that only covers hours that have happened, and visits the park at lunch', () => {
    const hours = Object.keys(SAMPLE_TRACK).map(Number);
    expect(Math.max(...hours)).toBeLessThanOrEqual(currentHour());
    const cells = dayCells(sampleSpotsFor('adult'), SAMPLE_UNITS, SAMPLE_TRACK, today());
    expect(cells.some((c) => c.where === 'live' && c.hour === 13)).toBe(true);
    // The errand takes the person past a friend’s Vayu unit, and the sample picks it up on its own.
    expect(cells.find((c) => c.where === 'live' && c.hour === 15)?.source).toBe('unit');
  });
});
