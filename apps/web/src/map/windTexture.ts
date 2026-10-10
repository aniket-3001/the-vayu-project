import { WORLD, towardsDeg, type WindPoint } from './live';

/** The wind speed the texture can hold either way, in metres per second. */
export const WIND_RANGE = 25;

const toUV = (speed: number, fromDeg: number): { u: number; v: number } => {
  const rad = (towardsDeg(fromDeg) * Math.PI) / 180;
  return { u: speed * Math.sin(rad), v: speed * Math.cos(rad) };
};

/**
 * Wind as a picture: red holds the eastward speed and green the northward, both from -25 to +25 m/s, one
 * pixel to a patch of ground, blended between the grid points by inverse distance. This is the format the
 * wind-particle layer reads. Rows run north to south, columns west to east.
 */
export function windPixels(
  points: readonly WindPoint[],
  width: number,
  height: number,
  bounds: {
    readonly west: number;
    readonly south: number;
    readonly east: number;
    readonly north: number;
  } = WORLD,
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const known = points.map((p) => ({ ...p, ...toUV(p.speed, p.fromDeg) }));
  const encode = (value: number): number =>
    Math.round(
      ((Math.max(-WIND_RANGE, Math.min(WIND_RANGE, value)) + WIND_RANGE) / (2 * WIND_RANGE)) * 255,
    );
  for (let row = 0; row < height; row++) {
    const lat = bounds.north - ((row + 0.5) / height) * (bounds.north - bounds.south);
    for (let col = 0; col < width; col++) {
      const lng = bounds.west + ((col + 0.5) / width) * (bounds.east - bounds.west);
      let weight = 0;
      let u = 0;
      let v = 0;
      for (const p of known) {
        const d = Math.hypot(lat - p.lat, (lng - p.lng) * Math.cos((lat * Math.PI) / 180));
        const w = 1 / Math.max(d, 0.05) ** 2;
        weight += w;
        u += w * p.u;
        v += w * p.v;
      }
      const i = (row * width + col) * 4;
      pixels[i] = encode(weight === 0 ? 0 : u / weight);
      pixels[i + 1] = encode(weight === 0 ? 0 : v / weight);
      pixels[i + 2] = 0;
      pixels[i + 3] = 255;
    }
  }
  return pixels;
}

const decode = (byte: number): number => (byte / 255) * 2 * WIND_RANGE - WIND_RANGE;

/**
 * A function that gives the wind at any point, blended from the grid of readings. It paints the picture once
 * and reads it back, so asking for thousands of points a frame stays cheap.
 */
export function makeWindField(
  points: readonly WindPoint[],
  width = 360,
  height = 160,
): (lat: number, lng: number) => { readonly u: number; readonly v: number } {
  const pixels = windPixels(points, width, height);
  return (lat, lng) => {
    const col = Math.min(
      width - 1,
      Math.max(0, Math.floor(((lng - WORLD.west) / (WORLD.east - WORLD.west)) * width)),
    );
    const row = Math.min(
      height - 1,
      Math.max(0, Math.floor(((WORLD.north - lat) / (WORLD.north - WORLD.south)) * height)),
    );
    const i = (row * width + col) * 4;
    return { u: decode(pixels[i] ?? 0), v: decode(pixels[i + 1] ?? 0) };
  };
}
