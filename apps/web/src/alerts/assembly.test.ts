import { describe, expect, it } from 'vitest';
import { sampleDay } from '../today/sample';
import type { TodayData } from '../today/types';
import { assemblyFor } from './assembly';

/** A day whose hourly AQI is all one figure, so the answer depends only on that figure. */
const flat = (aqi: number): TodayData => {
  const day = sampleDay('moderate');
  return { ...day, aqi, hourly: day.hourly.map((h) => ({ ...h, aqi })) };
};

describe('where the morning assembly should be', () => {
  it('is inside when the air is unhealthy', () => {
    const advice = assemblyFor(flat(182));
    expect(advice.where).toBe('inside');
    expect(advice.label).toBe('Inside');
    expect(advice.words).toMatch(/inside/iu);
    expect(advice.aqi).toBe(182);
  });

  it('is on the open ground, kept short, when it is unhealthy only for sensitive groups', () => {
    const advice = assemblyFor(flat(120));
    expect(advice.where).toBe('short');
    expect(advice.words).toMatch(/under 15 minutes/u);
  });

  it('is on the open ground when the air is clean', () => {
    expect(assemblyFor(flat(60)).where).toBe('open');
    expect(assemblyFor(flat(100)).where).toBe('open');
    expect(assemblyFor(flat(150)).where).toBe('short');
    expect(assemblyFor(flat(151)).where).toBe('inside');
  });

  it('says which hour it looked at, in am and pm', () => {
    expect(assemblyFor(flat(60)).when).toMatch(/^(tomorrow, )?8 am$/u);
  });
});
