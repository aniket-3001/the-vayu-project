import type { AirGridPoint } from '@vayu/contracts';
import { z } from 'zod';
import { keepGrid } from './keepGrid';

const CLOSE: { south: number; north: number; west: number; east: number } = {
  south: 4,
  north: 36,
  west: 62,
  east: 98,
};
const CHUNK = 90;

/**
 * The points the map's air colour is asked for when no monitor reports: every three degrees over south Asia, where the
 * app is used (every four), and every twelve degrees over the rest of the globe, which the colour still joins up:
 * it reaches six degrees from each point.
 */
export function airGridPoints(): readonly { readonly lat: number; readonly lng: number }[] {
  const points: { lat: number; lng: number }[] = [];
  for (let lat = CLOSE.south; lat <= CLOSE.north; lat += 4)
    for (let lng = CLOSE.west; lng <= CLOSE.east; lng += 4) points.push({ lat, lng });
  for (let lat = -72; lat <= 72; lat += 12) {
    for (let lng = -180; lng < 180; lng += 12) {
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
 * hundred-point chunks, one at a time, and kept six hours (the model moves slowly, and Open-Meteo counts each point
 * as a call). A point the model leaves out is left out.
 */
export function openMeteoAirGridRepo(options: OpenMeteoAirGridOptions = {}): AirGridRepo {
  const baseUrl = options.baseUrl ?? 'https://air-quality-api.open-meteo.com/v1/air-quality';
  const fetchImpl = options.fetchImpl ?? fetch;
  const fetchAll = async (): Promise<readonly AirGridPoint[]> => {
    const wanted = airGridPoints();
    const out: AirGridPoint[] = [];
    for (let i = 0; i < wanted.length; i += CHUNK) {
      const part = wanted.slice(i, i + CHUNK);
      const url =
        `${baseUrl}?latitude=${part.map((p) => String(p.lat)).join(',')}` +
        `&longitude=${part.map((p) => String(p.lng)).join(',')}&current=pm2_5`;
      const res = await fetchImpl(url);
      if (!res.ok) throw new Error(`Open-Meteo answered ${String(res.status)}`);
      const body: unknown = await res.json();
      const parsed = z.union([Row, z.array(Row)]).parse(body);
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      rows.forEach((row, k) => {
        const at = part[k];
        const pm25 = row.current?.pm2_5;
        if (at !== undefined && typeof pm25 === 'number' && pm25 >= 0)
          out.push({ lat: at.lat, lng: at.lng, pm25 });
      });
    }
    if (out.length === 0) throw new Error('No air came back');
    return out;
  };
  return {
    grid: keepGrid(fetchAll, {
      keepMs: options.keepMs ?? 6 * 3_600_000,
      ...(options.now === undefined ? {} : { now: options.now }),
    }),
  };
}
