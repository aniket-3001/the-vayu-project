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

/** How near a fire must be to count as near a place, and how far upwind one may be and still count. */
export const NEAR_KM = 100;
export const UPWIND_KM = 300;
/** How far off the wind's direction a fire may lie and still be "upwind", in degrees either side. */
const UPWIND_SPREAD_DEG = 60;

/** Straight-line distance between two points, in kilometres. */
export function distanceKm(
  a: { readonly lat: number; readonly lng: number },
  b: { readonly lat: number; readonly lng: number },
): number {
  const rad = (deg: number): number => (deg * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The compass bearing from one point to another, 0 to 360. */
export function bearingDeg(
  from: { readonly lat: number; readonly lng: number },
  to: { readonly lat: number; readonly lng: number },
): number {
  const rad = (deg: number): number => (deg * Math.PI) / 180;
  const y = Math.sin(rad(to.lng - from.lng)) * Math.cos(rad(to.lat));
  const x =
    Math.cos(rad(from.lat)) * Math.sin(rad(to.lat)) -
    Math.sin(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.cos(rad(to.lng - from.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * The fires that can reach a place, from the ones seen in the last day: any within 100 km, and those up to 300 km
 * away that lie upwind (the wind is coming from their side, within 60 degrees). With no wind known, only the near
 * ones count. A fire far off, or downwind, does not affect this place today, so it is left out.
 */
export function firesAffecting(
  fires: readonly Fire[],
  place: { readonly lat: number; readonly lng: number },
  windFromDeg?: number,
): readonly Fire[] {
  return fires.filter((fire) => {
    const km = distanceKm(place, fire);
    if (km <= NEAR_KM) return true;
    if (km > UPWIND_KM || windFromDeg === undefined) return false;
    const off = Math.abs(((bearingDeg(place, fire) - windFromDeg + 540) % 360) - 180);
    return off <= UPWIND_SPREAD_DEG;
  });
}
