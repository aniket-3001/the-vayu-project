// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { setWeekScene } from './active';
import { isOriginalPerson, isOriginalPlace, isOriginalSpot, RECORDING_NOTICE } from './protect';
import { RecordingNotice } from './RecordingNotice';
import recordedJson from './recorded.json';
import { recordedSource } from './recordedSource';
import { sceneFor } from './scene';
import { WEEK_PINS } from './storage';
import type { Recorded } from './types';

afterEach(() => {
  cleanup();
  setWeekScene(undefined);
});

const deepFreeze = <T,>(value: T): T => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
};

describe('the recording cannot be changed by anyone', () => {
  it('is never written to: with every part frozen, every day still plays, and a write would have thrown', async () => {
    const recorded = deepFreeze(structuredClone(recordedJson)) as unknown as Recorded;
    expect(Object.isFrozen(recorded.days[0]?.air)).toBe(true);
    for (const day of recorded.days) {
      const source = recordedSource(recorded, day);
      for (const pin of WEEK_PINS) {
        const today = await source.today(pin);
        expect(today.hourly.length).toBeGreaterThan(0);
        expect((await source.history(pin)).length).toBeGreaterThan(0);
      }
      await source.stations();
      expect(sceneFor(day).fires.length).toBe(day.fires.length);
    }
    // Frozen data, and the data is unchanged by all of it.
    expect(JSON.stringify(recorded)).toBe(JSON.stringify(recordedJson));
  });

  it('makes no network call that writes: the recording has no sender of its own', async () => {
    const recorded = recordedJson as unknown as Recorded;
    const calls: string[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = ((url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      return Promise.reject(new Error('no network in the recording'));
    }) as typeof fetch;
    try {
      const day = recorded.days[1];
      if (day === undefined) throw new Error('no day');
      const source = recordedSource(recorded, day);
      const pin = WEEK_PINS[0];
      if (pin === undefined) throw new Error('no pin');
      await source.today(pin);
      await source.history(pin);
      await source.stations();
    } finally {
      globalThis.fetch = real;
    }
    expect(calls).toEqual([]);
  });
});

describe('what is original and what is added', () => {
  it('protects the starting places, the person and their home, only while the recorded days play', () => {
    const [home, park] = WEEK_PINS;
    if (home === undefined || park === undefined) throw new Error('no pins');
    // Outside the recorded days nothing is original: a person can remove anything of their own.
    expect(isOriginalPlace(home)).toBe(false);
    expect(isOriginalPerson('me')).toBe(false);
    setWeekScene({ fires: [], wind: [] });
    expect(isOriginalPlace(home)).toBe(true);
    expect(isOriginalPlace(park)).toBe(true);
    expect(isOriginalPerson('me')).toBe(true);
    expect(isOriginalSpot('me', home)).toBe(true);
    // What a visitor adds on top can be removed.
    const added = { id: '28.50,77.00', name: 'Gym', lat: 28.5, lng: 77 };
    expect(isOriginalPlace(added)).toBe(false);
    expect(isOriginalPerson('asha')).toBe(false);
    expect(isOriginalSpot('asha', home)).toBe(false);
    expect(isOriginalSpot('me', added)).toBe(false);
  });

  it('says it plainly on the page, and only on the recorded days', () => {
    const { container, rerender } = render(<RecordingNotice />);
    expect(container).toBeEmptyDOMElement();
    setWeekScene({ fires: [], wind: [] });
    rerender(<RecordingNotice />);
    expect(screen.getByRole('note')).toHaveTextContent(/shared recording, the same for everyone/u);
    expect(screen.getByRole('note')).toHaveTextContent(/gone when you close or reload it/u);
    expect(screen.getByRole('note')).toHaveTextContent(/cannot be changed or deleted/u);
    expect(RECORDING_NOTICE).toMatch(
      /original places, person and days cannot be changed or deleted/u,
    );
  });
});
