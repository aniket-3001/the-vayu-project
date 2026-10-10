import type { FeatureCollection, Point } from 'geojson';
import { seededRandom } from '@vayu/core';

export interface Fire {
  readonly id: string;
  readonly lat: number;
  readonly lng: number;
  /** Fire radiative power, MW: how fierce it is. */
  readonly frp: number;
  readonly hoursAgo: number;
}

/**
 * Made-up fires, placed where stubble is burnt in October: thick across Punjab and Haryana, thinner
 * across western Uttar Pradesh. The real ones will come from NASA's satellite fire feed.
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

export function firesGeoJson(fires: readonly Fire[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: fires.map((f) => ({
      type: 'Feature',
      id: f.id,
      geometry: { type: 'Point', coordinates: [f.lng, f.lat] },
      properties: { id: f.id, frp: f.frp, hoursAgo: f.hoursAgo },
    })),
  };
}

/** The fires our API saw in the last day: how many, and where. Undefined when the API cannot be reached. */
export async function fetchFires(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
  nowMs: number = Date.now(),
): Promise<{ readonly count: number; readonly fires: readonly Fire[] } | undefined> {
  const res = await fetchImpl(`${baseUrl.replace(/\/+$/u, '')}/v1/fires`);
  if (!res.ok) return undefined;
  const body = (await res.json()) as {
    counts?: { last24h?: unknown };
    detections?: { lat?: unknown; lng?: unknown; at?: unknown; frp?: unknown }[];
  };
  const count = body.counts?.last24h;
  if (typeof count !== 'number') return undefined;
  const fires = (body.detections ?? []).flatMap((d, i): Fire[] =>
    typeof d.lat === 'number' && typeof d.lng === 'number' && typeof d.at === 'string'
      ? [
          {
            id: `fire-${String(i + 1)}`,
            lat: d.lat,
            lng: d.lng,
            frp: typeof d.frp === 'number' ? d.frp : 10,
            hoursAgo: Math.max(0, Math.round((nowMs - Date.parse(d.at)) / 3_600_000)),
          },
        ]
      : [],
  );
  return { count, fires };
}
