import { subIndex, concentrationForAqi } from '@vayu/core';
import { describe, expect, it } from 'vitest';
import type { ReplayWeek } from '../data/replayWeeks';
import { LEAD_HOURS, SYNTHETIC_SCENARIOS, WORLD_HOURS, realWeekScenario } from './scenarios';

const meanOf = (values: readonly (number | null)[]): number => {
  const present = values.filter((v): v is number => v !== null);
  return present.reduce((sum, v) => sum + v, 0) / present.length;
};

describe('synthetic scenarios', () => {
  it('gives a full day of hourly outdoor air, in order, ending an hour after the day', () => {
    for (const scenario of SYNTHETIC_SCENARIOS) {
      const run = scenario.build();
      expect(run.outdoor).toHaveLength(WORLD_HOURS + 1);
      const starts = run.outdoor.map((h) => Date.parse(h.hourStart));
      expect(starts).toEqual([...starts].sort((a, b) => a - b));
      expect(starts[0]).toBe(Date.parse(run.startAt));
    }
  });

  it('has the hours just before the day, in order and with no gap, so the rooms can settle first', () => {
    for (const scenario of SYNTHETIC_SCENARIOS) {
      const run = scenario.build();
      expect(run.lead).toHaveLength(LEAD_HOURS);
      const starts = run.lead.map((h) => Date.parse(h.hourStart));
      expect(starts[0]).toBe(Date.parse(run.startAt) - LEAD_HOURS * 3_600_000);
      for (let i = 1; i < starts.length; i++)
        expect((starts[i] ?? 0) - (starts[i - 1] ?? 0)).toBe(3_600_000);
      expect(Date.parse(run.startAt) - (starts.at(-1) ?? 0)).toBe(3_600_000);
    }
  });

  it('is repeatable: the same scenario always gives the same air', () => {
    for (const scenario of SYNTHETIC_SCENARIOS) {
      expect(scenario.build()).toEqual(scenario.build());
    }
  });

  it('runs from a clean day up to the level where Stage IV is ordered, in that order', () => {
    const means = SYNTHETIC_SCENARIOS.map((s) => meanOf(s.build().outdoor.map((h) => h.pm25)));
    expect(means).toEqual([...means].sort((a, b) => a - b));
    expect(SYNTHETIC_SCENARIOS.map((s) => s.id)).toEqual([
      'cleaner-day',
      'smoggy-day',
      'very-bad-day',
      'grap4',
    ]);
  });

  it('the Stage IV scenario sits at the PM2.5 that is CPCB AQI 450, the level in the GRAP order', () => {
    const grap = SYNTHETIC_SCENARIOS.find((s) => s.id === 'grap4');
    const mean = meanOf((grap?.build().outdoor ?? []).slice(0, WORLD_HOURS).map((h) => h.pm25));
    expect(mean).toBeCloseTo(concentrationForAqi('pm25', 450), 0);
    expect(subIndex('pm25', mean)).toBeCloseTo(450, 0);
  });

  it('has more air in the evening and night than in the afternoon, as Delhi does', () => {
    const run = SYNTHETIC_SCENARIOS[1]?.build();
    const at = (hour: number): number => run?.outdoor[hour]?.pm25 ?? 0;
    expect(at(22)).toBeGreaterThan(at(14));
  });

  it('says plainly that it is made up', () => {
    for (const scenario of SYNTHETIC_SCENARIOS) {
      expect(scenario.basis).toBe('assumed');
      expect(scenario.blurb.length).toBeGreaterThan(20);
    }
  });
});

describe('the real week', () => {
  const hours = Array.from({ length: 24 * 5 }, (_, i) => ({
    hourStart: new Date(Date.UTC(2025, 11, 8) + i * 3_600_000).toISOString(),
    pm25: i >= 48 && i < 72 ? 400 : 120,
    pm10: null,
  }));
  const week: ReplayWeek = {
    id: 'W1',
    label: 'A Delhi week in December 2025',
    startAt: hours[0]?.hourStart ?? '',
    endAt: hours.at(-1)?.hourStart ?? '',
    outdoor: hours,
    real: { stationName: 'R K Puram', distanceKm: 1.2 },
  };

  it('picks the worst 24 hours of the week, so the scenario is the real bad day', () => {
    const run = realWeekScenario(week).build();
    expect(run.startAt).toBe(hours[48]?.hourStart);
    expect(meanOf(run.outdoor.slice(0, WORLD_HOURS).map((h) => h.pm25))).toBe(400);
    expect(run.outdoor).toHaveLength(WORLD_HOURS + 1);
  });

  it('takes the real hours before the worst day as its lead, and a shorter lead where the week begins', () => {
    const run = realWeekScenario(week).build();
    expect(run.lead).toHaveLength(LEAD_HOURS);
    expect(run.lead.every((h) => h.pm25 === 120)).toBe(true);
    const early: ReplayWeek = {
      ...week,
      outdoor: hours.map((h, i) => ({ ...h, pm25: i < 24 ? 400 : 100 })),
    };
    expect(realWeekScenario(early).build().lead).toHaveLength(0);
  });

  it('is real data, and names its station', () => {
    const scenario = realWeekScenario(week);
    expect(scenario.basis).toBe('real');
    expect(scenario.blurb).toContain('R K Puram');
  });

  it('does not invent a PM10 where there is none', () => {
    for (const hour of realWeekScenario(week).build().outdoor) expect(hour.pm10).toBeNull();
  });

  it('says nothing about a GRAP stage, since the data does not carry one', () => {
    expect(realWeekScenario(week).title).not.toMatch(/GRAP/i);
    expect(realWeekScenario(week).blurb).not.toMatch(/Stage/i);
  });
});
