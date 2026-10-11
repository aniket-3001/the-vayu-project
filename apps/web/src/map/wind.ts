/** Wind in metres per second: `u` towards the east, `v` towards the north. */
export interface Wind {
  readonly u: number;
  readonly v: number;
}

export const speedOf = (wind: Wind): number => Math.hypot(wind.u, wind.v);

/** Where a parcel of air is after `seconds`, moving with whatever wind `field` gives. */
export function advectWith(
  field: (lat: number, lng: number) => Wind,
  lat: number,
  lng: number,
  seconds: number,
): { lat: number; lng: number } {
  const wind = field(lat, lng);
  const dLat = (wind.v * seconds) / 111_000;
  const dLng = (wind.u * seconds) / (111_000 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return { lat: lat + dLat, lng: lng + dLng };
}
