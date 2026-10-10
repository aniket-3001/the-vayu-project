import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Alert, RawHour, Reading, rules } from './index';

const loadJson = (relativePath: string): unknown =>
  JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8'));

describe('rules as data', () => {
  it('parses every rules file', () => {
    expect(rules.cpcb.pm25).toHaveLength(6);
    expect(rules.verdict.minOutsidePm25).toBe(100);
    expect(rules.fixCheck).toEqual({ minDropPct: 20, maxTries: 3, minWaitSeconds: 30, maxWaitSeconds: 900 });
  });

  it('keeps the heads-up threshold below the official Stage IV level (it leans cautious)', () => {
    expect(rules.grap.headsUpAqi).toBeLessThan(rules.grap.officialStageIvAqi);
  });

  it('has contiguous breakpoints with no gaps', () => {
    for (const pollutant of ['pm25', 'pm10'] as const) {
      const rows = rules.cpcb[pollutant];
      rows.slice(1).forEach((row, index) => {
        const previous = rows[index];
        expect(row.bpLo).toBe(previous?.bpHi);
        expect(row.iLo).toBe(previous?.iHi);
      });
    }
  });

  it('is frozen, so nothing can change a threshold at run time', () => {
    expect(Object.isFrozen(rules.verdict)).toBe(true);
  });
});

describe('fixtures validate against the contracts', () => {
  it('sample reading', () => {
    expect(() => Reading.parse(loadJson('../fixtures/sample-reading.json'))).not.toThrow();
  });

  it('sample alert is marked as a replay and unofficial', () => {
    const alert = Alert.parse(loadJson('../fixtures/sample-alert.json'));
    expect(alert.title.startsWith('[Replay]')).toBe(true);
    expect(alert.unofficial).toBe(true);
  });

  it('synthetic hourly series', () => {
    const fixture = loadJson('../fixtures/synthetic-hourly.json') as { hours: unknown[] };
    expect(fixture.hours).toHaveLength(14 * 24);
    for (const hour of fixture.hours) RawHour.parse(hour);
  });
});
