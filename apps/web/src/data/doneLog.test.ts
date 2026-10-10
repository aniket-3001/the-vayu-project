import { describe, expect, it } from 'vitest';
import { addDoneEntry, weekSummary } from './doneLog';

function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
    key: (index) => Array.from(map.keys())[index] ?? null,
    get length() {
      return map.size;
    },
  };
}

describe('doneLog', () => {
  it('records a Done tap and reads it back in the week summary', () => {
    const storage = fakeStorage();
    addDoneEntry(storage, {
      at: '2026-10-05T06:00:00.000Z',
      kind: 'walk',
      avoidedPct: 40,
      avoidedMicrogramHours: 80,
    });

    expect(weekSummary(storage, '2026-10-05T12:00:00.000Z')).toEqual({
      count: 1,
      avoidedMicrogramHours: 80,
    });
  });

  it('sums several entries within the last 7 days', () => {
    const storage = fakeStorage();
    addDoneEntry(storage, {
      at: '2026-10-01T06:00:00.000Z',
      kind: 'walk',
      avoidedPct: 20,
      avoidedMicrogramHours: 50,
    });
    addDoneEntry(storage, {
      at: '2026-10-04T06:00:00.000Z',
      kind: 'airing',
      avoidedPct: 60,
      avoidedMicrogramHours: 30,
    });

    expect(weekSummary(storage, '2026-10-05T12:00:00.000Z')).toEqual({
      count: 2,
      avoidedMicrogramHours: 80,
    });
  });

  it('drops entries older than 7 days', () => {
    const storage = fakeStorage();
    addDoneEntry(storage, {
      at: '2026-09-01T06:00:00.000Z',
      kind: 'walk',
      avoidedPct: 20,
      avoidedMicrogramHours: 50,
    });

    expect(weekSummary(storage, '2026-10-05T12:00:00.000Z')).toEqual({
      count: 0,
      avoidedMicrogramHours: 0,
    });
  });

  it('is best-effort when storage throws (private browsing, full quota)', () => {
    const throwing: Storage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    };

    expect(() =>
      addDoneEntry(throwing, {
        at: '2026-10-05T06:00:00.000Z',
        kind: 'walk',
        avoidedPct: 40,
        avoidedMicrogramHours: 80,
      }),
    ).not.toThrow();
    expect(weekSummary(throwing, '2026-10-05T12:00:00.000Z')).toEqual({
      count: 0,
      avoidedMicrogramHours: 0,
    });
  });
});
