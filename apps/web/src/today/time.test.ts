import { describe, expect, it } from 'vitest';
import { clock24, dayMonth, hourOfDay, isoDate, startOfDay, weekday } from './time';

const AT = '2026-10-10T03:00:00.000Z'; // 08:30 in India

describe('India time', () => {
  it('reads a moment as the clock on the wall in Delhi', () => {
    expect(clock24(AT)).toBe('08:30');
    expect(hourOfDay(AT)).toBe(8.5);
  });
  it('knows the day, the date and the weekday in Delhi, not in UTC', () => {
    expect(weekday(AT)).toBe('Sat');
    expect(dayMonth(AT)).toBe('10 Oct');
    // 20:00 UTC on the 10th is already 01:30 on the 11th in Delhi.
    expect(isoDate('2026-10-10T20:00:00.000Z')).toBe('2026-10-11');
    expect(weekday('2026-10-10T20:00:00.000Z')).toBe('Sun');
  });
  it('finds midnight at the start of the Delhi day', () => {
    expect(startOfDay(AT)).toBe('2026-10-09T18:30:00.000Z');
    expect(startOfDay('2026-10-09T18:30:00.000Z')).toBe('2026-10-09T18:30:00.000Z');
  });
});
