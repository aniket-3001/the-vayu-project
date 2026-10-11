import { describe, expect, it } from 'vitest';
import recordedJson from './recorded.json';
import { dayAqi, nowIndex, sceneFor } from './scene';
import type { Recorded } from './types';

const recorded = recordedJson as unknown as Recorded;

describe('a recorded day’s scene', () => {
  it('has the fires seen in the day before the moment and one wind over the whole map', () => {
    const day = recorded.days.find((d) => d.date === '2025-10-31');
    if (day === undefined) throw new Error('missing day');
    const scene = sceneFor(day);
    expect(scene.fires.length).toBe(day.fires.length);
    expect(scene.fires.every((f) => f.hoursAgo >= 0 && f.hoursAgo <= 24)).toBe(true);
    const kmh = day.weather.windKmh[nowIndex(day)] ?? 0;
    expect(scene.wind.length).toBeGreaterThan(100);
    for (const point of scene.wind) expect(point.speed).toBeCloseTo(kmh / 3.6, 5);
  });

  it('puts the demo moment at eight in the morning, India time', () => {
    for (const day of recorded.days) {
      expect(day.asOf.endsWith('T02:30:00.000Z')).toBe(true);
      expect(nowIndex(day)).toBe(8 * 24 + 8);
    }
  });

  it('colours each day by how the air was, cleanest day first among the rainy ones', () => {
    const aqi = (date: string): number => {
      const day = recorded.days.find((d) => d.date === date);
      return day === undefined ? NaN : (dayAqi(day) ?? NaN);
    };
    expect(aqi('2025-10-07')).toBeLessThan(aqi('2025-10-21'));
    expect(aqi('2025-10-07')).toBeLessThan(aqi('2025-12-22'));
  });
});
