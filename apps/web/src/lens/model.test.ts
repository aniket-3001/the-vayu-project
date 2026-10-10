import { describe, expect, it } from 'vitest';
import { sampleDay } from '../today/sample';
import {
  DIAL_HOURS,
  bestHour,
  formatDistance,
  hazeFor,
  headingFrom,
  lensSeries,
  visibilityKm,
  windOnScreen,
} from './model';

describe('how far you can see', () => {
  it('shrinks as the air gets worse, and never goes past the horizon', () => {
    const readings = [3, 10, 30, 70, 150, 300].map(visibilityKm);
    for (let i = 1; i < readings.length; i++)
      expect(readings[i]).toBeLessThan(readings[i - 1] ?? 0);
    expect(visibilityKm(0)).toBeLessThanOrEqual(50);
    expect(visibilityKm(-5)).toBe(visibilityKm(0));
  });

  it('gives believable figures: a few kilometres in Delhi smog, tens of kilometres on a clean day', () => {
    expect(visibilityKm(70)).toBeGreaterThan(4);
    expect(visibilityKm(70)).toBeLessThan(10);
    expect(visibilityKm(300)).toBeLessThan(2);
    expect(visibilityKm(5)).toBeGreaterThan(30);
  });

  it('is said in kilometres, or metres when short', () => {
    expect(formatDistance(7)).toBe('7 km');
    expect(formatDistance(1.66)).toBe('1.7 km');
    expect(formatDistance(23.4)).toBe('23 km');
    expect(formatDistance(0.48)).toBe('500 m');
  });
});

describe('the dial', () => {
  const day = sampleDay('unhealthy');
  const series = lensSeries(day);

  it('runs from now, hour by hour, for 36 hours, with the wind and daylight at each', () => {
    expect(series).toHaveLength(DIAL_HOURS + 1);
    expect(series[0]?.at).toBe(day.asOf);
    expect(series[0]?.aqi).toBe(day.aqi);
    for (const hour of series) {
      expect(hour.wind?.kmh).toBeGreaterThanOrEqual(0);
      expect(hour.wind?.fromDeg).toBeGreaterThanOrEqual(0);
      expect(hour.wind?.fromDeg).toBeLessThan(360);
    }
  });

  it('finds the cleanest daylight hour ahead, and never picks the night or now', () => {
    const best = bestHour(series);
    expect(best).toBeDefined();
    expect(best?.isDay).toBe(true);
    expect(best?.at).not.toBe(series[0]?.at);
    const daylightAhead = series.slice(1, 25).filter((h) => h.isDay);
    expect(best?.aqi).toBe(Math.min(...daylightAhead.map((h) => h.aqi)));
  });

  it('has nothing to recommend when no daylight hour is ahead', () => {
    expect(bestHour(series.slice(0, 1))).toBeUndefined();
    expect(bestHour([])).toBeUndefined();
  });
});

describe('haze', () => {
  it('gets thicker and busier as PM2.5 rises, and stays within bounds', () => {
    const clean = hazeFor(5, 21);
    const smog = hazeFor(300, 430);
    expect(smog.veil).toBeGreaterThan(clean.veil);
    expect(smog.specks).toBeGreaterThan(clean.specks);
    expect(hazeFor(5000, 500).veil).toBeLessThanOrEqual(0.62);
    expect(hazeFor(5000, 500).specks).toBeLessThanOrEqual(420);
    expect(clean.level.name).toBe('Good');
    expect(smog.level.name).toBe('Hazardous');
  });
});

describe('wind on the screen', () => {
  it('points where the wind is going, and turns the other way as the phone turns', () => {
    expect(windOnScreen(315, 0)).toBe(135);
    expect(windOnScreen(315, 90)).toBe(45);
    expect(windOnScreen(0, 270)).toBe(270);
    expect(windOnScreen(0, 180)).toBe(0);
    expect(windOnScreen(90, 359)).toBeGreaterThanOrEqual(0);
    expect(windOnScreen(90, 359)).toBeLessThan(360);
  });
});

describe('compass heading', () => {
  it('reads Safari’s compass, or an absolute orientation, or nothing', () => {
    expect(headingFrom({ webkitCompassHeading: 120 })).toBe(120);
    expect(headingFrom({ absolute: true, alpha: 90 })).toBe(270);
    expect(headingFrom({ absolute: false, alpha: 90 })).toBeUndefined();
    expect(headingFrom({ alpha: null, absolute: true })).toBeUndefined();
  });
});
