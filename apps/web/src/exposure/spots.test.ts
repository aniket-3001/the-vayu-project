// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { SAMPLE_SPOTS, SPOTS_STORAGE_KEY, isThere, loadSpots, saveSpots, type Spot } from './spots';

beforeEach(() => {
  window.localStorage.clear();
});

const pin = { id: 'x', name: 'X', lat: 28.6, lng: 77.2 };

describe('the places a person has set', () => {
  it('starts with a home, a work and an outdoor place, and no school, so the dial is not empty', () => {
    const spots = loadSpots(window.localStorage);
    expect(spots).toBe(SAMPLE_SPOTS);
    expect(Object.keys(spots)).toEqual(['home', 'work', 'outdoor']);
  });

  it('remembers what was saved, including removing everything', () => {
    saveSpots(window.localStorage, {});
    expect(loadSpots(window.localStorage)).toEqual({});
    saveSpots(window.localStorage, { school: { pin, from: 8, to: 15 } });
    expect(loadSpots(window.localStorage).school?.pin.name).toBe('X');
  });

  it('survives rubbish in storage', () => {
    window.localStorage.setItem(SPOTS_STORAGE_KEY, 'not json');
    expect(loadSpots(window.localStorage)).toBe(SAMPLE_SPOTS);
    window.localStorage.setItem(
      SPOTS_STORAGE_KEY,
      JSON.stringify({ home: { from: 'a' }, work: null }),
    );
    expect(loadSpots(window.localStorage)).toEqual({});
  });

  it('says whether someone is there at an hour, including windows that run past midnight', () => {
    const day: Spot = { pin, from: 9, to: 17 };
    expect(isThere(day, 8)).toBe(false);
    expect(isThere(day, 9)).toBe(true);
    expect(isThere(day, 16)).toBe(true);
    expect(isThere(day, 17)).toBe(false);
    const night: Spot = { pin, from: 19, to: 8 };
    expect(isThere(night, 23)).toBe(true);
    expect(isThere(night, 0)).toBe(true);
    expect(isThere(night, 7)).toBe(true);
    expect(isThere(night, 8)).toBe(false);
    expect(isThere(night, 12)).toBe(false);
  });
});
