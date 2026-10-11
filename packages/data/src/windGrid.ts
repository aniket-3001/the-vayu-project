import type { WindPoint } from '@vayu/contracts';
import { z } from 'zod';

/** The part of the world the closer grid covers: south Asia and a margin around it, every three degrees. */
const CLOSE: { south: number; north: number; west: number; east: number; step: number } = {
  south: 4,
  north: 36,
  west: 62,
  east: 98,
  step: 3,
};
/** The rest of the world, every fifteen degrees: wind changes slowly across 1,700 km. */
const FAR_STEP = 15;
const CHUNK = 90;

/** The points the map's wind is asked for: the close grid, then the coarse one over the rest of the globe. */
export function windGridPoints(): readonly { readonly lat: number; readonly lng: number }[] {
  const points: { lat: number; lng: number }[] = [];
  for (let lat = CLOSE.south; lat <= CLOSE.north; lat += CLOSE.step)
    for (let lng = CLOSE.west; lng <= CLOSE.east; lng += CLOSE.step) points.push({ lat, lng });
  for (let lat = -75; lat <= 75; lat += FAR_STEP) {
    for (let lng = -180; lng < 180; lng += FAR_STEP) {
      const inside =
        lat >= CLOSE.south - 1 &&
        lat <= CLOSE.north + 1 &&
        lng >= CLOSE.west - 1 &&
        lng <= CLOSE.east + 1;
      if (!inside) points.push({ lat, lng });
    }
  }
  return points;
}

const Current = z.object({
  latitude: z.number(),
  longitude: z.number(),
  current: z
    .object({
      wind_speed_10m: z.number().nullable().optional(),
      wind_direction_10m: z.number().nullable().optional(),
    })
    .optional(),
});

export interface WindGridRepo {
  /** The wind across the grid now. Throws when the weather model cannot be reached or gives nothing. */
  grid(): Promise<readonly WindPoint[]>;
}

export interface OpenMeteoWindGridOptions {
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
  /** How long an answer is kept in memory before the model is asked again. */
  readonly keepMs?: number;
  readonly now?: () => number;
}

/**
 * The wind across the whole map from Open-Meteo (no key): the ICON and GFS weather models, which take in satellite
 * and balloon measurements. It asks for about six hundred points a hundred at a time, and keeps the answer for half
 * an hour, so a busy hour of visitors costs the model one round of requests and not one each. Readings the model
 * leaves out are left out; nothing is filled in.
 */
export function openMeteoWindGridRepo(options: OpenMeteoWindGridOptions = {}): WindGridRepo {
  const baseUrl = options.baseUrl ?? 'https://api.open-meteo.com/v1/forecast';
  const fetchImpl = options.fetchImpl ?? fetch;
  const keepMs = options.keepMs ?? 30 * 60_000;
  const now = options.now ?? Date.now;
  let kept: { readonly at: number; readonly points: readonly WindPoint[] } | undefined;
  return {
    async grid() {
      if (kept !== undefined && now() - kept.at < keepMs) return kept.points;
      const wanted = windGridPoints();
      const out: WindPoint[] = [];
      for (let i = 0; i < wanted.length; i += CHUNK) {
        const part = wanted.slice(i, i + CHUNK);
        const url =
          `${baseUrl}?latitude=${part.map((p) => String(p.lat)).join(',')}` +
          `&longitude=${part.map((p) => String(p.lng)).join(',')}` +
          '&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms';
        const res = await fetchImpl(url);
        if (!res.ok) throw new Error(`Open-Meteo answered ${String(res.status)}`);
        const body: unknown = await res.json();
        const rows = z.union([Current, z.array(Current)]).parse(body);
        const list = Array.isArray(rows) ? rows : [rows];
        list.forEach((row, k) => {
          const at = part[k];
          const speed = row.current?.wind_speed_10m;
          const fromDeg = row.current?.wind_direction_10m;
          if (at === undefined || typeof speed !== 'number' || typeof fromDeg !== 'number') return;
          out.push({ lat: at.lat, lng: at.lng, speed, fromDeg: ((fromDeg % 360) + 360) % 360 });
        });
      }
      if (out.length === 0) throw new Error('No wind came back');
      kept = { at: now(), points: out };
      return out;
    },
  };
}
