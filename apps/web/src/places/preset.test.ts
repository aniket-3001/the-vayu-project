// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { loadPins } from '../data/pins';
import { loadHousehold } from '../exposure/people';
import { loadSpots } from '../exposure/spots';
import { PRESET_PINS, applyPreset } from './preset';

beforeEach(() => {
  window.localStorage.clear();
});

describe('the preset profile', () => {
  it('puts four places, two people and their days on the device', () => {
    applyPreset(window.localStorage);
    expect(loadPins(window.localStorage).map((p) => p.name)).toEqual([
      'Home',
      'School',
      'Office',
      'Park',
    ]);
    const household = loadHousehold(window.localStorage);
    expect(household.people.map((p) => p.name)).toEqual(['Me', 'Asha']);
    const child = loadSpots(window.localStorage, 'asha', 'child');
    expect(child.school?.pin.id).toBe(PRESET_PINS.find((p) => p.name === 'School')?.id);
    const parent = loadSpots(window.localStorage, 'me', 'adult');
    expect(parent.work?.pin.id).toBe(PRESET_PINS.find((p) => p.name === 'Office')?.id);
  });

  it('has real coordinates in Delhi and no readings of its own: the air is read live', () => {
    for (const pin of PRESET_PINS) {
      expect(pin.lat).toBeGreaterThan(28);
      expect(pin.lat).toBeLessThan(29);
      expect(Object.keys(pin).sort()).toEqual(['detail', 'id', 'lat', 'lng', 'name']);
    }
  });
});
