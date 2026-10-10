import { MapStation } from '@vayu/contracts';

/** The monitors with a recent PM2.5 reading, for the map. */
export interface MapStationRepo {
  /** Readings whose hour had ended by `asOf` and is no older than the repo's limit (rules I1 and I3). */
  latest(asOf: string): Promise<readonly MapStation[]>;
}

export interface OpenAqMapOptions {
  readonly apiKey: string;
  readonly baseUrl?: string;
  /** A reading older than this is left off (rule I3). */
  readonly maxAgeHours?: number;
  /** Most pages of a thousand readings to ask for in one run. OpenAQ allows 60 requests a minute. */
  readonly maxPages?: number;
  /** Pause between requests, so one run stays under the provider's limit. */
  readonly delayMs?: number;
  /** The most time a run may take; when it is spent, the pages read so far are kept. */
  readonly budgetMs?: number;
  /** The time, in milliseconds. A parameter so a test can move it. */
  readonly now?: () => number;
  readonly fetchImpl?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
}

interface OpenAqLatest {
  readonly datetime: { readonly utc: string };
  readonly value: number | null;
  readonly coordinates: { readonly latitude: number; readonly longitude: number } | null;
  readonly locationsId: number;
}

const HOUR_MS = 3_600_000;
const MAX_RATE_LIMIT_WAITS = 3;
const PAGE = 1000;
/** The upper end of what a PM2.5 sensor can honestly report: beyond it a reading is a fault, not air. */
const MAX_PLAUSIBLE_PM25 = 1000;

/**
 * Every monitor in the world with a PM2.5 reading in the last few hours, from OpenAQ's one list of the latest
 * value of a parameter (a page of a thousand a request, about ten pages), not one request a monitor. It is run on a
 * schedule by the snapshot job, never by a visitor. A monitor with several sensors counts once, by its newest.
 */
export function openAqMapStationRepo(options: OpenAqMapOptions): MapStationRepo {
  const baseUrl = options.baseUrl ?? 'https://api.openaq.org/v3';
  const maxAgeMs = (options.maxAgeHours ?? 6) * HOUR_MS;
  const maxPages = options.maxPages ?? 25;
  const spacing = options.delayMs ?? 1100;
  const doFetch = options.fetchImpl ?? fetch;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const clock = options.now ?? Date.now;
  const startedAt = clock();
  // Told to slow down, a run waits as long as OpenAQ says (at most 20 seconds) and asks again, a few times at most.
  let waits = 0;
  const get = async <T>(path: string): Promise<T> => {
    const res = await doFetch(`${baseUrl}${path}`, { headers: { 'X-API-Key': options.apiKey } });
    if (res.status === 429 && waits < MAX_RATE_LIMIT_WAITS) {
      const asked = Number(res.headers.get('retry-after'));
      const waitMs = Math.min(Number.isFinite(asked) && asked > 0 ? asked : 5, 20) * 1000;
      const spent = clock() - startedAt;
      if (options.budgetMs === undefined || spent + waitMs <= options.budgetMs + 10_000) {
        waits += 1;
        await sleep(waitMs);
        return get<T>(path);
      }
    }
    if (!res.ok) throw new Error(`OpenAQ request failed: ${String(res.status)}`);
    return (await res.json()) as T;
  };

  return {
    async latest(asOf) {
      const asOfMs = Date.parse(asOf);
      const since = new Date(asOfMs - maxAgeMs).toISOString().replace(/\.\d+Z$/u, 'Z');
      const newest = new Map<number, OpenAqLatest>();
      for (let page = 1; page <= maxPages; page++) {
        if (page > 1) {
          if (options.budgetMs !== undefined && clock() - startedAt >= options.budgetMs) break;
          await sleep(spacing);
        }
        const body = await get<{ results: readonly OpenAqLatest[] }>(
          `/parameters/2/latest?limit=${String(PAGE)}&page=${String(page)}&datetime_min=${since}`,
        );
        for (const item of body.results) {
          const at = Date.parse(item.datetime.utc);
          const { value, coordinates } = item;
          if (value === null || coordinates === null || !Number.isFinite(at)) continue;
          // A value from the future, an old one, or one no sensor could give is a fault, so it is left off.
          if (at > asOfMs || asOfMs - at > maxAgeMs) continue;
          if (!(value >= 0 && value <= MAX_PLAUSIBLE_PM25)) continue;
          const had = newest.get(item.locationsId);
          if (had === undefined || Date.parse(had.datetime.utc) < at)
            newest.set(item.locationsId, item);
        }
        if (body.results.length < PAGE) break;
      }
      const out: MapStation[] = [];
      for (const [id, item] of newest) {
        const { value, coordinates } = item;
        if (value === null || coordinates === null) continue;
        out.push(
          MapStation.parse({
            id: String(id),
            name: '',
            lat: Math.round(coordinates.latitude * 1000) / 1000,
            lng: Math.round(coordinates.longitude * 1000) / 1000,
            pm25: Math.round(value * 10) / 10,
            at: new Date(Date.parse(item.datetime.utc)).toISOString(),
          }),
        );
      }
      return out;
    },
  };
}
