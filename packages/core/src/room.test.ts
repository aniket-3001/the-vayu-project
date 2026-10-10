import fc from 'fast-check';
import type { CleanerSpec, RoomSpec, SimInput } from '@vayu/contracts';
import { describe, expect, it } from 'vitest';
import { simulate, steadyState, stepConcentration } from './room';
import { hourlySeries } from './testing';

const roomOf = (volumeM3 = 150, airChangesPerHour = 3): RoomSpec => ({
  id: 'classroom',
  name: 'Classroom',
  lengthM: 10,
  widthM: 5,
  heightM: volumeM3 / 50,
  airChangesPerHour,
  leakiness: 'custom',
  volumeM3,
});

const cleanerOf = (cadr = 400): CleanerSpec => ({
  id: 'unit',
  name: 'Our unit',
  layers: ['foam', 'merv13'],
  cadrM3h: { pm25: cadr, pm10: cadr * 1.5 },
  basis: 'assumed',
});

const outdoor = hourlySeries('2025-12-10T00:00:00.000Z', 24, () => 200);

const scenario = (
  cleaners: SimInput['cleaners'],
  events: SimInput['events'] = [],
  volumeM3 = 150,
): SimInput => ({
  room: roomOf(volumeM3),
  cleaners,
  outdoor,
  events,
  startAt: '2025-12-10T00:00:00.000Z',
  durationHours: 6,
});

describe('room model', () => {
  it('converges to the steady state with repeated steps', () => {
    const settled = Array.from({ length: 200 }).reduce<number>(
      (level) => stepConcentration(level, 3, 0.85, 200, 0.2, 400, 150, 0.1),
      0,
    );
    expect(settled).toBeCloseTo(steadyState(3, 0.85, 200, 0.2, 400, 150), 4);
  });

  it('with no cleaner the steady state is a * P * Cout / (a + k)', () => {
    expect(steadyState(3, 0.85, 200, 0.2, 0, 150)).toBeCloseTo((3 * 0.85 * 200) / 3.2, 8);
  });

  it('a cleaner lowers the indoor level and reports the clean-air changes per hour', () => {
    const { summary } = simulate(scenario([{ spec: cleanerOf(), count: 1 }]));
    expect(summary.steadyPm25).toBeLessThan(summary.steadyPm25NoCleaner);
    expect(summary.lowerPct).toBeGreaterThan(30);
    expect(summary.changesPerHour).toBeCloseTo(400 / 150, 6);
  });

  it('a smoke puff clears faster with a cleaner than without', () => {
    const puff = [{ at: '2025-12-10T01:00:00.000Z', kind: 'smoke' as const, pm25: 400, pm10: 450 }];
    const result = simulate(scenario([{ spec: cleanerOf(), count: 1 }], puff));
    const puffIndex = result.series.findIndex((point) => point.ts === '2025-12-10T01:00:00.000Z');
    const thirtyMinutesLater = puffIndex + 6;
    expect(result.series[thirtyMinutesLater]?.pm25).toBeLessThan(
      result.baseline[thirtyMinutesLater]?.pm25 ?? Number.NEGATIVE_INFINITY,
    );
  });

  it('needs more units for a bigger room and fewer for a stronger unit', () => {
    const unitsFor = (cadr: number, volumeM3: number): number =>
      simulate({ ...scenario([{ spec: cleanerOf(cadr), count: 1 }], [], volumeM3), targetAch: 5 })
        .summary.unitsNeeded;
    expect(unitsFor(400, 150)).toBeGreaterThan(unitsFor(400, 40));
    expect(unitsFor(800, 150)).toBeLessThan(unitsFor(400, 150));
    expect(unitsFor(400, 150)).toBe(Math.ceil((5 * 150) / 400));
  });

  it('lists its assumptions with their basis', () => {
    const { assumptions } = simulate(scenario([{ spec: cleanerOf(), count: 1 }]));
    expect(assumptions.some((assumption) => assumption.basis === 'assumed')).toBe(true);
    expect(assumptions.find((assumption) => assumption.name.includes('CADR'))?.basis).toBe(
      'assumed',
    );
  });

  it('refuses to run without outdoor data', () => {
    expect(() => simulate({ ...scenario([]), outdoor: [] })).toThrow(RangeError);
  });

  it('more cleaners never raise the steady level (property)', () => {
    const steadyWith = (count: number): number =>
      simulate(scenario([{ spec: cleanerOf(), count }])).summary.steadyPm25;
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 6 }),
        fc.integer({ min: 0, max: 6 }),
        (a, b) => steadyWith(Math.max(a, b)) <= steadyWith(Math.min(a, b)) + 1e-9,
      ),
    );
  });

  it('never goes negative (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 20, max: 300 }),
        (count, volume) =>
          simulate(scenario([{ spec: cleanerOf(), count }], [], volume)).series.every(
            (point) => point.pm25 >= 0 && point.pm10 >= 0,
          ),
      ),
    );
  });
});
