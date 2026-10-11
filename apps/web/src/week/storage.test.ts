// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { PINS_STORAGE_KEY } from '../data/pins';
import { loadHousehold } from '../exposure/people';
import { MemoryStorage, WEEK_PINS, installMemoryStorage } from './storage';

describe('the recording’s own storage', () => {
  it('keeps what is put in it and nothing else', () => {
    const s = new MemoryStorage();
    expect(s.getItem('a')).toBeNull();
    s.setItem('a', '1');
    expect(s.getItem('a')).toBe('1');
    expect(s.length).toBe(1);
    expect(s.key(0)).toBe('a');
    s.removeItem('a');
    expect(s.length).toBe(0);
  });

  it('replaces the browser’s storage and starts one person with two places, leaving the person’s own data alone', () => {
    window.localStorage.setItem(PINS_STORAGE_KEY, '[{"id":"x","name":"Mine","lat":1,"lng":2}]');
    const kept = window.localStorage;
    const memory = installMemoryStorage();
    expect(window.localStorage).toBe(memory);
    expect(window.localStorage.getItem(PINS_STORAGE_KEY)).toBeNull();
    expect(loadHousehold(window.localStorage).people.map((p) => p.name)).toEqual(['Me']);
    expect(kept.getItem(PINS_STORAGE_KEY)).toContain('Mine');
    expect(WEEK_PINS.map((p) => p.name)).toEqual(['Home', 'Park']);
  });
});
