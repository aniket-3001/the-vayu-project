// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { saveHousehold } from '../exposure/people';
import { saveSpots } from '../exposure/spots';
import { isSchoolPin, roleOfLabel, samePlace } from './roles';

beforeEach(() => {
  window.localStorage.clear();
});

const pin = (
  name: string,
  lat: number,
  lng: number,
): { id: string; name: string; lat: number; lng: number } => ({
  id: `${lat.toFixed(2)},${lng.toFixed(2)}`,
  name,
  lat,
  lng,
});

describe('which pinned places are schools', () => {
  it('knows a place called School, or with school in its name', () => {
    expect(isSchoolPin(pin('School', 28.4, 77.05))).toBe(true);
    expect(isSchoolPin(pin('DAV Public School', 28.4, 77.05))).toBe(true);
    expect(isSchoolPin(pin('Sunrise Vidyalaya', 28.4, 77.05))).toBe(true);
    expect(isSchoolPin(pin('Home', 28.5, 77.05))).toBe(false);
    expect(isSchoolPin(pin('Park', 28.5, 77.05))).toBe(false);
  });

  it('knows a school added from someone’s page in Exposure, whatever it is called', () => {
    saveHousehold(window.localStorage, {
      people: [
        { id: 'me', name: 'Me', age: 38, day: 'work' },
        { id: 'asha', name: 'Asha', age: 9, day: 'school' },
      ],
      current: 'me',
    });
    // The name has no "school" in it, so only the family's own timetable says it is one.
    const dps = pin('DPS Vasant Kunj', 28.52, 77.15);
    saveSpots(window.localStorage, 'asha', { school: { pin: dps, from: 8, to: 15 } });
    expect(roleOfLabel(dps.name)).toBeUndefined();
    expect(isSchoolPin(dps)).toBe(true);
    // The same place pinned a few metres off is still that school.
    expect(isSchoolPin(pin('DPS gate', 28.5205, 77.1503))).toBe(true);
    expect(isSchoolPin(pin('Gym', 28.6, 77.3))).toBe(false);
  });

  it('counts two points a few hundred metres apart as one place', () => {
    expect(samePlace({ lat: 28.52, lng: 77.15 }, { lat: 28.521, lng: 77.151 })).toBe(true);
    expect(samePlace({ lat: 28.52, lng: 77.15 }, { lat: 28.6, lng: 77.15 })).toBe(false);
  });
});
