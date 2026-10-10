import { MapStation } from '@vayu/contracts';
import type { BoundingBox } from './fires';

/** The monitors with a recent PM2.5 reading, for the map. */
export interface MapStationRepo {
  /** Readings whose hour had ended by `asOf` and is no older than the repo's limit (rules I1 and I3). */
  latest(asOf: string): Promise<readonly MapStation[]>;
}

/** Delhi, Haryana, Punjab and west Uttar Pradesh: where we have monitors worth drawing. */
export const MAP_BOX: BoundingBox = { west: 73, south: 26, east: 80, north: 32 };

export interface OpenAqMapOptions {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly box?: BoundingBox;
  /** A monitor whose newest reading is older than this is left off (rule I3). */
  readonly maxAgeHours?: number;
  /** Most monitors to ask about in one run. OpenAQ allows 60 requests a minute and 2,000 an hour. */
  readonly maxStations?: number;
  /** Pause between requests, so one run stays under the provider's limit. */
  readonly delayMs?: number;
  /**
   * The most time a run may take. Once it is spent no more monitors are asked about, and the ones already read are
   * kept, so a run always ends inside its limit with what it has (the newest-reporting monitors are asked first).
   */
  readonly budgetMs?: number;
  /** The time, in milliseconds. A parameter so a test can move it. */
  readonly now?: () => number;
  readonly fetchImpl?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
}

interface OpenAqSensor {
  readonly id: number;
  readonly parameter: { readonly name: string };
}
interface OpenAqLocation {
  readonly id: number;
  readonly name: string;
  readonly coordinates: { readonly latitude: number; readonly longitude: number };
  readonly sensors: readonly OpenAqSensor[];
  readonly datetimeLast?: { readonly utc: string } | null;
}
interface OpenAqLatest {
  readonly datetime: { readonly utc: string };
  readonly value: number | null;
  readonly sensorsId: number;
}

const isPm25 = (name: string): boolean =>
  name.toLowerCase().replaceAll(/[^a-z0-9]/g, '') === 'pm25';
const HOUR_MS = 3_600_000;
const MAX_RATE_LIMIT_WAITS = 3;
/** The upper end of what a PM2.5 sensor can honestly report: beyond it a reading is a fault, not air. */
const MAX_PLAUSIBLE_PM25 = 1000;

/**
 * Latest PM2.5 at the monitors in a box. OpenAQ has no one call for "latest values in a box", so this lists the
 * locations, keeps those that reported lately, and asks each for its latest value, a request a second. It is run
 * on a schedule by the harvest, never by a visitor.
 */
export function openAqMapStationRepo(options: OpenAqMapOptions): MapStationRepo {
  const baseUrl = options.baseUrl ?? 'https://api.openaq.org/v3';
  const box = options.box ?? MAP_BOX;
  const maxAgeMs = (options.maxAgeHours ?? 6) * HOUR_MS;
  const doFetch = options.fetchImpl ?? fetch;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const clock = options.now ?? Date.now;
  const startedAt = clock();
  // Told to slow down, a run waits as long as OpenAQ says (at most 20 seconds) and asks again, but only a few
  // times in all, so a provider that keeps refusing cannot hold the run past its time limit.
  let waits = 0;
  const get = async <T>(path: string): Promise<T> => {
    const res = await doFetch(`${baseUrl}${path}`, { headers: { 'X-API-Key': options.apiKey } });
    if (res.status === 429 && waits < MAX_RATE_LIMIT_WAITS) {
      const asked = Number(res.headers.get('retry-after'));
      const waitMs = Math.min(Number.isFinite(asked) && asked > 0 ? asked : 5, 20) * 1000;
      // A wait that would carry the run past its time (and a little over) is not taken: the run ends with what it has.
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
      const listed = await get<{ results: readonly OpenAqLocation[] }>(
        `/locations?bbox=${String(box.west)},${String(box.south)},${String(box.east)},${String(box.north)}&parameters_id=2&limit=1000`,
      );
      const candidates = listed.results
        .flatMap((location) => {
          const sensor = location.sensors.find((s) => isPm25(s.parameter.name));
          const last = location.datetimeLast?.utc;
          if (sensor === undefined || last === undefined) return [];
          const age = asOfMs - Date.parse(last);
          return age >= 0 && age <= maxAgeMs ? [{ location, sensor, last }] : [];
        })
        .sort((a, b) => Date.parse(b.last) - Date.parse(a.last))
        .slice(0, options.maxStations ?? 100);

      const out: MapStation[] = [];
      // Requests start a fixed time apart, whatever each answer took: one a second at most keeps under the limit.
      const spacing = options.delayMs ?? 1100;
      let lastStart = 0;
      for (const [index, { location, sensor }] of candidates.entries()) {
        if (options.budgetMs !== undefined && clock() - startedAt >= options.budgetMs) break;
        if (index > 0) await sleep(Math.max(0, lastStart + spacing - clock()));
        lastStart = clock();
        try {
          const latest = await get<{ results: readonly OpenAqLatest[] }>(
            `/locations/${String(location.id)}/latest`,
          );
          const reading = latest.results.find((item) => item.sensorsId === sensor.id);
          if (reading?.value === null || reading === undefined) continue;
          const at = Date.parse(reading.datetime.utc);
          // A value from the future, an old one, or one no sensor could give is a fault, so it is left off.
          if (!Number.isFinite(at) || at > asOfMs || asOfMs - at > maxAgeMs) continue;
          if (!(reading.value >= 0 && reading.value <= MAX_PLAUSIBLE_PM25)) continue;
          out.push(
            MapStation.parse({
              id: `openaq-location-${String(location.id)}`,
              name: location.name,
              lat: location.coordinates.latitude,
              lng: location.coordinates.longitude,
              pm25: reading.value,
              at: new Date(at).toISOString(),
            }),
          );
        } catch {
          // One monitor failing must not hide the rest.
        }
      }
      return out;
    },
  };
}
