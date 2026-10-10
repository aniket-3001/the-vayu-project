import { describe, expect, it } from 'vitest';
import { levelForAqi } from '../design/levels';
import { firesGeoJson, sampleFires } from './fires';
import { monitorsGeoJson, sampleMonitors } from './monitors';
import { advect, speedOf, windAt } from './wind';

describe('sample monitors', () => {
  const monitors = sampleMonitors();

  it('is repeatable and has over a hundred, each with a name, an age and a real AQI', () => {
    expect(sampleMonitors()).toEqual(monitors);
    expect(monitors.length).toBeGreaterThan(80);
    for (const m of monitors) {
      expect(m.name.length).toBeGreaterThan(1);
      expect(m.ageMinutes).toBeGreaterThan(0);
      expect(m.aqi).toBeGreaterThanOrEqual(0);
      expect(m.pm25).toBeGreaterThan(0);
    }
  });

  it('has unique ids and sits inside south Asia', () => {
    expect(new Set(monitors.map((m) => m.id)).size).toBe(monitors.length);
    for (const m of monitors) {
      expect(m.lat).toBeGreaterThan(5);
      expect(m.lat).toBeLessThan(36);
      expect(m.lng).toBeGreaterThan(68);
      expect(m.lng).toBeLessThan(92);
    }
  });

  it('is dirtiest on the Indo-Gangetic plain and cleanest in the south', () => {
    const mean = (ms: typeof monitors): number => ms.reduce((s, m) => s + m.pm25, 0) / ms.length;
    const delhi = monitors.filter((m) => m.name.startsWith('Delhi'));
    const south = monitors.filter((m) => /Bengaluru|Chennai|Kochi/u.test(m.name));
    expect(mean(delhi)).toBeGreaterThan(mean(south) * 2);
  });

  it('covers several AQI levels, so the map has a gradient to show', () => {
    expect(new Set(monitors.map((m) => levelForAqi(m.aqi).name)).size).toBeGreaterThanOrEqual(4);
  });

  it('becomes GeoJSON with longitude first, as maps expect', () => {
    const geo = monitorsGeoJson(monitors);
    expect(geo.features).toHaveLength(monitors.length);
    const first = geo.features[0];
    expect(first?.geometry.coordinates).toEqual([monitors[0]?.lng, monitors[0]?.lat]);
    expect(first?.properties).toMatchObject({ aqi: monitors[0]?.aqi });
  });
});

describe('sample fires', () => {
  const fires = sampleFires();

  it('is repeatable, with unique ids, and burns in Punjab and Haryana first', () => {
    expect(sampleFires()).toEqual(fires);
    expect(new Set(fires.map((f) => f.id)).size).toBe(fires.length);
    const north = fires.filter((f) => f.lat > 29 && f.lat < 32 && f.lng > 74 && f.lng < 77.5);
    expect(north.length / fires.length).toBeGreaterThan(0.6);
  });

  it('gives each fire a plausible power and a recent time', () => {
    for (const f of fires) {
      expect(f.frp).toBeGreaterThan(0);
      expect(f.hoursAgo).toBeGreaterThanOrEqual(0);
      expect(f.hoursAgo).toBeLessThan(24);
    }
    expect(firesGeoJson(fires).features).toHaveLength(fires.length);
  });
});

describe('the sample wind', () => {
  it('is a finite, repeatable, believable speed everywhere on the map', () => {
    for (let lat = 5; lat <= 36; lat += 3) {
      for (let lng = 66; lng <= 94; lng += 4) {
        const w = windAt(lat, lng);
        expect(Number.isFinite(w.u)).toBe(true);
        expect(Number.isFinite(w.v)).toBe(true);
        expect(speedOf(w)).toBeLessThan(14);
        expect(windAt(lat, lng)).toEqual(w);
      }
    }
  });

  it('blows from the north-west over the plain, so air moves south-east', () => {
    const w = windAt(29, 77);
    expect(w.u).toBeGreaterThan(0);
    expect(w.v).toBeLessThan(0);
  });

  it('moves a parcel of air the way the wind blows, by about speed times time', () => {
    const start = { lat: 29, lng: 77 };
    const end = advect(start.lat, start.lng, 3600);
    expect(end.lng).toBeGreaterThan(start.lng);
    expect(end.lat).toBeLessThan(start.lat);
    const km = Math.hypot(
      (end.lat - start.lat) * 111,
      (end.lng - start.lng) * 111 * Math.cos((29 * Math.PI) / 180),
    );
    expect(km).toBeCloseTo((speedOf(windAt(29, 77)) * 3600) / 1000, 0);
  });
});
