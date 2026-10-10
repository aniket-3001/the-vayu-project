import { describe, expect, it } from 'vitest';
import { LEVELS } from '../design/levels';
import { adviceFor, headlineFor } from './advice';
import { POLLUTANTS, levelForReading } from './pollutants';
import { arrowRotation, compassPoint, windFrom } from './wind';

describe('advice', () => {
  it('has a headline and at least two things to do for every level', () => {
    for (const level of LEVELS) {
      expect(headlineFor(level.from).length).toBeGreaterThan(10);
      expect(adviceFor(level.from).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('asks for a mask, closed windows and no exercise once the air is unhealthy', () => {
    const icons = adviceFor(157).map((item) => item.icon);
    expect(icons).toEqual(expect.arrayContaining(['mask', 'windows', 'exercise', 'purifier']));
  });

  it('never tells anyone to open windows on a bad day', () => {
    for (const aqi of [101, 157, 233, 430]) {
      expect(adviceFor(aqi).map((item) => item.icon)).not.toContain('open-windows');
    }
  });

  it('never uses exclamation marks, emoji or the banned words', () => {
    const all = LEVELS.flatMap((level) => [
      headlineFor(level.from),
      ...adviceFor(level.from).map((a) => a.text),
    ]);
    for (const text of all)
      expect(text).not.toMatch(/[!]|\p{Extended_Pictographic}|unlock|seamless|oops/iu);
  });
});

describe('pollutant dots', () => {
  it('walk up the levels as the reading rises', () => {
    for (const info of POLLUTANTS) {
      const names = info.upTo.map((bound) => levelForReading(info, bound).name);
      expect(new Set(names).size).toBe(5);
      expect(levelForReading(info, info.upTo[4] * 2).name).toBe('Hazardous');
      expect(levelForReading(info, 0).name).toBe('Good');
    }
  });
});

describe('wind', () => {
  it('points the arrow where the wind is going', () => {
    expect(arrowRotation(315)).toBe(135);
    expect(arrowRotation(0)).toBe(180);
    expect(arrowRotation(270)).toBe(90);
  });

  it('names the point it comes from', () => {
    expect(compassPoint(315)).toBe('north-west');
    expect(compassPoint(0)).toBe('north');
    expect(compassPoint(359)).toBe('north');
    expect(windFrom(135)).toBe('from the south-east');
  });
});
