// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Device } from '../devices/devices';
import { INDOOR_SHARE, TREE_SHARE } from './assumptions';
import type { Outing } from './outings';
import {
  earliest,
  today,
  yesterday,
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
import { SAMPLE_UNITS } from '../testing/sampleExposure';
import { allUnits, type Unit } from './units';

const need = (spot: Spot | undefined): Spot => {
  if (spot === undefined) throw new Error('missing sample spot');
  return spot;
};
const adult = sampleSpotsFor('adult');
const child = sampleSpotsFor('child');
const home = need(adult.home);
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
    expect(today()).toBe('2026-10-10');
    expect(yesterday()).toBe('2026-10-09');
    expect(earliest()).toBe('2026-09-26');
    expect(addDays(today(), 3)).toBe('2026-10-13');
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
  });

  it('has data from two weeks ago to today, and none for the future or before that', () => {
    expect(hasData(today())).toBe(true);
    expect(hasData(earliest())).toBe(true);
    expect(hasData(addDays(today(), 1))).toBe(false);
    expect(hasData(addDays(earliest(), -1))).toBe(false);
    expect(hasData('1999-01-01')).toBe(false);
  });

  it('has 24 finished hours for a past day, 17 for today, and none where there is no data', () => {
    expect(hoursSoFar(yesterday())).toBe(24);
    expect(hoursSoFar(today())).toBe(17);
    expect(hoursSoFar(addDays(today(), 2))).toBe(0);
  });

  it('lists the seven days before today, oldest first, and writes a date for people', () => {
    const week = lastWeek();
    expect(week).toHaveLength(7);
    expect(week[6]).toBe(yesterday());
    expect(week[0]).toBe('2026-10-03');
    expect(formatDate('2026-10-10')).toBe('Sat 10 Oct');
  });

  it('reads open air for any day with data, and nothing for a day without', () => {
    expect(ambientByHour(home.pin, '2026-10-02').every((v) => typeof v === 'number')).toBe(true);
    expect(ambientByHour(home.pin, '2025-01-01').every((v) => v === undefined)).toBe(true);
    expect(
      ambientByHour(home.pin, today())
        .slice(17)
        .every((v) => v === undefined),
    ).toBe(true);
  });
});

describe('what a person breathes', () => {
  it('is a share of the outside figure indoors, assumed, until a unit is there', () => {
    expect(breathed(home, 100, [])).toEqual({
      pm25: 100 * INDOOR_SHARE,
      source: 'assumed',
    });
    const own = breathed(home, 100, [ownHome]);
    expect(own.source).toBe('device');
    expect(own.pm25).toBeLessThan(100 * INDOOR_SHARE);
  });

  it('picks up a shared unit at a place automatically, without the person adding anything', () => {
    const school = need(child.school);
    const got = breathed(school, 100, SAMPLE_UNITS);
    expect(got.source).toBe('unit');
    expect(got.pm25).toBeLessThan(100 * INDOOR_SHARE);
  });

  it('uses a unit only at the place it is in', () => {
    expect(breathed(need(adult.work), 100, [ownHome]).source).toBe('assumed');
  });
});

describe('a day, hour by hour', () => {
  it('puts work in its own hours, and home in every hour, so the rest of the day is at home', () => {
    const cells = dayCells(adult, [], {}, yesterday());
    const hoursOf = (where: string): number[] =>
      cells.filter((c) => c.where === where).map((c) => c.hour);
    expect(hoursOf('work')).toEqual([9, 10, 11, 12, 13, 14, 15, 16]);
    expect(hoursOf('outdoor')).toEqual([]);
    expect(hoursOf('home')).toHaveLength(24);
    const counted = countedCells(cells);
    expect(counted.filter((c) => c.where === 'work')).toHaveLength(8);
    expect(counted.filter((c) => c.where === 'home')).toHaveLength(16);
  });

  it('keeps school and work off weekends and public holidays, and on only the days chosen', () => {
    const hoursOf = (cells: ReturnType<typeof dayCells>, where: string): number =>
      cells.filter((c) => c.where === where).length;
    // Saturday 3 Oct, Sunday 4 Oct, and Friday 2 Oct, which is Gandhi Jayanti.
    for (const date of ['2026-10-03', '2026-10-04', '2026-10-02'])
      expect(hoursOf(dayCells(adult, [], {}, date), 'work'), date).toBe(0);
    expect(hoursOf(dayCells(adult, [], {}, '2026-10-05'), 'work')).toBe(8);
    expect(hoursOf(dayCells(child, [], {}, '2026-10-03'), 'school')).toBe(0);
    const saturdays = { ...adult, work: { ...need(adult.work), days: [1, 2, 3, 4, 5, 6] } };
    expect(hoursOf(dayCells(saturdays, [], {}, '2026-10-03'), 'work')).toBe(8);
    const mwf = { ...adult, work: { ...need(adult.work), days: [1, 3, 5] } };
    expect(hoursOf(dayCells(mwf, [], {}, '2026-10-06'), 'work')).toBe(0);
    expect(hoursOf(dayCells(mwf, [], {}, '2026-10-07'), 'work')).toBe(8);
  });

  it('works for any past date, and gives nothing for a date with no data', () => {
    expect(dayCells(adult, [], {}, '2026-10-02').length).toBe(24);
    expect(dayCells(adult, [], {}, '2024-02-02')).toEqual([]);
    expect(dayCells(adult, [], {}, addDays(today(), 1))).toEqual([]);
  });

  it('stops at the hour in progress for today, which borrows the hour before it', () => {
    const cells = dayCells(adult, [], {}, today());
    expect(Math.max(...cells.map((c) => c.hour))).toBe(17);
    const at = (hour: number): number | undefined =>
      cells.find((c) => c.where === 'home' && c.hour === hour)?.pm25;
    expect(at(17)).toBeDefined();
    expect(at(17)).toBe(at(16));
  });

  it('counts a fix within a kilometre of a set place as being there', () => {
    const near = { lat: home.pin.lat + 0.006, lng: home.pin.lng };
    const far = { lat: home.pin.lat + 0.05, lng: home.pin.lng };
    expect(placeOfFix(near, adult)).toBe('home');
    expect(placeOfFix(far, adult)).toBeUndefined();
  });

  it('gives a child school hours at school, and an adult none', () => {
    expect(
      dayCells(child, [], {}, yesterday())
        .filter((c) => c.where === 'school')
        .map((c) => c.hour),
    ).toEqual([8, 9, 10, 11, 12, 13, 14]);
    expect(dayCells(adult, [], {}, yesterday()).some((c) => c.where === 'school')).toBe(false);
  });

  it('breathes cleaner at school with the school’s own unit, for a child who added nothing', () => {
    const without = dayCells(child, [], {}, yesterday()).filter((c) => c.where === 'school');
    const withUnit = dayCells(child, SAMPLE_UNITS, {}, yesterday()).filter(
      (c) => c.where === 'school',
    );
    const mean = (cs: typeof without): number => cs.reduce((s, c) => s + c.pm25, 0) / cs.length;
    expect(withUnit.every((c) => c.source === 'unit')).toBe(true);
    expect(mean(withUnit)).toBeLessThan(mean(without));
  });

  it('shares one home monitor across every kind of person who lives there', () => {
    const units = allUnits([monitor], [child, adult, sampleSpotsFor('senior')]);
    for (const spots of [child, adult, sampleSpotsFor('senior')]) {
      const cells = dayCells(spots, units, {}, yesterday()).filter((c) => c.where === 'home');
      expect(cells.every((c) => c.source === 'device')).toBe(true);
    }
  });

  it('leaves unset places out, and an empty set of places gives an empty day', () => {
    expect(dayCells({}, [], {}, today())).toEqual([]);
    const justHome: Spots = { home };
    expect(new Set(dayCells(justHome, [], {}, yesterday()).map((c) => c.where))).toEqual(
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
    const counted = countedCells(dayCells(adult, [], live, today()));
    expect(counted.find((c) => c.hour === 9)?.where).toBe('live');
    expect(dayCells(adult, [], live, yesterday()).some((c) => c.where === 'live')).toBe(false);
    expect(
      dayCells(adult, [], { '20': { lat: 28.6, lng: 77.2 } }, today()).some(
        (c) => c.where === 'live',
      ),
    ).toBe(false);
  });

  it('picks up a unit by itself when the person is visiting somewhere that has one', () => {
    const friend = SAMPLE_UNITS.find((u) => u.id === 'unit-friend');
    if (friend === undefined) throw new Error('no friend unit');
    const live = { '15': { lat: friend.lat, lng: friend.lng } };
    const visit = dayCells(adult, SAMPLE_UNITS, live, today()).find(
      (c) => c.where === 'live' && c.hour === 15,
    );
    const away = dayCells(adult, [], live, today()).find(
      (c) => c.where === 'live' && c.hour === 15,
    );
    expect(visit?.source).toBe('unit');
    expect(away?.source).toBe('outdoor');
    expect(visit?.pm25).toBeLessThan(away?.pm25 ?? 0);
  });
});

describe('the summary', () => {
  const counted = countedCells(dayCells(adult, [], {}, yesterday()));

  it('counts one cell per hour for a full day', () => {
    expect(counted).toHaveLength(24);
  });

  it('is a mean, an AQI, a level, the same hours in open air, and the WHO multiple', () => {
    const summary = summarise(counted, openAirFor(counted, adult, {}, yesterday()));
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

describe('outdoor time that was logged', () => {
  const park = { id: 'p', name: 'Park', lat: 28.6, lng: 77.2 };
  const walk = (patch: Partial<Outing> = {}): Outing => ({
    id: 'o1',
    date: yesterday(),
    start: 17 * 60,
    minutes: 60,
    activity: 'walk',
    pin: park,
    trees: false,
    ...patch,
  });
  const outdoorOf = (outings: readonly Outing[]): ReturnType<typeof dayCells> =>
    dayCells(adult, [], {}, yesterday(), outings).filter((c) => c.where === 'outdoor');

  it('is nothing until something is logged, and only on the day it happened', () => {
    expect(outdoorOf([])).toEqual([]);
    expect(outdoorOf([walk({ date: '2026-10-08' })])).toEqual([]);
  });

  it('is the open air for the hours it covered, a bit less with trees', () => {
    const open = ambientByHour(park, yesterday())[17] ?? 0;
    const plain = outdoorOf([walk()]);
    expect(plain.map((c) => c.hour)).toEqual([17]);
    expect(plain[0]?.pm25).toBeCloseTo(open, 0);
    expect(plain[0]?.source).toBe('outdoor');
    const treed = outdoorOf([walk({ trees: true })]);
    expect(treed[0]?.source).toBe('trees');
    expect(treed[0]?.pm25).toBeCloseTo(open * TREE_SHARE, 0);
  });

  it('spreads a walk over the hours it touches, by the minutes in each', () => {
    const cells = outdoorOf([walk({ start: 17 * 60 + 40, minutes: 50 })]);
    expect(cells.map((c) => c.hour)).toEqual([17, 18]);
    expect(cells.map((c) => c.share)).toEqual([20 / 60, 30 / 60]);
  });

  it('counts a part hour partly outside and partly where else the person was', () => {
    const open = ambientByHour(park, yesterday())[18] ?? 0;
    const counted = countedCells(
      dayCells(adult, [], {}, yesterday(), [walk({ start: 18 * 60, minutes: 20 })]),
    ).find((c) => c.hour === 18);
    const home = countedCells(dayCells(adult, [], {}, yesterday())).find((c) => c.hour === 18);
    expect(counted?.where).toBe('outdoor');
    expect(counted?.pm25 ?? 0).toBeGreaterThan(home?.pm25 ?? 0);
    expect(counted?.pm25 ?? 0).toBeLessThan(open);
  });

  it('takes the open air from where the walk was, not from home', () => {
    const counted = countedCells(dayCells(adult, [], {}, yesterday(), [walk()]));
    const open = openAirFor(counted, adult, {}, yesterday());
    expect(open.length).toBe(24);
  });

  it('leaves out hours that have not started today', () => {
    const cells = dayCells(adult, [], {}, today(), [
      walk({ date: today(), start: 16 * 60 + 30, minutes: 120 }),
    ]);
    expect(cells.filter((c) => c.where === 'outdoor').map((c) => c.hour)).toEqual([16, 17]);
  });

  it('overwrites the part of an hour that was walked, over a day at home with no phone to say otherwise', () => {
    const at = countedCells(
      dayCells(adult, [], {}, today(), [walk({ date: today(), start: 16 * 60 + 30, minutes: 30 })]),
    ).find((c) => c.hour === 16);
    const homeOnly = countedCells(dayCells(adult, [], {}, today())).find((c) => c.hour === 16);
    expect(homeOnly?.where).toBe('home');
    expect(at?.where).toBe('outdoor');
    expect(at?.share).toBe(0.5);
    // Half the hour is now the walk's air and half is still home's, so it sits between the two.
    const open = ambientByHour(park, today())[16] ?? 0;
    expect(at?.pm25 ?? 0).toBeGreaterThan(homeOnly?.pm25 ?? 0);
    expect(at?.pm25 ?? 0).toBeLessThan(open);
  });

  it('lets a logged walk overrule a phone that says home, for the minutes it covers', () => {
    const live = { '16': { lat: home.pin.lat, lng: home.pin.lng } };
    const cells = dayCells(adult, [], live, today(), [
      walk({ date: today(), start: 16 * 60 + 30, minutes: 30 }),
    ]);
    const counted = countedCells(cells).find((c) => c.hour === 16);
    expect(cells.some((c) => c.where === 'live' && c.hour === 16)).toBe(true);
    expect(counted?.where).toBe('outdoor');
    const phoneOnly = countedCells(dayCells(adult, [], live, today())).find((c) => c.hour === 16);
    expect(phoneOnly?.where).toBe('live');
  });

  it('splits an hour that was part outside, so each part can be drawn in its own ring', () => {
    const counted = countedCells(
      dayCells(adult, [], {}, today(), [walk({ date: today(), start: 16 * 60 + 30, minutes: 30 })]),
    ).find((c) => c.hour === 16);
    expect(counted?.parts?.map((p) => [p.where, p.from, p.to])).toEqual([
      ['outdoor', 0.5, 1],
      ['home', 0, 0.5],
    ]);
    expect(counted?.parts?.every((p) => p.aqi > 0)).toBe(true);
    // An hour with no walk in it is not split.
    const plain = countedCells(dayCells(adult, [], {}, today())).find((c) => c.hour === 15);
    expect(plain?.parts).toBeUndefined();
  });

  it('splits an hour round two short walks, with the gaps in the other ring', () => {
    const counted = countedCells(
      dayCells(adult, [], {}, today(), [
        walk({ id: 'a', date: today(), start: 16 * 60, minutes: 15 }),
        walk({ id: 'b', date: today(), start: 16 * 60 + 30, minutes: 15 }),
      ]),
    ).find((c) => c.hour === 16);
    const outside = counted?.parts?.filter((p) => p.where === 'outdoor') ?? [];
    const rest = counted?.parts?.filter((p) => p.where === 'home') ?? [];
    expect(outside.map((p) => [p.from, p.to])).toEqual([
      [0, 0.25],
      [0.5, 0.75],
    ]);
    expect(rest.map((p) => [p.from, p.to])).toEqual([
      [0.25, 0.5],
      [0.75, 1],
    ]);
  });
});
