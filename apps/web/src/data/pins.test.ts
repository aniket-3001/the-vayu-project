// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_PINS, addPin, loadPins, pinId, removePin, savePins } from './pins';

beforeEach(() => {
  window.localStorage.clear();
});

describe('pinned places', () => {
  it('starts with the four sample places, so the list is never empty on day one', () => {
    expect(loadPins(window.localStorage).map((pin) => pin.name)).toEqual([
      'Home',
      'School',
      'Office',
      'Park',
    ]);
  });

  it('remembers what the person removed, and does not bring the samples back', () => {
    const pins = loadPins(window.localStorage);
    savePins(window.localStorage, removePin(pins, pins[0]?.id ?? ''));
    expect(loadPins(window.localStorage).map((pin) => pin.name)).toEqual([
      'School',
      'Office',
      'Park',
    ]);
    savePins(window.localStorage, []);
    expect(loadPins(window.localStorage)).toEqual([]);
  });

  it('adds a place at the top and never twice for the same spot', () => {
    const once = addPin([], { name: 'Dwarka', lat: 28.5915, lng: 77.0531 });
    const twice = addPin(once, { name: 'Dwarka again', lat: 28.5921, lng: 77.0529 });
    expect(twice).toHaveLength(1);
    expect(pinId(28.5915, 77.0531)).toBe(pinId(28.5921, 77.0529));
    expect(twice[0]?.name).toBe('Dwarka');
  });

  it('caps the list, dropping the oldest pin', () => {
    let pins: ReturnType<typeof loadPins> = [];
    for (let i = 0; i < MAX_PINS + 2; i += 1) {
      pins = addPin(pins, { name: `P${i}`, lat: 28 + i * 0.1, lng: 77 });
    }
    expect(pins).toHaveLength(MAX_PINS);
    expect(pins[0]?.name).toBe(`P${MAX_PINS + 1}`);
  });

  it('survives corrupt storage and a storage that throws', () => {
    window.localStorage.setItem('vayu.pins.v1', '{not json');
    expect(loadPins(window.localStorage)).toHaveLength(4);
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    expect(loadPins(broken)).toHaveLength(4);
    expect(() => {
      savePins(broken, []);
    }).not.toThrow();
  });
});
