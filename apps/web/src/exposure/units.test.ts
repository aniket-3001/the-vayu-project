import { describe, expect, it } from 'vitest';
import type { Device } from '../devices/devices';
import { SAMPLE_UNITS, allUnits, ownUnits, unitNear } from './units';
import { sampleSpotsFor } from './spots';

const monitor: Device = { id: 'd1', name: 'Bedroom unit', where: 'home' };

describe('units that help everyone nearby', () => {
  it('places the person’s own monitor where that kind of place is set, for every kind of person who has it', () => {
    const all = [sampleSpotsFor('child'), sampleSpotsFor('adult'), sampleSpotsFor('senior')];
    const own = ownUnits([monitor], all);
    expect(own.length).toBeGreaterThanOrEqual(1);
    expect(own.every((u) => u.own)).toBe(true);
    const home = sampleSpotsFor('adult').home?.pin;
    expect(home && unitNear(home, own)?.name).toBe('Bedroom unit');
  });

  it('does not place a monitor where no such place is set', () => {
    expect(ownUnits([{ ...monitor, where: 'school' }], [sampleSpotsFor('adult')])).toEqual([]);
  });

  it('has shared units at the school and the office that nobody had to add', () => {
    const school = sampleSpotsFor('child').school?.pin;
    const office = sampleSpotsFor('adult').work?.pin;
    expect(school && unitNear(school, SAMPLE_UNITS)?.own).toBe(false);
    expect(office && unitNear(office, SAMPLE_UNITS)?.own).toBe(false);
  });

  it('finds the nearest unit within 300 m, and nothing farther', () => {
    const unit = SAMPLE_UNITS[0];
    if (unit === undefined) throw new Error('no sample unit');
    expect(unitNear({ lat: unit.lat + 0.001, lng: unit.lng }, SAMPLE_UNITS)).toBeDefined();
    expect(unitNear({ lat: unit.lat + 0.02, lng: unit.lng }, SAMPLE_UNITS)).toBeUndefined();
  });

  it('lists the person’s own first', () => {
    const list = allUnits([monitor], [sampleSpotsFor('adult')]);
    expect(list[0]?.own).toBe(true);
    expect(list.length).toBe(SAMPLE_UNITS.length + 1);
  });
});
