// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Device } from '../devices/devices';
import { INDOOR_SHARE, TREE_SHARE } from './assumptions';
import {
  EARLIEST,
  TODAY,
  YESTERDAY,
  addDays,
  ambientByHour,
  breathed,
  countedCells,
  dayCells,
  daySummary,
  formatDate,
  hasData,
  hoursSoFar,
  lastWeek,
  openAirFor,
  placeOfFix,
  summarise,
} from './model';
import { sampleSpotsFor, type Spot, type Spots } from './spots';
import { SAMPLE_UNITS, allUnits, type Unit } from './units';

const need = (spot: Spot | undefined): Spot => {
  if (spot === undefined) throw new Error('missing sample spot');
  return spot;
};
const adult = sampleSpotsFor('adult');
const child = sampleSpotsFor('child');
const home = need(adult.home);
const park = need(adult.outdoor);
const monitor: Device = { id: 'd1', name: 'Vayu monitor', where: 'home' };
const ownHome: Unit = {
  id: 'own',
  name: 'Vayu monitor',
  lat: home.pin.lat,
  lng: home.pin.lng,
  own: true,
};

describe('dates', () => {
  it('knows today, yesterday and the earliest date with data, two weeks back', () => {
    expect(TODAY).toBe('2026-10-10');
    expect(YESTERDAY).toBe('2026-10-09');
    expect(EARLIEST).toBe('2026-09-26');
    expect(addDays(TODAY, 3)).toBe('2026-10-13');
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
  });

  it('has data from two weeks ago to today, and none for the future or before that', () => {
    expect(hasData(TODAY)).toBe(true);
    expect(hasData(EARLIEST)).toBe(true);
    expect(hasData(addDays(TODAY, 1))).toBe(false);
    expect(hasData(addDays(EARLIEST, -1))).toBe(false);
    expect(hasData('1999-01-01')).toBe(false);
  });

  it('has 24 finished hours for a past day, 17 for today, and none where there is no data', () => {
    expect(hoursSoFar(YESTERDAY)).toBe(24);
    expect(hoursSoFar(TODAY)).toBe(17);
    expect(hoursSoFar(addDays(TODAY, 2))).toBe(0);
  });

  it('lists the seven days before today, oldest first, and writes a date for people', () => {
    const week = lastWeek();
    expect(week).toHaveLength(7);
    expect(week[6]).toBe(YESTERDAY);
    expect(week[0]).toBe('2026-10-03');
    expect(formatDate('2026-10-10')).toBe('Sat 10 Oct');
  });

  it('reads open air for any day with data, and nothing for a day without', () => {
    expect(ambientByHour(home.pin, '2026-10-02').every((v) => typeof v === 'number')).toBe(true);
    expect(ambientByHour(home.pin, '2025-01-01').every((v) => v === undefined)).toBe(true);
    expect(
      ambientByHour(home.pin, TODAY)
        .slice(17)
        .every((v) => v === undefined),
    ).toBe(true);
  });
});

describe('what a person breathes', () => {
  it('is the open-air figure outdoors, a bit less with trees', () => {
    expect(breathed('outdoor', { ...park, trees: false }, 80, [])).toEqual({
      pm25: 80,
      source: 'outdoor',
    });
    expect(breathed('outdoor', park, 80, [])).toEqual({ pm25: 68, source: 'trees' });
    expect(TREE_SHARE).toBeLessThan(1);
  });

  it('is a share of the outside figure indoors, assumed, until a unit is there', () => {
    expect(breathed('home', home, 100, [])).toEqual({
      pm25: 100 * INDOOR_SHARE,
      source: 'assumed',
    });
    const own = breathed('home', home, 100, [ownHome]);
    expect(own.source).toBe('device');
    expect(own.pm25).toBeLessThan(100 * INDOOR_SHARE);
  });

  it('picks up a shared unit at a place automatically, without the person adding anything', () => {
    const school = need(child.school);
    const got = breathed('school', school, 100, SAMPLE_UNITS);
    expect(got.source).toBe('unit');
    expect(got.pm25).toBeLessThan(100 * INDOOR_SHARE);
  });

  it('uses a unit only at the place it is in', () => {
    expect(breathed('work', need(adult.work), 100, [ownHome]).source).toBe('assumed');
  });
});

describe('a day, hour by hour', () => {
  it('puts each place’s cells in its own hours, across midnight too', () => {
    const cells = dayCells(adult, [], {}, YESTERDAY);
    const hoursOf = (where: string): number[] =>
      cells.filter((c) => c.where === where).map((c) => c.hour);
    expect(hoursOf('work')).toEqual([9, 10, 11, 12, 13, 14, 15, 16]);
    expect(hoursOf('outdoor')).toEqual([17, 18]);
    expect(hoursOf('home')).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 19, 20, 21, 22, 23]);
  });

  it('works for any past date, and gives nothing for a date with no data', () => {
    expect(dayCells(adult, [], {}, '2026-10-02').length).toBe(24);
    expect(dayCells(adult, [], {}, '2024-02-02')).toEqual([]);
    expect(dayCells(adult, [], {}, addDays(TODAY, 1))).toEqual([]);
  });

  it('stops at the present for today', () => {
    const cells = dayCells(adult, [], {}, TODAY);
    expect(Math.max(...cells.map((c) => c.hour))).toBeLessThan(17);
  });

  it('gives a child school hours at school, and an adult none', () => {
    expect(
      dayCells(child, [], {}, YESTERDAY)
        .filter((c) => c.where === 'school')
        .map((c) => c.hour),
    ).toEqual([8, 9, 10, 11, 12, 13, 14]);
    expect(dayCells(adult, [], {}, YESTERDAY).some((c) => c.where === 'school')).toBe(false);
  });

  it('breathes cleaner at school with the school’s own unit, for a child who added nothing', () => {
    const without = dayCells(child, [], {}, YESTERDAY).filter((c) => c.where === 'school');
    const withUnit = dayCells(child, SAMPLE_UNITS, {}, YESTERDAY).filter(
      (c) => c.where === 'school',
    );
    const mean = (cs: typeof without): number => cs.reduce((s, c) => s + c.pm25, 0) / cs.length;
    expect(withUnit.every((c) => c.source === 'unit')).toBe(true);
    expect(mean(withUnit)).toBeLessThan(mean(without));
  });

  it('shares one home monitor across every kind of person who lives there', () => {
    const units = allUnits([monitor], [child, adult, sampleSpotsFor('senior')]);
    for (const spots of [child, adult, sampleSpotsFor('senior')]) {
      const cells = dayCells(spots, units, {}, YESTERDAY).filter((c) => c.where === 'home');
      expect(cells.every((c) => c.source === 'device')).toBe(true);
    }
  });

  it('leaves unset places out, and an empty set of places gives an empty day', () => {
    expect(dayCells({}, [], {}, TODAY)).toEqual([]);
    const justHome: Spots = { home };
    expect(new Set(dayCells(justHome, [], {}, YESTERDAY).map((c) => c.where))).toEqual(
      new Set(['home']),
    );
  });
});

describe('live location', () => {
  it('knows a fix is in a set place when within 300 m', () => {
    expect(placeOfFix({ lat: home.pin.lat + 0.001, lng: home.pin.lng }, adult)).toBe('home');
    expect(placeOfFix({ lat: 28.7, lng: 77.5 }, adult)).toBeUndefined();
  });

  it('counts a live cell ahead of the schedule, today only', () => {
    const live = { '9': { lat: 28.7, lng: 77.5 } };
    const counted = countedCells(dayCells(adult, [], live, TODAY));
    expect(counted.find((c) => c.hour === 9)?.where).toBe('live');
    expect(dayCells(adult, [], live, YESTERDAY).some((c) => c.where === 'live')).toBe(false);
    expect(
      dayCells(adult, [], { '20': { lat: 28.6, lng: 77.2 } }, TODAY).some(
        (c) => c.where === 'live',
      ),
    ).toBe(false);
  });

  it('picks up a unit by itself when the person is visiting somewhere that has one', () => {
    const friend = SAMPLE_UNITS.find((u) => u.id === 'unit-friend');
    if (friend === undefined) throw new Error('no friend unit');
    const live = { '15': { lat: friend.lat, lng: friend.lng } };
    const visit = dayCells(adult, SAMPLE_UNITS, live, TODAY).find(
      (c) => c.where === 'live' && c.hour === 15,
    );
    const away = dayCells(adult, [], live, TODAY).find((c) => c.where === 'live' && c.hour === 15);
    expect(visit?.source).toBe('unit');
    expect(away?.source).toBe('outdoor');
    expect(visit?.pm25).toBeLessThan(away?.pm25 ?? 0);
  });
});

describe('the summary', () => {
  const counted = countedCells(dayCells(adult, [], {}, YESTERDAY));

  it('counts one cell per hour for a full day', () => {
    expect(counted).toHaveLength(24);
  });

  it('is a mean, an AQI, a level, the same hours in open air, and the WHO multiple', () => {
    const summary = summarise(counted, openAirFor(counted, adult, {}, YESTERDAY));
    expect(summary?.hours).toBe(24);
    expect(summary?.fullDay).toBe(true);
    expect(summary?.whoTimes).toBeCloseTo((summary?.meanPm25 ?? 0) / 15, 0);
    expect(summary?.hoursByLevel.reduce((a, b) => a + b, 0)).toBe(24);
    expect(summary?.meanPm25 ?? 0).toBeLessThan(summary?.openAirPm25 ?? 0);
  });

  it('adds up a whole day for any date, and says nothing for a date with no data', () => {
    expect(daySummary(adult, [], {}, '2026-10-04')?.aqi).toBeGreaterThan(0);
    expect(daySummary(adult, [], {}, '2024-01-01')).toBeUndefined();
    expect(summarise([], [])).toBeUndefined();
  });

  it('gives different days different answers across a week', () => {
    const aqis = lastWeek().map((d) => daySummary(adult, [], {}, d)?.aqi);
    expect(new Set(aqis).size).toBeGreaterThan(2);
  });
});
