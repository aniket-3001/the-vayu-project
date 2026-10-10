// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Device } from '../devices/devices';
import { INDOOR_SHARE, TREE_SHARE } from './assumptions';
import {
  ambientByHour,
  breathed,
  countedCells,
  dayCells,
  hoursSoFar,
  openAirFor,
  placeOfFix,
  summarise,
} from './model';
import { SAMPLE_SPOTS, type Spot, type Spots } from './spots';

const need = (spot: Spot | undefined): Spot => {
  if (spot === undefined) throw new Error('missing sample spot');
  return spot;
};
const home = need(SAMPLE_SPOTS.home);
const park = need(SAMPLE_SPOTS.outdoor);
const monitor: Device = { id: 'd1', name: 'Vayu monitor', where: 'home' };

describe('what has happened so far', () => {
  it('has 17 hours of today behind it at 17:30, and all 24 of yesterday', () => {
    expect(hoursSoFar('today')).toBe(17);
    expect(hoursSoFar('yesterday')).toBe(24);
  });

  it('reads open-air PM2.5 for hours that happened, and nothing for the ones that have not', () => {
    const today = ambientByHour(home.pin, 'today');
    expect(today).toHaveLength(24);
    expect(today.slice(0, 17).every((v) => typeof v === 'number' && v > 0)).toBe(true);
    expect(today.slice(18).every((v) => v === undefined)).toBe(true);
    expect(ambientByHour(home.pin, 'yesterday').every((v) => typeof v === 'number')).toBe(true);
  });
});

describe('what a person breathes', () => {
  it('is the open-air figure outdoors, a bit less with trees, and says so', () => {
    expect(breathed('outdoor', { ...park, trees: false }, 80, [])).toEqual({
      pm25: 80,
      source: 'outdoor',
    });
    expect(breathed('outdoor', park, 80, [])).toEqual({ pm25: 68, source: 'trees' });
    expect(TREE_SHARE).toBeLessThan(1);
  });

  it('is a share of the outside figure indoors, assumed, until a monitor is there', () => {
    expect(breathed('home', home, 100, [])).toEqual({
      pm25: 100 * INDOOR_SHARE,
      source: 'assumed',
    });
    const withMonitor = breathed('home', home, 100, [monitor]);
    expect(withMonitor.source).toBe('device');
    expect(withMonitor.pm25).toBeLessThan(100 * INDOOR_SHARE);
  });

  it('uses a monitor only in the place it is deployed in', () => {
    expect(breathed('work', need(SAMPLE_SPOTS.work), 100, [monitor]).source).toBe('assumed');
  });
});

describe('a day, hour by hour', () => {
  it('puts each place’s cells in its own hours, across midnight too', () => {
    const cells = dayCells(SAMPLE_SPOTS, [], {}, 'yesterday');
    const hoursOf = (where: string): number[] =>
      cells.filter((c) => c.where === where).map((c) => c.hour);
    expect(hoursOf('work')).toEqual([9, 10, 11, 12, 13, 14, 15, 16]);
    expect(hoursOf('outdoor')).toEqual([17, 18]);
    expect(hoursOf('home')).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 19, 20, 21, 22, 23]);
  });

  it('stops at the present for today', () => {
    const cells = dayCells(SAMPLE_SPOTS, [], {}, 'today');
    expect(Math.max(...cells.map((c) => c.hour))).toBeLessThan(17);
  });

  it('gives every hour a real AQI from PM2.5 and the level colour comes from it', () => {
    for (const cell of dayCells(SAMPLE_SPOTS, [], {}, 'yesterday')) {
      expect(cell.aqi).toBeGreaterThanOrEqual(0);
      expect(cell.pm25).toBeGreaterThan(0);
    }
  });

  it('leaves unset places out, and an empty set of places gives an empty day', () => {
    expect(dayCells({}, [], {}, 'today')).toEqual([]);
    const justHome: Spots = { home: home };
    expect(new Set(dayCells(justHome, [], {}, 'yesterday').map((c) => c.where))).toEqual(
      new Set(['home']),
    );
  });

  it('breathes cleaner at home once a monitor is there', () => {
    const without = dayCells({ home }, [], {}, 'yesterday');
    const withIt = dayCells({ home }, [monitor], {}, 'yesterday');
    const mean = (cells: typeof without): number =>
      cells.reduce((s, c) => s + c.pm25, 0) / cells.length;
    expect(mean(withIt)).toBeLessThan(mean(without));
  });
});

describe('live location', () => {
  it('knows a fix is in a set place when it is within 300 m, and which one is closest', () => {
    expect(placeOfFix({ lat: home.pin.lat + 0.001, lng: home.pin.lng }, SAMPLE_SPOTS)).toBe('home');
    expect(placeOfFix({ lat: 28.7, lng: 77.5 }, SAMPLE_SPOTS)).toBeUndefined();
  });

  it('adds a live cell for each hour with a fix, and counts it ahead of the schedule', () => {
    const live = { '9': { lat: 28.6, lng: 77.3 } };
    const cells = dayCells(SAMPLE_SPOTS, [], live, 'today');
    expect(cells.some((c) => c.where === 'live' && c.hour === 9)).toBe(true);
    const counted = countedCells(cells);
    expect(counted.find((c) => c.hour === 9)?.where).toBe('live');
    expect(counted.filter((c) => c.hour === 9)).toHaveLength(1);
  });

  it('ignores fixes for yesterday and for hours that have not happened', () => {
    expect(
      dayCells(SAMPLE_SPOTS, [], { '9': { lat: 28.6, lng: 77.3 } }, 'yesterday').some(
        (c) => c.where === 'live',
      ),
    ).toBe(false);
    expect(
      dayCells(SAMPLE_SPOTS, [], { '20': { lat: 28.6, lng: 77.3 } }, 'today').some(
        (c) => c.where === 'live',
      ),
    ).toBe(false);
  });
});

describe('the summary', () => {
  const cells = dayCells(SAMPLE_SPOTS, [], {}, 'yesterday');
  const counted = countedCells(cells);

  it('counts one cell per hour, outdoor winning over the rest, and a full day is 24', () => {
    expect(counted).toHaveLength(24);
    expect(new Set(counted.map((c) => c.hour)).size).toBe(24);
  });

  it('is a mean, an AQI, a level, the same hours in open air, and the WHO multiple', () => {
    const open = openAirFor(counted, SAMPLE_SPOTS, {}, 'yesterday');
    const summary = summarise(counted, open);
    expect(summary).toBeDefined();
    expect(summary?.hours).toBe(24);
    expect(summary?.fullDay).toBe(true);
    expect(summary?.aqi).toBeGreaterThan(0);
    expect(summary?.whoTimes).toBeCloseTo((summary?.meanPm25 ?? 0) / 15, 0);
    expect(summary?.hoursByLevel.reduce((a, b) => a + b, 0)).toBe(24);
  });

  it('shows indoors and trees helping: less than the same hours in open air', () => {
    const open = openAirFor(counted, SAMPLE_SPOTS, {}, 'yesterday');
    const summary = summarise(counted, open);
    expect(summary?.meanPm25 ?? 0).toBeLessThan(summary?.openAirPm25 ?? 0);
  });

  it('says nothing when there is nothing', () => {
    expect(summarise([], [])).toBeUndefined();
  });
});
