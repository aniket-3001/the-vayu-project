// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { PERSONAS } from './persona';
import {
  SPOTS_STORAGE_KEY,
  isThere,
  loadAllSpots,
  loadSpots,
  sampleSpotsFor,
  saveSpots,
  type Spot,
} from './spots';

beforeEach(() => {
  window.localStorage.clear();
});

const pin = { id: 'x', name: 'X', lat: 28.6, lng: 77.2 };

describe('the places for each kind of person', () => {
  it('starts a child at school 8 to 3, an adult at work 9 to 5, and a senior at home with a morning walk', () => {
    const child = sampleSpotsFor('child');
    expect(child.school).toMatchObject({ from: 8, to: 15 });
    expect(child.work).toBeUndefined();
    const adult = sampleSpotsFor('adult');
    expect(adult.work).toMatchObject({ from: 9, to: 17 });
    expect(adult.school).toBeUndefined();
    const senior = sampleSpotsFor('senior');
    expect(senior.outdoor).toMatchObject({ from: 6, to: 8, trees: true });
    expect(senior.work).toBeUndefined();
    expect(senior.school).toBeUndefined();
  });

  it('covers all 24 hours for every kind of person, so no hour is left blank', () => {
    for (const persona of PERSONAS) {
      const spots = Object.values(sampleSpotsFor(persona.id));
      for (let hour = 0; hour < 24; hour++) {
        expect(
          spots.some((spot) => isThere(spot, hour)),
          `${persona.id} ${String(hour)}`,
        ).toBe(true);
      }
    }
  });

  it('shows only the places that matter for a person: three at most', () => {
    for (const persona of PERSONAS) expect(persona.kinds.length).toBeLessThanOrEqual(3);
  });

  it('keeps each kind of person’s places apart, and starts with the sample ones', () => {
    expect(loadSpots(window.localStorage, 'kid', 'child')).toEqual(sampleSpotsFor('child'));
    saveSpots(window.localStorage, 'kid', { school: { pin, from: 9, to: 14 } });
    expect(loadSpots(window.localStorage, 'kid', 'child').school?.from).toBe(9);
    expect(loadSpots(window.localStorage, 'me', 'adult')).toEqual(sampleSpotsFor('adult'));
    expect(
      loadAllSpots(window.localStorage, [
        { id: 'kid', persona: 'child' },
        { id: 'me', persona: 'adult' },
      ]),
    ).toHaveLength(2);
  });

  it('remembers removing everything, and survives rubbish in storage', () => {
    saveSpots(window.localStorage, 'me', {});
    expect(loadSpots(window.localStorage, 'me', 'adult')).toEqual({});
    window.localStorage.setItem(SPOTS_STORAGE_KEY, 'not json');
    expect(loadSpots(window.localStorage, 'me', 'adult')).toEqual(sampleSpotsFor('adult'));
    window.localStorage.setItem(SPOTS_STORAGE_KEY, JSON.stringify({ me: { home: { from: 'a' } } }));
    expect(loadSpots(window.localStorage, 'me', 'adult')).toEqual({});
  });

  it('says whether someone is there at an hour, including windows that run past midnight', () => {
    const day: Spot = { pin, from: 9, to: 17 };
    expect(isThere(day, 8)).toBe(false);
    expect(isThere(day, 9)).toBe(true);
    expect(isThere(day, 17)).toBe(false);
    const night: Spot = { pin, from: 19, to: 8 };
    expect(isThere(night, 23)).toBe(true);
    expect(isThere(night, 7)).toBe(true);
    expect(isThere(night, 8)).toBe(false);
  });
});
