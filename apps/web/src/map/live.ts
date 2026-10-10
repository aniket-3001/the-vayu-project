import { usAqi } from '@vayu/core';
import type { Monitor } from './monitors';

/** A reading of the wind at a point: metres per second, and the direction it blows from, in degrees. */
export interface WindPoint {
  readonly lat: number;
  readonly lng: number;
  readonly speed: number;
  readonly fromDeg: number;
}

/** The part of the world the grid covers: south Asia and a margin around it. */
export const GRID: {
  readonly south: number;
  readonly north: number;
  readonly west: number;
  readonly east: number;
} = {
  south: 4,
  north: 36,
  west: 62,
  east: 98,
};

/** The grid of points we ask the weather and air models about. */
export function gridPoints(
  step: number,
): readonly { readonly lat: number; readonly lng: number }[] {
  const points: { lat: number; lng: number }[] = [];
  for (let lat = GRID.south; lat <= GRID.north; lat += step) {
    for (let lng = GRID.west; lng <= GRID.east; lng += step) points.push({ lat, lng });
  }
  return points;
}

/**
 * The rest of the world, on a coarse grid, for the air colours: ten degrees apart, which is about 1,100 km. The
 * regional model has nothing finer to say there than that, and the map says so. Points in the closer grid above
 * are left out.
 */
export function worldPoints(step = 10): readonly { readonly lat: number; readonly lng: number }[] {
  const points: { lat: number; lng: number }[] = [];
  for (let lat = -80; lat <= 80; lat += step) {
    for (let lng = -180; lng < 180; lng += step) {
      const inside =
        lat >= GRID.south - 1 &&
        lat <= GRID.north + 1 &&
        lng >= GRID.west - 1 &&
        lng <= GRID.east + 1;
      if (!inside) points.push({ lat, lng });
    }
  }
  return points;
}

const CHUNK = 90;
const WIND_URL = 'https://api.open-meteo.com/v1/forecast';
const AIR_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';

interface Chunked {
  readonly latitude: number;
  readonly longitude: number;
  readonly current?: Readonly<Record<string, number | null | undefined>>;
}

/** Asks Open-Meteo about many points at once, a hundred or so per request. */
async function manyPoints(
  base: string,
  fields: string,
  points: readonly { readonly lat: number; readonly lng: number }[],
  fetchImpl: typeof fetch,
  extra = '',
): Promise<readonly Chunked[]> {
  const out: Chunked[] = [];
  for (let i = 0; i < points.length; i += CHUNK) {
    const part = points.slice(i, i + CHUNK);
    const url =
      `${base}?latitude=${part.map((p) => String(p.lat)).join(',')}` +
      `&longitude=${part.map((p) => String(p.lng)).join(',')}&current=${fields}${extra}`;
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`Open-Meteo answered ${String(res.status)}`);
    const body = (await res.json()) as Chunked | readonly Chunked[];
    out.push(...(Array.isArray(body) ? (body as readonly Chunked[]) : [body as Chunked]));
  }
  return out;
}

/** Wind now across the grid, from the ICON and GFS weather models (which assimilate satellite data). */
export async function fetchWindGrid(
  fetchImpl: typeof fetch = fetch,
): Promise<readonly WindPoint[]> {
  const points = gridPoints(3);
  const rows = await manyPoints(
    WIND_URL,
    'wind_speed_10m,wind_direction_10m',
    points,
    fetchImpl,
    '&wind_speed_unit=ms',
  );
  const winds: WindPoint[] = [];
  rows.forEach((row, i) => {
    const at = points[i];
    const speed = row.current?.wind_speed_10m;
    const fromDeg = row.current?.wind_direction_10m;
    if (at === undefined || typeof speed !== 'number' || typeof fromDeg !== 'number') return;
    winds.push({ lat: at.lat, lng: at.lng, speed, fromDeg });
  });
  if (winds.length === 0) throw new Error('No wind came back');
  return winds;
}

/**
 * PM2.5 and US AQI now, from the CAMS atmospheric model (satellite-assimilated), as pseudo-monitors: a close grid
 * over south Asia and a coarse one over the rest of the world.
 */
export async function fetchAirGrid(fetchImpl: typeof fetch = fetch): Promise<readonly Monitor[]> {
  const points = [...gridPoints(2), ...worldPoints(10)];
  const rows = await manyPoints(AIR_URL, 'pm2_5,us_aqi', points, fetchImpl);
  const grid: Monitor[] = [];
  rows.forEach((row, i) => {
    const at = points[i];
    const pm25 = row.current?.pm2_5;
    if (at === undefined || typeof pm25 !== 'number') return;
    const reported = row.current?.us_aqi;
    grid.push({
      id: `cams-${String(at.lat)}-${String(at.lng)}`,
      name: 'Model grid',
      lat: at.lat,
      lng: at.lng,
      pm25,
      aqi: typeof reported === 'number' ? reported : (usAqi(pm25)?.value ?? 0),
      ageMinutes: 0,
    });
  });
  if (grid.length === 0) throw new Error('No air quality came back');
  return grid;
}

/** The number of fires our API counted in the last 24 hours (NASA satellite detections), or undefined. */
export async function fetchFireCount(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<number | undefined> {
  const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/v1/fires`);
  if (!res.ok) return undefined;
  const body = (await res.json()) as { counts?: { last24h?: unknown } };
  const count = body.counts?.last24h;
  return typeof count === 'number' ? count : undefined;
}

/** The direction the wind blows towards, which is what the wind layer wants, from where it comes from. */
export const towardsDeg = (fromDeg: number): number => (((fromDeg + 180) % 360) + 360) % 360;

const CACHE_KEY = 'vayu.mapdata.v1';
const CACHE_MINUTES = 30;

/** Remembers an answer in this tab for half an hour, so reopening the map does not ask again. */
export function remember(
  name: string,
  value: unknown,
  storage: Storage = window.sessionStorage,
): void {
  try {
    storage.setItem(`${CACHE_KEY}.${name}`, JSON.stringify({ at: Date.now(), value }));
  } catch {
    // Best effort.
  }
}

export function recall(name: string, storage: Storage = window.sessionStorage): unknown {
  try {
    const raw = storage.getItem(`${CACHE_KEY}.${name}`);
    if (raw === null) return undefined;
    const saved = JSON.parse(raw) as { at: number; value: unknown };
    return Date.now() - saved.at < CACHE_MINUTES * 60_000 ? saved.value : undefined;
  } catch {
    return undefined;
  }
}
