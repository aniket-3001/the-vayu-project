// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { forgetMeasured, measuredHourly, MIN_READINGS_PER_HOUR, recordReading } from './measured';

beforeEach(() => {
  window.localStorage.clear();
});

// 10 Oct 2026, 11:30 India time is 06:00 UTC.
const AT = Date.parse('2026-10-10T06:00:00.000Z');

describe('what a unit measured, by the hour', () => {
  it('counts an hour only when it has enough readings, and gives their mean', () => {
    for (let i = 0; i < MIN_READINGS_PER_HOUR - 1; i++)
      recordReading(window.localStorage, 'u1', AT + i * 2000, 40);
    expect(measuredHourly(window.localStorage, 'u1', '2026-10-10')[11]).toBeUndefined();
    recordReading(window.localStorage, 'u1', AT + 59 * 2000, 80);
    const got = measuredHourly(window.localStorage, 'u1', '2026-10-10')[11];
    expect(got).toBeCloseTo((40 * 59 + 80) / 60, 1);
  });

  it('keeps each unit and each day apart, and can forget a unit', () => {
    for (let i = 0; i < 60; i++) recordReading(window.localStorage, 'u1', AT + i * 1000, 30);
    for (let i = 0; i < 60; i++) recordReading(window.localStorage, 'u2', AT + i * 1000, 90);
    expect(measuredHourly(window.localStorage, 'u1', '2026-10-10')[11]).toBe(30);
    expect(measuredHourly(window.localStorage, 'u2', '2026-10-10')[11]).toBe(90);
    expect(measuredHourly(window.localStorage, 'u1', '2026-10-09')[11]).toBeUndefined();
    forgetMeasured(window.localStorage, 'u1');
    expect(measuredHourly(window.localStorage, 'u1', '2026-10-10')[11]).toBeUndefined();
    expect(measuredHourly(window.localStorage, 'u2', '2026-10-10')[11]).toBe(90);
  });

  it('ignores a number that is not a reading', () => {
    recordReading(window.localStorage, 'u1', AT, Number.NaN);
    recordReading(window.localStorage, 'u1', AT, -5);
    expect(window.localStorage.getItem('vayu.measured.v1')).toBeNull();
  });
});
