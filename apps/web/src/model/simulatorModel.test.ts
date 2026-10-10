import { describe, expect, it } from 'vitest';
import { REPLAY_WEEKS } from '../data/replayWeeks';
import { OUR_UNIT, ROOM_PRESETS } from '../data/simPresets';
import { chartSeries, runSimulation } from './simulatorModel';

const week = REPLAY_WEEKS[0];
const room = ROOM_PRESETS[0];
if (week === undefined || room === undefined) {
  throw new Error('expected at least one replay week and one room preset');
}

describe('runSimulation (05.2)', () => {
  it('re-runs core.simulate from the current controls — more units, lower indoor level', () => {
    const base = {
      week,
      room,
      cleaner: OUR_UNIT,
      events: [],
      durationHours: 24,
    };
    const noCleaner = runSimulation({ ...base, unitCount: 0 });
    const withCleaners = runSimulation({ ...base, unitCount: 2 });

    expect(withCleaners.summary.steadyPm25).toBeLessThan(noCleaner.summary.steadyPm25);
    expect(withCleaners.summary.unitsNeeded).toBeGreaterThan(0);
  });

  it('is pure: the same controls always give the same result', () => {
    const input = { week, room, cleaner: OUR_UNIT, unitCount: 1, events: [], durationHours: 12 };
    expect(runSimulation(input)).toEqual(runSimulation(input));
  });
});

describe('chartSeries (05.3)', () => {
  it('labels every series — Historical, Model and Measured, never mixed', () => {
    const result = runSimulation({
      week,
      room,
      cleaner: OUR_UNIT,
      unitCount: 1,
      events: [],
      durationHours: 24,
    });
    const series = chartSeries(result, week.outdoor, week.startAt);
    expect(series.map((s) => s.label)).toEqual(['Historical', 'Model', 'Measured']);
  });

  it('never shows a point after the replay clock (rule I1)', () => {
    const result = runSimulation({
      week,
      room,
      cleaner: OUR_UNIT,
      unitCount: 1,
      events: [],
      durationHours: 24,
    });
    const cutoff = '2025-12-05T03:00:00.000Z'; // three hours into the week
    const series = chartSeries(result, week.outdoor, cutoff);
    for (const s of series) {
      for (const point of s.points) {
        expect(new Date(point.ts).getTime()).toBeLessThanOrEqual(new Date(cutoff).getTime());
      }
    }
    const modelSeries = series.find((s) => s.label === 'Model');
    expect(modelSeries?.points.length).toBeGreaterThan(0);
  });

  it('includes measured points only up to the replay clock too', () => {
    const result = runSimulation({
      week,
      room,
      cleaner: OUR_UNIT,
      unitCount: 1,
      events: [],
      durationHours: 24,
    });
    const measured = [
      { ts: '2025-12-05T01:00:00.000Z', value: 100 },
      { ts: '2025-12-05T10:00:00.000Z', value: 90 },
    ];
    const series = chartSeries(result, week.outdoor, '2025-12-05T05:00:00.000Z', measured);
    const measuredSeries = series.find((s) => s.label === 'Measured');
    expect(measuredSeries?.points).toHaveLength(1);
  });
});
