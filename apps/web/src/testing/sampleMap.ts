import { seededRandom, usAqi } from '@vayu/core';
import type { Fire } from '../map/fires';
import { gridPoints, type WindPoint } from '../map/live';
import type { Monitor } from '../map/monitors';
import { speedOf, type Wind } from '../map/wind';

/* Made-up map data for the tests: monitors, fires and a wind field, the same on every run. */

const rad = (deg: number): number => (deg * Math.PI) / 180;

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
  { name: 'Karachi', lat: 24.86, lng: 67.01, pm25: 62, count: 2 },
  { name: 'Islamabad', lat: 33.68, lng: 73.05, pm25: 56, count: 2 },
  { name: 'Tehran', lat: 35.69, lng: 51.39, pm25: 38, count: 2 },
  { name: 'Baghdad', lat: 33.31, lng: 44.36, pm25: 54, count: 1 },
  { name: 'Riyadh', lat: 24.71, lng: 46.68, pm25: 46, count: 2 },
  { name: 'Dubai', lat: 25.2, lng: 55.27, pm25: 40, count: 2 },
  { name: 'Istanbul', lat: 41.01, lng: 28.98, pm25: 22, count: 2 },
  { name: 'Tashkent', lat: 41.3, lng: 69.24, pm25: 48, count: 1 },
  { name: 'Almaty', lat: 43.24, lng: 76.89, pm25: 36, count: 1 },
  { name: 'Ulaanbaatar', lat: 47.92, lng: 106.92, pm25: 68, count: 1 },
  { name: 'Beijing', lat: 39.9, lng: 116.4, pm25: 44, count: 3 },
  { name: 'Shanghai', lat: 31.23, lng: 121.47, pm25: 32, count: 3 },
  { name: 'Chengdu', lat: 30.57, lng: 104.07, pm25: 40, count: 2 },
  { name: 'Guangzhou', lat: 23.13, lng: 113.26, pm25: 26, count: 2 },
  { name: 'Wuhan', lat: 30.59, lng: 114.31, pm25: 42, count: 2 },
  { name: 'Xi’an', lat: 34.34, lng: 108.94, pm25: 50, count: 1 },
  { name: 'Seoul', lat: 37.57, lng: 126.98, pm25: 24, count: 2 },
  { name: 'Tokyo', lat: 35.68, lng: 139.69, pm25: 12, count: 2 },
  { name: 'Hanoi', lat: 21.03, lng: 105.85, pm25: 58, count: 2 },
  { name: 'Bangkok', lat: 13.76, lng: 100.5, pm25: 32, count: 2 },
  { name: 'Chiang Mai', lat: 18.79, lng: 98.98, pm25: 64, count: 1 },
  { name: 'Manila', lat: 14.6, lng: 120.98, pm25: 24, count: 2 },
  { name: 'Jakarta', lat: -6.2, lng: 106.85, pm25: 44, count: 2 },
  { name: 'Kuala Lumpur', lat: 3.14, lng: 101.69, pm25: 22, count: 1 },
  { name: 'Singapore', lat: 1.35, lng: 103.82, pm25: 14, count: 1 },
  { name: 'Perth', lat: -31.95, lng: 115.86, pm25: 6, count: 1 },
  { name: 'Sydney', lat: -33.87, lng: 151.21, pm25: 8, count: 2 },
  { name: 'Melbourne', lat: -37.81, lng: 144.96, pm25: 7, count: 1 },
  { name: 'Auckland', lat: -36.85, lng: 174.76, pm25: 5, count: 1 },
  { name: 'Moscow', lat: 55.76, lng: 37.62, pm25: 16, count: 2 },
  { name: 'Kyiv', lat: 50.45, lng: 30.52, pm25: 20, count: 1 },
  { name: 'Warsaw', lat: 52.23, lng: 21.01, pm25: 24, count: 2 },
  { name: 'Berlin', lat: 52.52, lng: 13.4, pm25: 12, count: 2 },
  { name: 'London', lat: 51.51, lng: -0.13, pm25: 10, count: 2 },
  { name: 'Paris', lat: 48.86, lng: 2.35, pm25: 13, count: 2 },
  { name: 'Madrid', lat: 40.42, lng: -3.7, pm25: 9, count: 1 },
  { name: 'Rome', lat: 41.9, lng: 12.5, pm25: 16, count: 1 },
  { name: 'Stockholm', lat: 59.33, lng: 18.07, pm25: 6, count: 1 },
  { name: 'Reykjavik', lat: 64.15, lng: -21.94, pm25: 4, count: 1 },
  { name: 'Cairo', lat: 30.04, lng: 31.24, pm25: 58, count: 2 },
  { name: 'Algiers', lat: 36.75, lng: 3.06, pm25: 26, count: 1 },
  { name: 'Lagos', lat: 6.52, lng: 3.38, pm25: 48, count: 2 },
  { name: 'Accra', lat: 5.6, lng: -0.19, pm25: 34, count: 1 },
  { name: 'N’Djamena', lat: 12.13, lng: 15.05, pm25: 60, count: 1 },
  { name: 'Addis Ababa', lat: 9.03, lng: 38.74, pm25: 30, count: 1 },
  { name: 'Nairobi', lat: -1.29, lng: 36.82, pm25: 18, count: 1 },
  { name: 'Kinshasa', lat: -4.44, lng: 15.27, pm25: 40, count: 1 },
  { name: 'Johannesburg', lat: -26.2, lng: 28.05, pm25: 22, count: 2 },
  { name: 'Cape Town', lat: -33.92, lng: 18.42, pm25: 8, count: 1 },
  { name: 'Mexico City', lat: 19.43, lng: -99.13, pm25: 28, count: 2 },
  { name: 'Los Angeles', lat: 34.05, lng: -118.24, pm25: 14, count: 2 },
  { name: 'Seattle', lat: 47.61, lng: -122.33, pm25: 7, count: 1 },
  { name: 'Denver', lat: 39.74, lng: -104.99, pm25: 8, count: 1 },
  { name: 'Houston', lat: 29.76, lng: -95.37, pm25: 11, count: 1 },
  { name: 'Chicago', lat: 41.88, lng: -87.63, pm25: 10, count: 1 },
  { name: 'New York', lat: 40.71, lng: -74.01, pm25: 9, count: 2 },
  { name: 'Toronto', lat: 43.65, lng: -79.38, pm25: 8, count: 1 },
  { name: 'Anchorage', lat: 61.22, lng: -149.9, pm25: 5, count: 1 },
  { name: 'Bogotá', lat: 4.71, lng: -74.07, pm25: 20, count: 1 },
  { name: 'Lima', lat: -12.05, lng: -77.04, pm25: 32, count: 1 },
  { name: 'Santiago', lat: -33.45, lng: -70.67, pm25: 26, count: 1 },
  { name: 'São Paulo', lat: -23.55, lng: -46.63, pm25: 18, count: 2 },
  { name: 'Buenos Aires', lat: -34.6, lng: -58.38, pm25: 14, count: 1 },
  { name: 'Manaus', lat: -3.12, lng: -60.02, pm25: 24, count: 1 },
];

const AS_AT = 1;

/** Made-up monitors, spread over the world the way real ones are (south Asia most densely): thick around cities, thin between. */
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
      });
      // This used to pick government or community; the draw stays so the made-up monitors stay put.
      random();
    }
  }
  return out;
}

/**
 * Made-up fires, placed where stubble is burnt in October: thick across Punjab and Haryana, thinner
 * across western Uttar Pradesh.
 */
export function sampleFires(): readonly Fire[] {
  const random = seededRandom(1010);
  const fires: Fire[] = [];
  const patch = (
    n: number,
    lat: number,
    lng: number,
    spreadLat: number,
    spreadLng: number,
  ): void => {
    for (let i = 0; i < n; i++) {
      fires.push({
        id: `fire-${String(fires.length + 1)}`,
        lat: Math.round((lat + (random() - 0.5) * 2 * spreadLat) * 1000) / 1000,
        lng: Math.round((lng + (random() - 0.5) * 2 * spreadLng) * 1000) / 1000,
        frp: Math.round((4 + random() * 46) * 10) / 10,
        hoursAgo: Math.floor(random() * 24),
      });
    }
  };
  patch(46, 30.9, 75.5, 0.9, 1.1); // Punjab
  patch(22, 29.7, 76.2, 0.7, 0.9); // Haryana
  patch(12, 29.0, 78.2, 0.8, 0.8); // western Uttar Pradesh
  patch(6, 31.4, 74.4, 0.4, 0.5); // across the border
  return fires;
}

/**
 * A made-up wind field for south Asia in October, smooth and repeatable: a steady north-westerly
 * across the Indo-Gangetic plain, easterly drift over the peninsula and a sea breeze off the coasts,
 * with gentle waves in it so the flow does not look ruled.
 */
export function windAt(lat: number, lng: number): Wind {
  const north = Math.min(1, Math.max(0, (lat - 12) / 18));
  const base = { u: 1.6 + 3.4 * north, v: -(1 + 2.6 * north) };
  const wave = {
    u: 1.5 * Math.sin(rad(lat * 9) + rad(lng * 5)) + 0.8 * Math.cos(rad(lng * 11)),
    v: 1.4 * Math.cos(rad(lat * 7) - rad(lng * 6)) + 0.7 * Math.sin(rad(lat * 13)),
  };
  const southWest = lat < 12 ? { u: -3, v: 0.5 } : { u: 0, v: 0 };
  return { u: base.u + wave.u + southWest.u, v: base.v + wave.v + southWest.v };
}

/** The sample wind laid out as grid points, in the same shape as the live wind. */
export function sampleWindGrid(): readonly WindPoint[] {
  return gridPoints(3).map(({ lat, lng }) => {
    const { u, v } = windAt(lat, lng);
    const towards = ((Math.atan2(u, v) * 180) / Math.PI + 360) % 360;
    return { lat, lng, speed: speedOf({ u, v }), fromDeg: (towards + 180) % 360 };
  });
}
