import type { FeatureCollection, Point } from 'geojson';
import { seededRandom, usAqi } from '@vayu/core';

export interface Monitor {
  readonly id: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  readonly pm25: number;
  readonly aqi: number;
  readonly ageMinutes: number;
  readonly kind: 'government' | 'community';
}

/** A city, and the PM2.5 (µg/m³) that a sample monitor there reads around this time of year. */
interface City {
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  readonly pm25: number;
  /** How many monitors to scatter in and around it. */
  readonly count: number;
}

const CITIES: readonly City[] = [
  { name: 'Delhi', lat: 28.61, lng: 77.21, pm25: 78, count: 14 },
  { name: 'Gurugram', lat: 28.46, lng: 77.03, pm25: 70, count: 4 },
  { name: 'Noida', lat: 28.57, lng: 77.32, pm25: 82, count: 4 },
  { name: 'Ghaziabad', lat: 28.67, lng: 77.45, pm25: 95, count: 3 },
  { name: 'Faridabad', lat: 28.41, lng: 77.31, pm25: 66, count: 2 },
  { name: 'Chandigarh', lat: 30.73, lng: 76.78, pm25: 58, count: 3 },
  { name: 'Ludhiana', lat: 30.9, lng: 75.86, pm25: 90, count: 3 },
  { name: 'Amritsar', lat: 31.63, lng: 74.87, pm25: 84, count: 3 },
  { name: 'Patiala', lat: 30.34, lng: 76.39, pm25: 88, count: 2 },
  { name: 'Lahore', lat: 31.55, lng: 74.34, pm25: 120, count: 3 },
  { name: 'Jaipur', lat: 26.91, lng: 75.79, pm25: 52, count: 3 },
  { name: 'Agra', lat: 27.18, lng: 78.01, pm25: 74, count: 2 },
  { name: 'Lucknow', lat: 26.85, lng: 80.95, pm25: 92, count: 4 },
  { name: 'Kanpur', lat: 26.45, lng: 80.33, pm25: 105, count: 3 },
  { name: 'Varanasi', lat: 25.32, lng: 82.99, pm25: 80, count: 2 },
  { name: 'Patna', lat: 25.59, lng: 85.14, pm25: 98, count: 3 },
  { name: 'Kolkata', lat: 22.57, lng: 88.36, pm25: 46, count: 4 },
  { name: 'Dhaka', lat: 23.81, lng: 90.41, pm25: 88, count: 3 },
  { name: 'Kathmandu', lat: 27.71, lng: 85.32, pm25: 42, count: 2 },
  { name: 'Ahmedabad', lat: 23.02, lng: 72.57, pm25: 44, count: 3 },
  { name: 'Mumbai', lat: 19.08, lng: 72.88, pm25: 34, count: 4 },
  { name: 'Pune', lat: 18.52, lng: 73.86, pm25: 28, count: 2 },
  { name: 'Hyderabad', lat: 17.39, lng: 78.49, pm25: 30, count: 3 },
  { name: 'Bengaluru', lat: 12.97, lng: 77.59, pm25: 20, count: 3 },
  { name: 'Chennai', lat: 13.08, lng: 80.27, pm25: 22, count: 3 },
  { name: 'Kochi', lat: 9.93, lng: 76.27, pm25: 14, count: 2 },
  { name: 'Bhopal', lat: 23.26, lng: 77.41, pm25: 48, count: 2 },
  { name: 'Nagpur', lat: 21.15, lng: 79.09, pm25: 40, count: 2 },
  { name: 'Colombo', lat: 6.93, lng: 79.86, pm25: 12, count: 1 },
  { name: 'Kabul', lat: 34.53, lng: 69.17, pm25: 70, count: 1 },
];

const AS_AT = 1;

/** Made-up monitors, spread over south Asia the way real ones are: thick around cities, thin between. */
export function sampleMonitors(): readonly Monitor[] {
  const random = seededRandom(20261010 * AS_AT);
  const out: Monitor[] = [];
  for (const city of CITIES) {
    for (let i = 0; i < city.count; i++) {
      const spread = i === 0 ? 0 : 0.18;
      const pm25 = Math.max(2, Math.round(city.pm25 * (0.78 + random() * 0.44) * 10) / 10);
      out.push({
        id: `${city.name.toLowerCase()}-${String(i + 1)}`,
        name: i === 0 ? city.name : `${city.name} ${String(i + 1)}`,
        lat: Math.round((city.lat + (random() - 0.5) * 2 * spread) * 1000) / 1000,
        lng: Math.round((city.lng + (random() - 0.5) * 2 * spread) * 1000) / 1000,
        pm25,
        aqi: usAqi(pm25)?.value ?? 0,
        ageMinutes: 3 + Math.floor(random() * 55),
        kind: random() < 0.7 ? 'government' : 'community',
      });
    }
  }
  return out;
}

/** The monitors as GeoJSON, which is what the map wants. */
export function monitorsGeoJson(monitors: readonly Monitor[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: monitors.map((m) => ({
      type: 'Feature',
      id: m.id,
      geometry: { type: 'Point', coordinates: [m.lng, m.lat] },
      properties: {
        id: m.id,
        name: m.name,
        aqi: m.aqi,
        pm25: m.pm25,
        age: m.ageMinutes,
        kind: m.kind,
      },
    })),
  };
}
