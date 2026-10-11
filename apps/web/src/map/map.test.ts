import type { Monitor } from './monitors';
import { describe, expect, it } from 'vitest';
import { levelForAqi } from '../design/levels';
import { firesGeoJson } from './fires';
import { monitorsGeoJson } from './monitors';
import { advectWith, speedOf } from './wind';
import { sampleFires, sampleMonitors, windAt } from '../testing/sampleMap';

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

  it('has unique ids, is thickest over south Asia and reaches every continent', () => {
    expect(new Set(monitors.map((m) => m.id)).size).toBe(monitors.length);
    const asia = monitors.filter((m) => m.lat > 5 && m.lat < 36 && m.lng > 68 && m.lng < 92);
    expect(asia.length).toBeGreaterThan(monitors.length / 2);
    const lats = monitors.map((m) => m.lat);
    const lngs = monitors.map((m) => m.lng);
    // Far north and south, and from the Americas across to the Pacific: the whole globe has something to show.
    expect(Math.min(...lats)).toBeLessThan(-30);
    expect(Math.max(...lats)).toBeGreaterThan(55);
    expect(Math.min(...lngs)).toBeLessThan(-100);
    expect(Math.max(...lngs)).toBeGreaterThan(150);
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
    const end = advectWith(windAt, start.lat, start.lng, 3600);
    expect(end.lng).toBeGreaterThan(start.lng);
    expect(end.lat).toBeLessThan(start.lat);
    const km = Math.hypot(
      (end.lat - start.lat) * 111,
      (end.lng - start.lng) * 111 * Math.cos((29 * Math.PI) / 180),
    );
    expect(km).toBeCloseTo((speedOf(windAt(29, 77)) * 3600) / 1000, 0);
  });
});

describe('monitors binned for the colour field', () => {
  it('gives one value for each square of ground, the average of those in it', async () => {
    const { binMonitors } = await import('./monitors');
    const at = (id: string, lat: number, lng: number, pm25: number, aqi: number): Monitor => ({
      id,
      name: id,
      lat,
      lng,
      pm25,
      aqi,
      ageMinutes: 0,
    });
    const bins = binMonitors(
      [at('a', 28.1, 77.1, 40, 100), at('b', 28.3, 77.3, 60, 160), at('c', 40.5, -73.5, 5, 21)],
      1,
    );
    expect(bins).toHaveLength(2);
    const near = bins.find((b) => b.lat < 30);
    expect(near).toMatchObject({ pm25: 50, aqi: 130 });
    expect(near?.lat).toBeCloseTo(28.2, 5);
  });
});
