// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { alertsFor } from '../alerts/model';
import { loadPins } from '../data/pins';
import { readingForPin } from '../places/placeSample';
import { applyScenario, SCENARIOS, scenarioById, TOUR_SECONDS } from './scenarios';
import { clearDemo, readDemo } from './state';

// Scenarios exist only in the prototype build.
beforeEach(() => {
  vi.stubEnv('VITE_DEMO', '1');
  window.localStorage.clear();
});

const staged = (id: string): void => {
  const scenario = scenarioById(id);
  if (scenario === undefined) throw new Error(`no scenario ${id}`);
  applyScenario(window.localStorage, scenario);
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('demo scenarios', () => {
  it('takes about a minute to play through, and covers every tab and alert', () => {
    expect(TOUR_SECONDS).toBeGreaterThanOrEqual(55);
    expect(TOUR_SECONDS).toBeLessThanOrEqual(65);
    const routes = SCENARIOS.map((s) => s.route);
    for (const part of ['/exposure', '/map', '/lens', '/place/'])
      expect(routes.some((r) => r.startsWith(part))).toBe(true);
    const opened = SCENARIOS.map((s) => s.state.openAlert);
    expect(opened).toEqual(expect.arrayContaining(['walk-today', 'grap-today', 'stubble']));
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
  });

  it('stages a day for every place, and forgets it on exit', () => {
    const [home] = loadPins(window.localStorage);
    if (home === undefined) throw new Error('no pins');
    expect(readingForPin(home).aqi).toBeLessThan(200);
    staged('grap');
    expect(readDemo()?.id).toBe('grap');
    expect(readingForPin(home).aqi).toBeGreaterThan(300);
    clearDemo();
    expect(readDemo()).toBeUndefined();
    expect(readingForPin(home).aqi).toBeLessThan(200);
  });

  it('puts up the alert each scenario names', () => {
    const [home] = loadPins(window.localStorage);
    if (home === undefined) throw new Error('no pins');
    for (const [id, alert, fires] of [
      ['bad', 'walk-today', undefined],
      ['grap', 'grap-today', undefined],
      ['stubble', 'stubble', 140],
    ] as const) {
      staged(id);
      const ids = alertsFor(readingForPin(home), fires).map((a) => a.id);
      expect(ids).toContain(alert);
    }
  });

  it('clears what the last scenario saved before saving the next', () => {
    staged('exposure');
    expect(window.localStorage.getItem('vayu.devices.v1')).not.toBeNull();
    staged('good');
    expect(window.localStorage.getItem('vayu.devices.v1')).toBeNull();
    expect(window.localStorage.getItem('vayu.units.v1')).toBeNull();
    staged('child');
    expect(window.localStorage.getItem('vayu.people.v1')).toContain('Asha');
  });
});

describe('the deployed app', () => {
  it('cannot be switched into a scenario: the state is ignored unless this is the prototype build', () => {
    staged('grap');
    expect(readDemo()?.id).toBe('grap');
    vi.stubEnv('VITE_DEMO', '');
    expect(readDemo()).toBeUndefined();
  });
});
