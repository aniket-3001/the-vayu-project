/** A public air-quality monitoring station, independent of any one data provider. */
export interface Station {
  readonly id: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  /** Whether this station reports PM2.5 at all. A station without it is never chosen (§6.2 of the build spec). */
  readonly hasPm25: boolean;
}

export interface Point {
  readonly lat: number;
  readonly lng: number;
}

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance between two points, in kilometres. */
export function haversineKm(a: Point, b: Point): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface NearestStation {
  readonly station: Station;
  readonly distanceKm: number;
}

/**
 * The nearest station that actually reports PM2.5, by straight-line distance. A closer station
 * without a PM2.5 sensor is skipped, never chosen as a fallback (build spec §7.1).
 */
export function nearestStation(
  point: Point,
  stations: readonly Station[],
): NearestStation | undefined {
  return stations
    .filter((station) => station.hasPm25)
    .map((station) => ({ station, distanceKm: haversineKm(point, station) }))
    .reduce<NearestStation | undefined>(
      (closest, candidate) =>
        closest === undefined || candidate.distanceKm < closest.distanceKm ? candidate : closest,
      undefined,
    );
}
