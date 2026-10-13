import { describe, expect, it } from 'vitest';
import { PERFORMANCE_WINDOW_MS, purifierPerformance } from './performance';

const NOW = 1_000_000_000;
const at = (pm25: number, agoMs: number): { pm25: number; atMs: number } => ({
  pm25,
  atMs: NOW - agoMs,
});

describe('how much cleaner the purifier makes the air', () => {
  it('gives the percent cleaner than the room', () => {
    expect(purifierPerformance(at(100, 60_000), at(25, 10_000), NOW)).toEqual({ cleanerPct: 75 });
  });

  it('is not sure without both readings', () => {
    expect(purifierPerformance(undefined, at(25, 0), NOW)).toBeNull();
    expect(purifierPerformance(at(100, 0), undefined, NOW)).toBeNull();
  });

  it('is not sure when either reading is older than ten minutes', () => {
    expect(purifierPerformance(at(100, PERFORMANCE_WINDOW_MS + 1), at(25, 0), NOW)).toBeNull();
    expect(purifierPerformance(at(100, 0), at(25, PERFORMANCE_WINDOW_MS + 1), NOW)).toBeNull();
  });

  it('still counts a reading exactly ten minutes old', () => {
    expect(purifierPerformance(at(100, PERFORMANCE_WINDOW_MS), at(50, 0), NOW)).toEqual({
      cleanerPct: 50,
    });
  });

  it('is not sure when the room has no particles to remove, so it never divides by nothing', () => {
    expect(purifierPerformance(at(0, 0), at(0, 0), NOW)).toBeNull();
  });

  it('says 0 and never a negative figure when the output is no cleaner than the room', () => {
    expect(purifierPerformance(at(20, 0), at(30, 0), NOW)).toEqual({ cleanerPct: 0 });
  });
});
