// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { recordReading } from '@vayu/unit';
import { INDOOR_SHARE } from './assumptions';
import { dayCells, openAt, today } from './model';
import { sampleSpotsFor } from './spots';
import type { Unit } from './units';

beforeEach(() => {
  window.localStorage.clear();
});

const spots = sampleSpotsFor('adult');
const home = spots.home;
if (home === undefined) throw new Error('missing sample home');
const unit: Unit = {
  id: 'unit:Vayu-3F2A@home',
  name: 'Vayu-3F2A',
  lat: home.pin.lat,
  lng: home.pin.lng,
  own: true,
  measured: true,
  deviceId: 'unit:Vayu-3F2A',
};

/** The instant, in milliseconds, of a given India hour of today. */
const atHour = (hour: number): number =>
  Date.parse(`${today()}T${String(hour).padStart(2, '0')}:10:00+05:30`);

describe('an hour spent where the person’s own unit measured', () => {
  it('counts what the unit measured, labelled as measured, and the rest of the day stays the assumption', () => {
    for (let i = 0; i < 90; i++)
      recordReading(window.localStorage, 'unit:Vayu-3F2A', atHour(9) + i * 2000, 22);
    const cells = dayCells(spots, [unit], {}, today());
    const measured = cells.find((c) => c.where === 'home' && c.hour === 9);
    expect(measured).toMatchObject({ source: 'measured', pm25: 22 });
    // An hour the unit did not measure is the assumption, not a made-up reading.
    const other = cells.find((c) => c.where === 'home' && c.hour === 8);
    const open = openAt(home.pin, today(), 8);
    expect(other?.source).toBe('assumed');
    if (open !== undefined) expect(other?.pm25).toBeCloseTo(open * INDOOR_SHARE, 0);
  });

  it('needs a few minutes of readings in the hour, so a moment is not counted as an hour', () => {
    for (let i = 0; i < 5; i++)
      recordReading(window.localStorage, 'unit:Vayu-3F2A', atHour(9) + i * 2000, 22);
    const cell = dayCells(spots, [unit], {}, today()).find(
      (c) => c.where === 'home' && c.hour === 9,
    );
    expect(cell?.source).toBe('assumed');
  });
});
