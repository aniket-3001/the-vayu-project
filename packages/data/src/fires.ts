import type { Point } from './station';

/**
 * Satellite fire detections (docs/research/satellite-fires.md). A detection is a hot pixel seen
 * by a satellite — it is NOT a pollution reading, so nothing here may be shown as PM2.5.
 */
export interface FireDetection {
  readonly lat: number;
  readonly lng: number;
  /** UTC instant of the satellite pass. */
  readonly detectedAt: string;
  readonly confidence: 'low' | 'nominal' | 'high';
  /** Fire radiative power in MW, when reported. */
  readonly frp: number | null;
}

export interface BoundingBox {
  readonly west: number;
  readonly south: number;
  readonly east: number;
  readonly north: number;
}

/** Rough Punjab + Haryana + Delhi box. Unverified against a map; includes some neighbours. */
export const NORTH_INDIA_BOX: BoundingBox = { west: 73.8, south: 27.6, east: 78.0, north: 32.6 };

export interface FireRepo {
  /** Detections inside `box` up to `asOf`, never after it (rule I1). */
  firesIn(box: BoundingBox, asOf: string): Promise<readonly FireDetection[]>;
}

const CONFIDENCE = { l: 'low', n: 'nominal', h: 'high' } as const;

/** Parse a FIRMS VIIRS CSV body. Rows that do not parse cleanly are skipped, not guessed at. */
export function parseFirmsCsv(csv: string): readonly FireDetection[] {
  const [header, ...rows] = csv.trim().split(/\r?\n/);
  if (header === undefined || header === '') return [];
  const cols = header.split(',');
  const at = (name: string): number => cols.indexOf(name);
  const iLat = at('latitude');
  const iLng = at('longitude');
  const iDate = at('acq_date');
  const iTime = at('acq_time');
  const iConf = at('confidence');
  const iFrp = at('frp');
  if ([iLat, iLng, iDate, iTime, iConf].some((i) => i < 0)) {
    throw new Error('FIRMS CSV is missing an expected column');
  }

  const out: FireDetection[] = [];
  for (const row of rows) {
    const f = row.split(',');
    const lat = Number(f[iLat]);
    const lng = Number(f[iLng]);
    const time = (f[iTime] ?? '').padStart(4, '0');
    const confidence = CONFIDENCE[(f[iConf] ?? '') as keyof typeof CONFIDENCE] as
      FireDetection['confidence'] | undefined;
    const detectedAt = new Date(`${f[iDate] ?? ''}T${time.slice(0, 2)}:${time.slice(2)}:00Z`);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Number.isNaN(detectedAt.getTime()))
      continue;
    if (confidence === undefined) continue;
    const frpRaw = iFrp >= 0 && f[iFrp] !== '' ? Number(f[iFrp]) : NaN;
    out.push({
      lat,
      lng,
      detectedAt: detectedAt.toISOString(),
      confidence,
      frp: Number.isFinite(frpRaw) ? frpRaw : null,
    });
  }
  return out;
}

export interface FireCounts {
  readonly last24h: number;
  readonly last72h: number;
}

/** Count nominal/high-confidence detections by age. Low confidence is excluded as likely noise. */
export function countFires(detections: readonly FireDetection[], asOf: string): FireCounts {
  const now = new Date(asOf).getTime();
  const ages = detections
    .filter((d) => d.confidence !== 'low')
    .map((d) => now - new Date(d.detectedAt).getTime())
    .filter((age) => age >= 0);
  const within = (hours: number): number => ages.filter((age) => age <= hours * 3_600_000).length;
  return { last24h: within(24), last72h: within(72) };
}

export function inBox(p: Point, box: BoundingBox): boolean {
  return p.lng >= box.west && p.lng <= box.east && p.lat >= box.south && p.lat <= box.north;
}

export interface FirmsClientOptions {
  readonly mapKey: string;
  readonly source?: string;
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
}

export function firmsFireRepo(options: FirmsClientOptions): FireRepo {
  const baseUrl = options.baseUrl ?? 'https://firms.modaps.eosdis.nasa.gov/api/area/csv';
  const source = options.source ?? 'VIIRS_NOAA20_NRT';
  const doFetch = options.fetchImpl ?? fetch;
  return {
    async firesIn(box, asOf) {
      const area = `${box.west},${box.south},${box.east},${box.north}`;
      const res = await doFetch(`${baseUrl}/${options.mapKey}/${source}/${area}/3`);
      if (!res.ok) throw new Error(`FIRMS request failed: ${res.status} ${res.statusText}`);
      const asOfMs = new Date(asOf).getTime();
      return parseFirmsCsv(await res.text()).filter(
        (d) => new Date(d.detectedAt).getTime() <= asOfMs && inBox({ lat: d.lat, lng: d.lng }, box),
      );
    },
  };
}

const FIXTURE_CSV = [
  'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight',
  '30.91,75.85,345.1,0.4,0.4,2026-10-05,0830,N20,VIIRS,n,2.0NRT,300.2,12.5,D',
  '30.40,75.20,360.0,0.4,0.4,2026-10-05,2035,N20,VIIRS,h,2.0NRT,310.0,25.1,N',
  '29.95,76.60,330.0,0.4,0.4,2026-10-03,0815,N20,VIIRS,n,2.0NRT,295.0,8.0,D',
  '30.10,75.50,320.0,0.4,0.4,2026-10-05,0830,N20,VIIRS,l,2.0NRT,290.0,2.0,D',
].join('\n');

/** Fixed detections for razor code and tests; runs with no key and no network. */
export function fixtureFireRepo(): FireRepo {
  const all = parseFirmsCsv(FIXTURE_CSV);
  return {
    firesIn: (box, asOf) =>
      Promise.resolve(
        all.filter(
          (d) =>
            new Date(d.detectedAt).getTime() <= new Date(asOf).getTime() &&
            inBox({ lat: d.lat, lng: d.lng }, box),
        ),
      ),
  };
}
