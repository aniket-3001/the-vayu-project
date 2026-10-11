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
  it('is on the open ground when the air is below the GRAP bands', () => {
    const day = steady(20);
    expect(grapStageFor(day)).toBe(0);
    const advice = assemblyFor(day);
    expect(advice.where).toBe('open');
    expect(advice.words).toMatch(/The air is below the GRAP bands/u);
  });

  it('is on the open ground, kept short, in Stage I', () => {
    const day = steady(100);
    expect(grapStageFor(day)).toBe(1);
    const advice = assemblyFor(day);
    expect(advice.where).toBe('short');
    expect(advice.words).toMatch(/GRAP Stage I band/u);
    expect(advice.words).toMatch(/under 15 minutes/u);
  });

  it('is inside in Stage II and III, limiting time outside', () => {
    for (const pm25 of [160, 235]) {
      const day = steady(pm25);
      const stage = grapStageFor(day);
      expect(stage).toBeGreaterThanOrEqual(2);
      expect(stage).toBeLessThanOrEqual(3);
      const advice = assemblyFor(day);
      expect(advice.where).toBe('inside');
      expect(advice.words).toMatch(/GRAP Stage/u);
    }
    expect(assemblyFor(steady(160)).words).toMatch(/limit time outside/iu);
  });

  it('holds no assembly at all in Stage IV: the school is likely closed', () => {
    const day = steady(330);
    expect(grapStageFor(day)).toBe(4);
    const advice = assemblyFor(day);
    expect(advice.where).toBe('closed');
    expect(advice.label).toMatch(/school likely closed/iu);
    expect(advice.words).toMatch(/no assembly to hold/u);
    expect(advice.words).not.toMatch(/hold assembly inside/iu);
    expect(advice.rules.join(' ')).toMatch(/closed or moved online/u);
  });

  it('falls back to the AQI, and says so, when no stage can be worked out', () => {
    const day = sampleDay('hazardous');
    // A monitor that has given only a few hours has no 24-hour figure, so no stage.
    const blind: TodayData = { ...day, history: day.history.slice(-5) };
    const advice = assemblyFor(blind);
    expect(advice.where).toBe('inside');
    expect(advice.words).toMatch(/No GRAP stage could be worked out/u);
  });

  it('says which hour it looked at, in am and pm', () => {
    expect(assemblyFor(steady(20)).when).toMatch(/^(tomorrow, )?8 am$/u);
  });
});
