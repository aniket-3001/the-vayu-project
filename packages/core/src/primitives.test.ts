import { describe, expect, it } from 'vitest';
import { fixedClock, liveClock, replayClock } from './clock';
import { makeProvenance, trustLabelFor } from './provenance';
import { clamp, groupBy, mean, seededRandom } from './stats';
import { formatHour, hourOfDay, localDate, localHour, toIso, toMs } from './time';

describe('clocks', () => {
  it('a replay clock runs at the chosen speed', () => {
    let wall = 1_000_000;
    const clock = replayClock('2025-12-13T00:00:00.000Z', 60, () => wall);
    expect(clock.now()).toBe('2025-12-13T00:00:00.000Z');
    wall += 60_000; // one real minute is one replay hour
    expect(clock.now()).toBe('2025-12-13T01:00:00.000Z');
    expect(clock.mode).toBe('replay');
  });

  it('live and fixed clocks report their mode', () => {
    expect(liveClock(() => 0).now()).toBe('1970-01-01T00:00:00.000Z');
    expect(liveClock().mode).toBe('live');
    expect(fixedClock('2025-12-13T00:00:00.000Z').now()).toBe('2025-12-13T00:00:00.000Z');
  });
});

describe('India time', () => {
  it('is UTC+05:30', () => {
    expect(localHour('2025-12-10T00:30:00.000Z')).toBe(6);
    expect(localDate('2025-12-09T20:00:00.000Z')).toBe('2025-12-10');
    expect(formatHour('2025-12-10T09:30:00.000Z')).toBe('3\u00a0pm');
    expect(formatHour('2025-12-10T18:30:00.000Z')).toBe('12\u00a0am');
  });

  it('parses a time of day', () => {
    expect(hourOfDay('05:00')).toBe(5);
    expect(() => hourOfDay('nonsense')).toThrow(RangeError);
  });

  it('round-trips and rejects invalid timestamps', () => {
    expect(toIso(toMs('2025-12-10T00:00:00.000Z'))).toBe('2025-12-10T00:00:00.000Z');
    expect(() => toMs('not a date')).toThrow(RangeError);
  });
});

describe('provenance (rule I2)', () => {
  it('computes the age so nobody can forget it', () => {
    const prov = makeProvenance({
      mode: 'live',
      source: 'station',
      asOf: '2025-12-10T10:00:00.000Z',
      observedAt: '2025-12-10T09:20:00.000Z',
      stationId: 's1',
    });
    expect(prov.ageMinutes).toBe(40);
    expect(prov.label).toBe('Nearby station');
    expect(prov.stationId).toBe('s1');
  });

  it('maps every source to a trust label', () => {
    expect(trustLabelFor('unit')).toBe('Your room');
    expect(trustLabelFor('station')).toBe('Nearby station');
    expect(trustLabelFor('forecast')).toBe('Estimate');
    expect(trustLabelFor('pattern')).toBe('Estimate');
    expect(trustLabelFor('model')).toBe('Estimate');
  });

  it('flags simulated data and omits absent fields', () => {
    const prov = makeProvenance({
      mode: 'model',
      source: 'model',
      asOf: '2025-12-10T10:00:00.000Z',
      simulated: true,
    });
    expect(prov.simulated).toBe(true);
    expect('stationId' in prov).toBe(false);
  });
});

describe('stats', () => {
  it('averages, clamps and groups', () => {
    expect(mean([1, 2, 3])).toBe(2);
    expect(() => mean([])).toThrow(RangeError);
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect([...(groupBy([1, 2, 3, 4], (n) => n % 2).get(0) ?? [])]).toEqual([2, 4]);
  });

  it('a seeded generator repeats', () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
