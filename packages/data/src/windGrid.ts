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

/** The grid for MET Norway, which answers one point at a time: a coarser one, about two hundred requests in all. */
export function metNoWindPoints(): readonly { readonly lat: number; readonly lng: number }[] {
  const points: { lat: number; lng: number }[] = [];
  for (let lat = CLOSE.south; lat <= CLOSE.north; lat += 4)
    for (let lng = CLOSE.west; lng <= CLOSE.east; lng += 4) points.push({ lat, lng });
  for (let lat = -60; lat <= 60; lat += 20) {
    for (let lng = -180; lng < 180; lng += 20) {
      const inside =
        lat >= CLOSE.south - 2 &&
        lat <= CLOSE.north + 2 &&
        lng >= CLOSE.west - 2 &&
        lng <= CLOSE.east + 2;
      if (!inside) points.push({ lat, lng });
    }
  }
  return points;
}

const MetNo = z.object({
  properties: z.object({
    timeseries: z
      .array(
        z.object({
          data: z.object({
            instant: z.object({
              details: z.object({
                wind_speed: z.number().optional(),
                wind_from_direction: z.number().optional(),
              }),
            }),
          }),
        }),
      )
      .min(1),
  }),
});

export interface MetNoWindGridOptions {
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
  /** MET Norway asks every app to say who it is. */
  readonly userAgent?: string;
  readonly keepMs?: number;
  readonly now?: () => number;
  /** How many points are asked for at once. */
  readonly concurrency?: number;
}

/**
 * The wind from MET Norway's Locationforecast (no key; free for non-commercial use with a named app, 20 requests a
 * second at most; built on ECMWF and its own model). It is the second source, for when Open-Meteo is out of
 * allowance: a coarser grid, a point at a time, a few at once, kept half an hour. Points that fail are left out, and
 * with fewer than half the grid there is no answer at all rather than a patchy wind.
 */
export function metNoWindGridRepo(options: MetNoWindGridOptions = {}): WindGridRepo {
  const baseUrl = options.baseUrl ?? 'https://api.met.no/weatherapi/locationforecast/2.0/compact';
  const fetchImpl = options.fetchImpl ?? fetch;
  const userAgent =
    options.userAgent ?? 'VayuAir/0.1 github.com/vayu-air (air quality app, prototype)';
  const keepMs = options.keepMs ?? 30 * 60_000;
  const now = options.now ?? Date.now;
  const concurrency = Math.max(1, options.concurrency ?? 8);
  let kept: { readonly at: number; readonly points: readonly WindPoint[] } | undefined;
  return {
    async grid() {
      if (kept !== undefined && now() - kept.at < keepMs) return kept.points;
      const wanted = metNoWindPoints();
      const out: (WindPoint | undefined)[] = new Array<WindPoint | undefined>(wanted.length);
      let next = 0;
      const worker = async (): Promise<void> => {
        for (;;) {
          const i = next;
          next += 1;
          const at = wanted[i];
          if (at === undefined) return;
          try {
            const res = await fetchImpl(`${baseUrl}?lat=${String(at.lat)}&lon=${String(at.lng)}`, {
              headers: { 'user-agent': userAgent },
            });
            if (!res.ok) continue;
            const body = MetNo.safeParse(await res.json());
            const details = body.success
              ? body.data.properties.timeseries[0]?.data.instant.details
              : undefined;
            const speed = details?.wind_speed;
            const fromDeg = details?.wind_from_direction;
            if (typeof speed === 'number' && typeof fromDeg === 'number')
              out[i] = { lat: at.lat, lng: at.lng, speed, fromDeg: ((fromDeg % 360) + 360) % 360 };
          } catch {
            // This point is left out.
          }
        }
      };
      await Promise.all(Array.from({ length: concurrency }, worker));
      const points = out.filter((p): p is WindPoint => p !== undefined);
      if (points.length < wanted.length / 2) throw new Error('MET Norway gave too little wind');
      kept = { at: now(), points };
      return points;
    },
  };
}

/** Asks the first source, and the second only when the first fails: so the wind is real whichever one is out of allowance. */
export function windGridWithFallback(primary: WindGridRepo, fallback: WindGridRepo): WindGridRepo {
  return {
    async grid() {
      try {
        return await primary.grid();
      } catch {
        return fallback.grid();
      }
    },
  };
}
