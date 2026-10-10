import { describe, expect, it } from 'vitest';
import { simulateDay, statsFor } from './sim';

const bad = Array.from({ length: 18 }, () => 80);
const clean = Array.from({ length: 18 }, () => 6);

describe('a made-up day for a monitor and its cleaner', () => {
  it('runs the cleaner when kept on, never when kept off', () => {
    expect(simulateDay(bad, 'on', 35).every((h) => h.fan)).toBe(true);
    expect(simulateDay(bad, 'off', 35).some((h) => h.fan)).toBe(false);
  });

  it('keeps the room cleaner with the cleaner on than with it off', () => {
    const on = simulateDay(bad, 'on', 35).at(-1);
    const off = simulateDay(bad, 'off', 35).at(-1);
    expect((on?.indoor ?? 99) < (off?.indoor ?? 0)).toBe(true);
  });

  it('switches on by itself when the room gets bad, and leaves it idle when the air is clean', () => {
    expect(simulateDay(bad, 'auto', 35).some((h) => h.fan)).toBe(true);
    expect(simulateDay(clean, 'auto', 35).some((h) => h.fan)).toBe(false);
  });

  it('does not flick on and off every hour: it switches off only well below where it switched on', () => {
    const hours = simulateDay(bad, 'auto', 35);
    const flips = hours.filter((h, i) => i > 0 && h.fan !== hours[i - 1]?.fan).length;
    expect(flips).toBeLessThanOrEqual(6);
  });

  it('adds up the day: hours run, the share of Good hours, the filter, and what the first hour on did', () => {
    const stats = statsFor(simulateDay(bad, 'auto', 35));
    expect(stats.fanHours).toBeGreaterThan(0);
    expect(stats.filterLeftPct).toBeLessThan(100);
    expect(stats.firstOn?.to).toBeLessThan(stats.firstOn?.from ?? 0);
    expect(statsFor(simulateDay(clean, 'off', 35)).goodShare).toBe(1);
  });
});
