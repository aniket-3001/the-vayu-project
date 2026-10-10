// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { sampleDay, SAMPLE_IDS } from '../today/sample';
import { POINTS, cpcbAqiFor, grapStage, grapStageFor, tasksFor } from './model';
import { RANKS, TASKS_STORAGE_KEY, loadDone, rankFor, saveDone, streak, toggle } from './store';

beforeEach(() => {
  window.localStorage.clear();
});

describe('GRAP stage from the 24-hour CPCB AQI', () => {
  it('is none to 200, then I, II, III, IV at the official breaks', () => {
    expect(grapStage(null)).toBe(0);
    expect(grapStage(200)).toBe(0);
    expect(grapStage(201)).toBe(1);
    expect(grapStage(300)).toBe(1);
    expect(grapStage(301)).toBe(2);
    expect(grapStage(400)).toBe(2);
    expect(grapStage(401)).toBe(3);
    expect(grapStage(450)).toBe(3);
    expect(grapStage(451)).toBe(4);
  });

  it('is none on a clean day and the top stage in winter smog', () => {
    expect(grapStageFor(sampleDay('good'))).toBe(0);
    expect(grapStageFor(sampleDay('hazardous'))).toBe(4);
    expect(grapStageFor(sampleDay('dusty'))).toBeGreaterThanOrEqual(2);
  });

  it('says nothing, rather than guess, when the model’s PM10 is missing or far out of line with the PM2.5', () => {
    const day = sampleDay('hazardous');
    expect(grapStageFor({ ...day, pollutants: { pm25: day.pollutants.pm25 } })).toBe(0);
    expect(
      cpcbAqiFor({ ...day, pollutants: { ...day.pollutants, pm10: day.pollutants.pm25 * 9 } }),
    ).toBeNull();
    expect(
      cpcbAqiFor({ ...day, pollutants: { ...day.pollutants, pm10: day.pollutants.pm25 * 0.5 } }),
    ).toBeNull();
  });
});

describe('today’s tasks', () => {
  it('suggest a good hour for a walk on a clean day, with a reason and points', () => {
    const tasks = tasksFor(sampleDay('good'));
    const walk = tasks.find((t) => t.id === 'walk');
    expect(walk?.title).toMatch(/^A good hour for a walk: \d\d:\d\d to \d\d:\d\d( tomorrow)?$/u);
    expect(walk?.points).toBe(POINTS.walk);
    for (const id of SAMPLE_IDS) {
      for (const t of tasksFor(sampleDay(id))) expect(t.points).toBe(POINTS[t.kind]);
    }
    expect(tasks.find((t) => t.id === 'windows')?.title).toMatch(/^Air the room at \d\d:\d\d$/u);
    expect(tasks.some((t) => t.kind === 'grap' || t.kind === 'mask')).toBe(false);
  });

  it('say there is no clean hour on a bad day, ask for a mask and shut windows, and never suggest a walk', () => {
    const tasks = tasksFor(sampleDay('unhealthy'));
    expect(tasks.some((t) => t.kind === 'walk')).toBe(false);
    expect(tasks.find((t) => t.id === 'stay-in')?.title).toBe(
      'No clean hour outside today. Stay in if you can.',
    );
    expect(tasks.find((t) => t.id === 'windows')?.title).toBe('Keep the windows shut');
    expect(tasks.some((t) => t.kind === 'mask')).toBe(true);
  });

  it('mention GRAP as unofficial, only when the air points to a stage', () => {
    const smog = tasksFor(sampleDay('hazardous'));
    const grap = smog.find((t) => t.kind === 'grap');
    expect(grap?.title).toBe('GRAP Stage IV may be in force');
    expect(grap?.why).toMatch(/Unofficial/u);
    expect(tasksFor(sampleDay('good')).some((t) => t.kind === 'grap')).toBe(false);
  });

  it('are at most four, with unique ids, in plain words', () => {
    for (const id of SAMPLE_IDS) {
      const tasks = tasksFor(sampleDay(id));
      expect(tasks.length).toBeGreaterThanOrEqual(1);
      expect(tasks.length).toBeLessThanOrEqual(4);
      expect(new Set(tasks.map((t) => t.id)).size).toBe(tasks.length);
      for (const t of tasks)
        expect(`${t.title} ${t.why}`).not.toMatch(/!|\p{Extended_Pictographic}|unlock|seamless/iu);
    }
  });
});

describe('progress', () => {
  it('marks a task done and undoes it, per date, and remembers it', () => {
    let done = toggle({}, '2026-10-10', 'walk');
    expect(done['2026-10-10']).toEqual(['walk']);
    done = toggle(done, '2026-10-10', 'windows');
    expect(done['2026-10-10']).toEqual(['walk', 'windows']);
    done = toggle(done, '2026-10-10', 'walk');
    expect(done['2026-10-10']).toEqual(['windows']);
    saveDone(window.localStorage, done);
    expect(loadDone(window.localStorage)).toEqual(done);
  });

  it('survives rubbish in storage', () => {
    window.localStorage.setItem(TASKS_STORAGE_KEY, '{{');
    expect(loadDone(window.localStorage)).toEqual({});
    window.localStorage.setItem(
      TASKS_STORAGE_KEY,
      JSON.stringify({ '2026-10-10': ['walk', 4], '2026-10-09': 'x' }),
    );
    expect(loadDone(window.localStorage)).toEqual({ '2026-10-10': ['walk'] });
  });

  it('counts days in a row, and keeps yesterday’s run alive until today is done', () => {
    const done = { '2026-10-08': ['a'], '2026-10-09': ['a'], '2026-10-10': ['a'] };
    expect(streak(done, '2026-10-10')).toBe(3);
    expect(streak({ '2026-10-08': ['a'], '2026-10-09': ['a'] }, '2026-10-10')).toBe(2);
    expect(streak({ '2026-10-08': ['a'], '2026-10-10': ['a'] }, '2026-10-10')).toBe(1);
    expect(streak({}, '2026-10-10')).toBe(0);
    expect(streak({ '2026-10-10': [] }, '2026-10-10')).toBe(0);
  });

  it('gives a rank for points, and what comes next', () => {
    expect(rankFor(0).rank.name).toBe('Getting started');
    expect(rankFor(100).rank.name).toBe('Steady');
    expect(rankFor(99).next?.name).toBe('Steady');
    expect(rankFor(5000).next).toBeUndefined();
    expect(RANKS.map((r) => r.from)).toEqual([...RANKS.map((r) => r.from)].sort((a, b) => a - b));
  });
});
