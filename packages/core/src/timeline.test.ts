import { describe, expect, it } from 'vitest';
import {
  availableHours,
  biasFactor,
  buildHours,
  daySummaries,
  findWindow,
  headline,
  patternForecast,
} from './timeline';
import { hourlySeries } from './testing';
import { localHour, toMs } from './time';

// Ten days of hourly data. Morning peak, afternoon low.
const START = '2025-12-01T00:00:00.000Z';
const profile = (_index: number, hour: number): number =>
  hour >= 7 && hour <= 10 ? 220 : hour >= 14 && hour <= 16 ? 45 : 120;
const observed = hourlySeries(START, 10 * 24, profile);
// 06:00 India time on 2025-12-10.
const AS_OF = '2025-12-10T00:30:00.000Z';

const poisonFuture = (hours: ReturnType<typeof hourlySeries>): typeof hours =>
  hours.map((hour) =>
    toMs(hour.hourStart) >= toMs(AS_OF) ? { ...hour, pm25: 1e6, pm10: 1e6 } : hour,
  );

describe('rule I1: no look-ahead', () => {
  it('lets through only hours that have ended by asOf', () => {
    const latestEnd = Math.max(
      ...availableHours(observed, AS_OF).map((hour) => toMs(hour.hourStart) + 3_600_000),
    );
    expect(latestEnd).toBeLessThanOrEqual(toMs(AS_OF));
  });

  it('gives the pattern forecast the same answer whatever happens after asOf', () => {
    expect(patternForecast(poisonFuture(observed), AS_OF, 24)).toEqual(
      patternForecast(observed, AS_OF, 24),
    );
  });

  it('gives buildHours the same answer whatever happens after asOf', () => {
    const clean = buildHours({ observed, asOf: AS_OF, mode: 'replay' });
    const poisoned = buildHours({ observed: poisonFuture(observed), asOf: AS_OF, mode: 'replay' });
    expect(poisoned.hours.map((hour) => hour.pm25)).toEqual(clean.hours.map((hour) => hour.pm25));
  });
});

describe('buildHours', () => {
  const built = buildHours({
    observed,
    asOf: AS_OF,
    mode: 'replay',
    station: { id: 's1', name: 'R K Puram', distanceKm: 3 },
  });

  it('gives 24 observed hours then a pattern forecast, each with provenance (rule I2)', () => {
    expect(built.hours.filter((hour) => hour.kind === 'observed')).toHaveLength(24);
    expect(built.futureKind).toBe('pattern');
    for (const hour of built.hours) {
      expect(hour.prov.mode).toBe('replay');
      expect(hour.prov.asOf).toBe(AS_OF);
    }
    expect(built.hours.find((hour) => hour.kind === 'observed')?.prov.label).toBe('Nearby station');
    expect(built.hours.find((hour) => hour.kind === 'pattern')?.prov.label).toBe('Estimate');
  });

  it('reports how old the newest reading is', () => {
    expect(built.latestObservedAgeMinutes).toBeLessThan(60);
  });

  it('uses a supplied forecast and corrects its bias', () => {
    const halfAsHigh = hourlySeries(
      '2025-12-09T00:00:00.000Z',
      72,
      (_i, hour) => profile(0, hour) / 2,
    );
    const factor = biasFactor(observed, halfAsHigh, AS_OF);
    expect(factor).toBeGreaterThan(1.8);
    expect(factor).toBeLessThanOrEqual(3);
    const withForecast = buildHours({ observed, forecast: halfAsHigh, asOf: AS_OF, mode: 'live' });
    expect(withForecast.futureKind).toBe('forecast');
    expect(withForecast.biasFactor).toBeCloseTo(factor, 6);
  });

  it('clamps the bias factor to the range 0.5 to 3', () => {
    expect(
      biasFactor(
        observed,
        hourlySeries('2025-12-09T00:00:00.000Z', 72, () => 0.001),
        AS_OF,
      ),
    ).toBe(3);
    expect(
      biasFactor(
        observed,
        hourlySeries('2025-12-09T00:00:00.000Z', 72, () => 1e6),
        AS_OF,
      ),
    ).toBe(0.5);
  });
});

describe('a live timeline does not call its forecast live', () => {
  const station = { id: 's1', name: 'Air Check', distanceKm: 3.6 };
  const built = buildHours({ observed, asOf: AS_OF, mode: 'live', station });

  it('keeps observed hours live, tied to their station', () => {
    const point = built.hours.find((hour) => hour.kind === 'observed');
    expect(point?.prov.mode).toBe('live');
    expect(point?.prov.stationName).toBe('Air Check');
  });

  it('labels forecast and pattern hours as model output, with no station attached', () => {
    const future = built.hours.filter((hour) => hour.kind !== 'observed');
    expect(future.length).toBeGreaterThan(0);
    for (const point of future) {
      expect(point.prov.mode).toBe('model');
      expect(point.prov.stationName).toBeUndefined();
      expect(point.prov.stationId).toBeUndefined();
    }
  });

  it('leaves replay timelines alone', () => {
    const replay = buildHours({ observed, asOf: AS_OF, mode: 'replay' });
    expect(replay.hours.every((hour) => hour.prov.mode === 'replay')).toBe(true);
  });
});

describe('sample data', () => {
  it('labels every hour as simulated when asked', () => {
    const built = buildHours({ observed, asOf: AS_OF, mode: 'replay', simulated: true });
    expect(built.hours.every((hour) => hour.prov.simulated === true)).toBe(true);
  });
});

describe('findWindow', () => {
  const built = buildHours({ observed, asOf: AS_OF, mode: 'replay' });
  const input = {
    hours: built.hours,
    asOf: AS_OF,
    kind: 'walk' as const,
    latestObservedAgeMinutes: built.latestObservedAgeMinutes,
  };

  it('finds the afternoon low and compares it with the usual 8 am', () => {
    const search = findWindow(input);
    expect(search.kind).toBe('advice');
    if (search.kind !== 'advice') return;
    expect(localHour(search.window.start)).toBeGreaterThanOrEqual(14);
    expect(localHour(search.window.start)).toBeLessThanOrEqual(16);
    expect(search.window.band).toBe('satisfactory');
    expect(search.window.comparison?.lessPct).toBeGreaterThan(70);
    expect(headline(search)).toMatch(/^Good hour for a walk: \d+\s(am|pm) to \d+\s(am|pm)$/);
  });

  it('never advises from stale data (rule I3)', () => {
    const search = findWindow({ ...input, latestObservedAgeMinutes: 181 });
    expect(search).toEqual({ kind: 'none', reason: 'stale' });
    expect(headline(search)).toMatch(/too old/);
  });

  it('still advises at 120 minutes: warned, not blocked', () => {
    expect(findWindow({ ...input, latestObservedAgeMinutes: 120 }).kind).toBe('advice');
  });

  it('says no_data when nothing was observed', () => {
    expect(findWindow({ ...input, latestObservedAgeMinutes: null })).toEqual({
      kind: 'none',
      reason: 'no_data',
    });
  });

  it('says there is no good window on a uniformly bad day', () => {
    const bad = buildHours({
      observed: hourlySeries(START, 10 * 24, () => 300),
      asOf: AS_OF,
      mode: 'replay',
    });
    const search = findWindow({
      hours: bad.hours,
      asOf: AS_OF,
      kind: 'walk',
      latestObservedAgeMinutes: bad.latestObservedAgeMinutes,
    });
    expect(search).toEqual({ kind: 'none', reason: 'no_good_window' });
    expect(headline(search)).toMatch(/No clean hour/);
  });

  it('uses the stricter limit for the child and parent chips', () => {
    const moderate = buildHours({
      observed: hourlySeries(START, 10 * 24, () => 45),
      asOf: AS_OF,
      mode: 'replay',
    });
    const base = {
      hours: moderate.hours,
      asOf: AS_OF,
      kind: 'walk' as const,
      latestObservedAgeMinutes: moderate.latestObservedAgeMinutes,
    };
    expect(findWindow(base).kind).toBe('advice');
    expect(findWindow({ ...base, sensitive: true })).toEqual({
      kind: 'none',
      reason: 'no_good_window',
    });
  });

  it('only proposes hours inside the allowed day', () => {
    const search = findWindow(input);
    if (search.kind !== 'advice') throw new Error('expected advice');
    expect(localHour(search.window.start)).toBeGreaterThanOrEqual(5);
    expect(localHour(search.window.start)).toBeLessThan(21);
  });
});

describe('daySummaries', () => {
  it('gives the minimum, maximum and worst band per local day', () => {
    const built = buildHours({
      observed,
      asOf: AS_OF,
      mode: 'replay',
      hoursBack: 48,
      hoursAhead: 0,
    });
    const [first] = daySummaries(built.hours);
    expect(first?.minPm25).toBe(45);
    expect(first?.maxPm25).toBe(220);
    expect(first?.worstBand).toBe('very_poor');
  });
});
