import { cigaretteFigure, cigarettesPerDay } from '../units/smoke';
import type { FeatureCollection, Point } from 'geojson';
import { usAqi } from '@vayu/core';
import type { MapStation } from '@vayu/contracts';

export interface Monitor {
  readonly id: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  readonly pm25: number;
  readonly aqi: number;
  readonly ageMinutes: number;
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
        // The label when the cigarette switch is on: the same air, said as cigarettes a day.
        cigs: cigaretteFigure(cigarettesPerDay(m.pm25)),
        age: m.ageMinutes,
      },
    })),
  };
}

/** The monitors our API says have a recent reading, as the map draws them. The age is worked out from now. */
export function monitorsFromStations(
  stations: readonly MapStation[],
  nowMs: number,
): readonly Monitor[] {
  return stations.map((s) => ({
    id: s.id,
    name: s.name,
    lat: s.lat,
    lng: s.lng,
    pm25: s.pm25,
    aqi: usAqi(s.pm25)?.value ?? 0,
    ageMinutes: Math.max(0, Math.round((nowMs - Date.parse(s.at)) / 60_000)),
  }));
}

/**
 * The monitors, one value for each square of `cell` degrees, so the colour between them can be worked out from
 * thousands of monitors quickly: where there are many in one square, their readings are averaged.
 */
export function binMonitors(monitors: readonly Monitor[], cell = 1): readonly Monitor[] {
  const bins = new Map<string, { lat: number; lng: number; pm: number; aqi: number; n: number }>();
  for (const m of monitors) {
    const key = `${String(Math.floor(m.lat / cell))}:${String(Math.floor(m.lng / cell))}`;
    const bin = bins.get(key) ?? { lat: 0, lng: 0, pm: 0, aqi: 0, n: 0 };
    bin.lat += m.lat;
    bin.lng += m.lng;
    bin.pm += m.pm25;
    bin.aqi += m.aqi;
    bin.n += 1;
    bins.set(key, bin);
  }
  return [...bins.entries()].map(([key, b]) => ({
    id: `bin-${key}`,
    name: 'Monitors here',
    lat: b.lat / b.n,
    lng: b.lng / b.n,
    pm25: b.pm / b.n,
    aqi: Math.round(b.aqi / b.n),
    ageMinutes: 0,
  }));
}
