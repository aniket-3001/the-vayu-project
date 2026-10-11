import type { AirGridPoint } from '@vayu/contracts';
import { z } from 'zod';

const CLOSE: { south: number; north: number; west: number; east: number } = {
  south: 4,
  north: 36,
  west: 62,
  east: 98,
};
const CHUNK = 90;
/** Requests in flight at once: the whole grid inside the API's time limit, and gentle on the provider. */
const PARALLEL = 3;

/**
 * The points the map's air colour is asked for when no monitor reports: every three degrees over south Asia, where the
 * app is used, and every nine degrees over the rest of the globe (the colour reaches six degrees from a point).
 */
export function airGridPoints(): readonly { readonly lat: number; readonly lng: number }[] {
  const points: { lat: number; lng: number }[] = [];
  for (let lat = CLOSE.south; lat <= CLOSE.north; lat += 3)
    for (let lng = CLOSE.west; lng <= CLOSE.east; lng += 3) points.push({ lat, lng });
  for (let lat = -72; lat <= 72; lat += 9) {
    for (let lng = -180; lng < 180; lng += 9) {
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

const Row = z.object({
  current: z.object({ pm2_5: z.number().nullable().optional() }).optional(),
});

export interface AirGridRepo {
  /** The model's PM2.5 across the grid now. Throws when the model cannot be reached or gives nothing. */
  grid(): Promise<readonly AirGridPoint[]>;
}

export interface OpenMeteoAirGridOptions {
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
  readonly keepMs?: number;
  readonly now?: () => number;
}

/**
 * The regional air model's PM2.5 (Open-Meteo's CAMS feed, no key) across the globe, for colouring the map where no
 * monitor has a recent reading. It is a model, never a measurement, and is labelled so wherever it is shown. Asked in
 * hundred-point chunks a few at a time and kept half an hour. A point the model leaves out is left out.
 */
export function openMeteoAirGridRepo(options: OpenMeteoAirGridOptions = {}): AirGridRepo {
  const baseUrl = options.baseUrl ?? 'https://air-quality-api.open-meteo.com/v1/air-quality';
  const fetchImpl = options.fetchImpl ?? fetch;
  const keepMs = options.keepMs ?? 30 * 60_000;
  const now = options.now ?? Date.now;
  let kept: { readonly at: number; readonly points: readonly AirGridPoint[] } | undefined;
  return {
    async grid() {
      if (kept !== undefined && now() - kept.at < keepMs) return kept.points;
      const wanted = airGridPoints();
      const chunks: (typeof wanted)[number][][] = [];
      for (let i = 0; i < wanted.length; i += CHUNK) chunks.push(wanted.slice(i, i + CHUNK));
      const out: AirGridPoint[] = [];
      for (let g = 0; g < chunks.length; g += PARALLEL) {
        const group = chunks.slice(g, g + PARALLEL);
        const answers = await Promise.all(
          group.map(async (part) => {
            const url =
              `${baseUrl}?latitude=${part.map((p) => String(p.lat)).join(',')}` +
              `&longitude=${part.map((p) => String(p.lng)).join(',')}&current=pm2_5`;
            const res = await fetchImpl(url);
            if (!res.ok) throw new Error(`Open-Meteo answered ${String(res.status)}`);
            const body: unknown = await res.json();
            const rows = z.union([Row, z.array(Row)]).parse(body);
            return { part, rows: Array.isArray(rows) ? rows : [rows] };
          }),
        );
        for (const { part, rows } of answers) {
          rows.forEach((row, i) => {
            const at = part[i];
            const pm25 = row.current?.pm2_5;
            if (at !== undefined && typeof pm25 === 'number' && pm25 >= 0)
              out.push({ lat: at.lat, lng: at.lng, pm25 });
          });
        }
      }
      if (out.length === 0) throw new Error('No air came back');
      kept = { at: now(), points: out };
      return out;
    },
  };
}
