/** Straight-line distance in kilometres between two points, by the haversine formula. */
export function distanceKm(
  a: { readonly lat: number; readonly lng: number },
  b: { readonly lat: number; readonly lng: number },
): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(h));
}

/** How close a point must be to a place, or to a unit, to count as being there. */
export const AT_PLACE_KM = 0.3;
