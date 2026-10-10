import { describe, expect, it } from 'vitest';
import { cigaretteRule, exposureAvoided, windowMean } from './exposure';
import { hourlySeries } from './testing';
import { buildHours } from './timeline';
import { localHour } from './time';

const observed = hourlySeries('2025-12-01T00:00:00.000Z', 10 * 24, (_index, hour) =>
  hour === 8 ? 300 : hour === 15 ? 60 : 120,
);
const { hours } = buildHours({ observed, asOf: '2025-12-10T00:30:00.000Z', mode: 'replay' });
const startAtLocalHour = (hour: number): string => {
  const found = hours.find(
    (point) => point.kind === 'pattern' && localHour(point.hourStart) === hour,
  );
  if (found === undefined) throw new Error(`no hour ${hour}`);
  return found.hourStart;
};

describe('exposure avoided', () => {
  it('moving from the 8 am peak to 3 pm saves 80% (300 to 60)', () => {
    const result = exposureAvoided(hours, startAtLocalHour(8), startAtLocalHour(15));
    expect(result?.avoidedPct).toBeCloseTo(80, 0);
    expect(result?.avoidedMicrogramHours).toBeCloseTo(240, 0);
  });

  it('is negative when the move is to a worse hour and never above 100', () => {
    expect(
      exposureAvoided(hours, startAtLocalHour(15), startAtLocalHour(8))?.avoidedPct,
    ).toBeLessThan(0);
    expect(
      exposureAvoided(hours, startAtLocalHour(8), startAtLocalHour(15))?.avoidedPct,
    ).toBeLessThanOrEqual(100);
  });

  it('is null when an hour is missing', () => {
    expect(exposureAvoided(hours, '2020-01-01T00:00:00.000Z', startAtLocalHour(15))).toBeNull();
  });

  it('averages consecutive hours', () => {
    expect(windowMean(hours, startAtLocalHour(8), 1)).toBeCloseTo(300, 0);
  });

  it('knows the cigarette rule of thumb: 22 over a day is one', () => {
    expect(cigaretteRule(22, 24)).toBeCloseTo(1, 8);
  });
});
