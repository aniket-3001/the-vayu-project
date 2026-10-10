/** Wind in metres per second: `u` towards the east, `v` towards the north. */
export interface Wind {
  readonly u: number;
  readonly v: number;
}

const rad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * A made-up wind field for south Asia in October, smooth and repeatable: a steady north-westerly
 * across the Indo-Gangetic plain, easterly drift over the peninsula and a sea breeze off the coasts,
 * with gentle waves in it so the flow does not look ruled. Real winds replace this later.
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

export const speedOf = (wind: Wind): number => Math.hypot(wind.u, wind.v);

/**
 * Where a parcel of air starting at (lat, lng) is after `seconds`, moving with the wind. Metres per
 * second are turned into degrees: a degree of latitude is about 111 km, of longitude shorter by cos(lat).
 */
export function advect(lat: number, lng: number, seconds: number): { lat: number; lng: number } {
  const wind = windAt(lat, lng);
  const dLat = (wind.v * seconds) / 111_000;
  const dLng = (wind.u * seconds) / (111_000 * Math.max(0.2, Math.cos(rad(lat))));
  return { lat: lat + dLat, lng: lng + dLng };
}
