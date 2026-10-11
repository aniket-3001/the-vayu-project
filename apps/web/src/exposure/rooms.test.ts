// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { Device } from '../devices/devices';
import { recordReading } from '../devices/measured';
import { addDays, countedCells, dayCells, daySummary, today } from './model';
import { sampleSpotsFor } from './spots';
import { allUnits, isRoomPin, withRooms } from './units';

beforeEach(() => {
  window.localStorage.clear();
});

const unit: Device = { id: 'unit:Vayu-78A5', name: 'Vayu-78A5', where: 'home', measured: true };
/** Sixty-odd readings in each of these hours of the given date, which is what makes an hour count. */
function measure(date: string, hours: readonly number[], pm25: number): void {
  for (const hour of hours) {
    const at = Date.parse(`${date}T${String(hour).padStart(2, '0')}:10:00+05:30`);
    for (let i = 0; i < 70; i++) recordReading(window.localStorage, unit.id, at + i * 2000, pm25);
  }
}

describe('a unit with no address set for its place', () => {
  const yesterday = addDays(today(), -1);

  it('is still the room that part of the day is spent in', () => {
    const placed = withRooms({}, [unit]);
    expect(placed.home?.pin.id).toBe('room:unit:Vayu-78A5');
    expect(placed.home !== undefined && isRoomPin(placed.home.pin)).toBe(true);
    expect(placed.home?.from).toBe(0);
    expect(placed.home?.to).toBe(24);
  });

  it('counts only the hours it measured, as measured, and never the outside', () => {
    measure(yesterday, [8, 9, 10], 40);
    const placed = withRooms({}, [unit]);
    const units = allUnits([unit], [placed]);
    const cells = countedCells(dayCells(placed, units, {}, yesterday));
    expect(cells.map((c) => c.hour)).toEqual([8, 9, 10]);
    expect(cells.every((c) => c.source === 'measured' && c.pm25 === 40)).toBe(true);
    const summary = daySummary(placed, units, {}, yesterday);
    expect(summary?.hours).toBe(3);
    expect(summary?.meanPm25).toBe(40);
  });

  it('counts nothing when it has measured nothing, rather than make something up', () => {
    const placed = withRooms({}, [unit]);
    const units = allUnits([unit], [placed]);
    expect(dayCells(placed, units, {}, yesterday)).toEqual([]);
  });

  it('leaves a place the person did set alone, and a sample device out', () => {
    const adult = sampleSpotsFor('adult');
    expect(withRooms(adult, [unit])).toEqual(adult);
    const sample: Device = { id: 'd1', name: 'Vayu monitor', where: 'home' };
    expect(withRooms({}, [sample])).toEqual({});
  });
});

describe('a unit at a place that has an address', () => {
  it('replaces the outside figure for the hours it measured and nothing else', () => {
    const yesterday = addDays(today(), -1);
    measure(yesterday, [9], 18);
    const adult = sampleSpotsFor('adult');
    const placed = withRooms(adult, [unit]);
    const units = allUnits([unit], [placed]);
    const cell = dayCells(placed, units, {}, yesterday).find(
      (c) => c.where === 'home' && c.hour === 9,
    );
    expect(cell?.source).toBe('measured');
    expect(cell?.pm25).toBe(18);
    const other = dayCells(placed, units, {}, yesterday).find(
      (c) => c.where === 'home' && c.hour === 3,
    );
    expect(other?.source).not.toBe('measured');
  });
});
