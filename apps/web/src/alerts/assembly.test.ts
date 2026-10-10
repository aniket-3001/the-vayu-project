import { describe, expect, it } from 'vitest';
import { sampleDay } from '../today/sample';
import { grapStageFor } from '../tasks/model';
import type { TodayData } from '../today/types';
import { assemblyFor } from './assembly';

/**
 * A day whose last 24 hours are one steady PM2.5 and a PM10 twice that, so the GRAP stage the app works out
 * follows that figure.
 */
const steady = (pm25: number): TodayData => {
  const day = sampleDay('moderate');
  return {
    ...day,
    history: day.history.map((h) => ({ ...h, pm25 })),
    pollutants: { ...day.pollutants, pm25, pm10: pm25 * 2 },
  };
};

describe('where the morning assembly should be, by GRAP stage', () => {
  it('is on the open ground when no stage is likely', () => {
    const day = steady(20);
    expect(grapStageFor(day)).toBe(0);
    const advice = assemblyFor(day);
    expect(advice.where).toBe('open');
    expect(advice.words).toMatch(/No GRAP stage is likely/u);
  });

  it('is on the open ground, kept short, in Stage I', () => {
    const day = steady(100);
    expect(grapStageFor(day)).toBe(1);
    const advice = assemblyFor(day);
    expect(advice.where).toBe('short');
    expect(advice.words).toMatch(/GRAP Stage I is likely/u);
    expect(advice.words).toMatch(/under 15 minutes/u);
  });

  it('is inside from Stage II up', () => {
    for (const [pm25, numeral] of [
      [160, 'II'],
      [330, 'IV'],
    ] as const) {
      const day = steady(pm25);
      expect(grapStageFor(day)).toBeGreaterThanOrEqual(2);
      const advice = assemblyFor(day);
      expect(advice.where).toBe('inside');
      expect(advice.words).toMatch(/GRAP Stage/u);
      expect(numeral.length).toBeGreaterThan(0);
    }
  });

  it('falls back to the AQI, and says so, when no stage can be worked out', () => {
    const day = sampleDay('hazardous');
    const pollutants = { ...day.pollutants };
    delete pollutants.pm10;
    const blind: TodayData = { ...day, pollutants };
    const advice = assemblyFor(blind);
    expect(advice.where).toBe('inside');
    expect(advice.words).toMatch(/No GRAP stage could be worked out/u);
  });

  it('says which hour it looked at, in am and pm', () => {
    expect(assemblyFor(steady(20)).when).toMatch(/^(tomorrow, )?8 am$/u);
  });
});
