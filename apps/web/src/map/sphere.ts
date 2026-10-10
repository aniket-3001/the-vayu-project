const rad = (d: number): number => (d * Math.PI) / 180;

/** Angular distance in degrees between two points on the sphere. */
export function angleBetween(
  a: { readonly lat: number; readonly lng: number },
  b: { readonly lat: number; readonly lng: number },
): number {
  const c =
    Math.sin(rad(a.lat)) * Math.sin(rad(b.lat)) +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(a.lng - b.lng));
  return (Math.acos(Math.min(1, Math.max(-1, c))) * 180) / Math.PI;
}

/** Past this angular distance from the centre of the view, a point is round the back of the globe. */
export const HORIZON_DEG = 78;
