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

/** The whole map: every longitude, and latitudes to 80 degrees. The wind is a picture of this. */
export const WORLD = { south: -80, north: 80, west: -180, east: 180 } as const;

/**
 * The rest of the world, on a coarse grid: fifteen degrees apart, which is about 1,700 km. Wind changes slowly
 * across that, and it keeps what the app asks Open-Meteo for each time the map opens to about six hundred points.
 * Points inside the closer grid above are left out.
 */
export function worldPoints(step = 15): readonly { readonly lat: number; readonly lng: number }[] {
  const points: { lat: number; lng: number }[] = [];
  for (let lat = -75; lat <= 75; lat += step) {
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
  const points = [...gridPoints(3), ...worldPoints(15)];
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

/** The grid MET Norway is asked for, a point at a time: a coarser one, about two hundred requests. */
export function metNoPoints(): readonly { readonly lat: number; readonly lng: number }[] {
  const points: { lat: number; lng: number }[] = [];
  for (let lat = GRID.south; lat <= GRID.north; lat += 4)
    for (let lng = GRID.west; lng <= GRID.east; lng += 4) points.push({ lat, lng });
  for (let lat = -60; lat <= 60; lat += 20) {
    for (let lng = -180; lng < 180; lng += 20) {
      const inside =
        lat >= GRID.south - 2 &&
        lat <= GRID.north + 2 &&
        lng >= GRID.west - 2 &&
        lng <= GRID.east + 2;
      if (!inside) points.push({ lat, lng });
    }
  }
  return points;
}

const MET_NO_URL = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';

/**
 * The wind from MET Norway's Locationforecast, which needs no key and does not share Open-Meteo's daily allowance. It
 * is the second source when Open-Meteo has turned the browser away: a coarser grid, six points at a time. Points
 * that fail are left out, and with fewer than half there is no wind (it throws), so a patchy one is never shown.
 */
export async function fetchWindFromMetNo(
  fetchImpl: typeof fetch = fetch,
): Promise<readonly WindPoint[]> {
  const wanted = metNoPoints();
  const out: (WindPoint | undefined)[] = new Array<WindPoint | undefined>(wanted.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next;
      next += 1;
      const at = wanted[i];
      if (at === undefined) return;
      try {
        const res = await fetchImpl(`${MET_NO_URL}?lat=${String(at.lat)}&lon=${String(at.lng)}`);
        if (!res.ok) continue;
        const body = (await res.json()) as {
          properties?: {
            timeseries?: { data?: { instant?: { details?: Record<string, unknown> } } }[];
          };
        };
        const details = body.properties?.timeseries?.[0]?.data?.instant?.details;
        const speed = details?.wind_speed;
        const fromDeg = details?.wind_from_direction;
        if (typeof speed === 'number' && typeof fromDeg === 'number')
          out[i] = { lat: at.lat, lng: at.lng, speed, fromDeg };
      } catch {
        // This point is left out.
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  const winds = out.filter((p): p is WindPoint => p !== undefined);
  if (winds.length < wanted.length / 2) throw new Error('MET Norway gave too little wind');
  return winds;
}

/**
 * The wind from our own API: the same grid, asked of the weather model once for everyone and kept half an hour, so no
 * visitor's address is spent asking it. Throws when the API has none (it answers 502 rather than guess).
 */
export async function fetchWindFromApi(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<readonly WindPoint[]> {
  const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/v1/wind`);
  if (!res.ok) throw new Error(`The API answered ${String(res.status)} for the wind`);
  const body = (await res.json()) as { points?: unknown };
  const points = Array.isArray(body.points) ? (body.points as readonly unknown[]) : [];
  const winds = points.filter(
    (p): p is WindPoint =>
      typeof p === 'object' &&
      p !== null &&
      typeof (p as WindPoint).lat === 'number' &&
      typeof (p as WindPoint).lng === 'number' &&
      typeof (p as WindPoint).speed === 'number' &&
      typeof (p as WindPoint).fromDeg === 'number',
  );
  if (winds.length === 0) throw new Error('No wind came back');
  return winds;
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
