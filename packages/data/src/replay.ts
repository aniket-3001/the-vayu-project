import { RawHour, ReplayManifest, ReplayPlaceSeries, type Place } from '@vayu/contracts';
import { haversineKm } from './station';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** History kept before the replay start, so the first day still has a week behind it. */
const LOOKBACK_DAYS = 7;

/** Splits one CSV line, honouring double quotes (the archive quotes every field, and names can hold commas). */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) {
      cells.push(cell);
      cell = '';
    } else cell += char;
  }
  cells.push(cell);
  return cells;
}

/**
 * Readings above these are instrument faults, not air: the real archive holds values like 10,000
 * µg/m³ for PM2.5 at a station whose neighbours read about 400. They are dropped (an unknown hour),
 * never clipped to the limit, so a fault cannot pass as a very bad day.
 */
export const MAX_PLAUSIBLE = { pm25: 1000, pm10: 2000 } as const;

/** One valid measurement from an OpenAQ archive file. */
export interface ArchiveRow {
  readonly at: string;
  readonly parameter: 'pm25' | 'pm10';
  readonly value: number;
}

/**
 * Reads an OpenAQ archive file (`location_id,sensors_id,location,datetime,lat,lon,parameter,units,value`).
 * Rows that are not PM2.5 or PM10, or whose value is negative (the archive uses -999 and the like for
 * "no value"), are dropped. A file without the columns we need is refused rather than guessed at.
 */
export function parseArchiveCsv(text: string): ArchiveRow[] {
  const [header, ...lines] = text.split('\n');
  const columns = splitCsvLine((header ?? '').trim());
  const at = columns.indexOf('datetime');
  const parameter = columns.indexOf('parameter');
  const value = columns.indexOf('value');
  if (at < 0 || parameter < 0 || value < 0) {
    throw new Error('Archive file is missing the datetime, parameter or value column');
  }
  const rows: ArchiveRow[] = [];
  for (const line of lines) {
    if (line.trim() === '') continue;
    const cells = splitCsvLine(line);
    const name = cells[parameter];
    const measured = Number(cells[value]);
    const when = Date.parse(cells[at] ?? '');
    if (
      (name !== 'pm25' && name !== 'pm10') ||
      !Number.isFinite(measured) ||
      measured < 0 ||
      measured > MAX_PLAUSIBLE[name] ||
      Number.isNaN(when)
    ) {
      continue;
    }
    rows.push({ at: new Date(when).toISOString(), parameter: name, value: measured });
  }
  return rows;
}

/** The station's name and position, read from the first data row of an archive file. */
export function parseArchiveStation(
  text: string,
): { name: string; lat: number; lng: number } | undefined {
  const [header, first] = text.split('\n');
  const columns = splitCsvLine((header ?? '').trim());
  const cells = splitCsvLine(first ?? '');
  const name = cells[columns.indexOf('location')];
  const lat = Number(cells[columns.indexOf('lat')]);
  const lng = Number(cells[columns.indexOf('lon')]);
  return name === undefined || !Number.isFinite(lat) || !Number.isFinite(lng)
    ? undefined
    : { name, lat, lng };
}

/**
 * Hourly means in UTC. `end` (the default) reads a time as the END of the hour it covers, so a
 * value is never placed in an hour that had not finished: if the archive in fact stamps the start
 * of the hour, replay is an hour late, which is safe. [V] settle this against the OpenAQ API for
 * one sensor before quoting hour-level figures.
 */
export function hourlyFromRows(
  rows: readonly ArchiveRow[],
  stamp: 'start' | 'end' = 'end',
): RawHour[] {
  const buckets = new Map<number, { pm25: number[]; pm10: number[] }>();
  for (const row of rows) {
    const ms = Date.parse(row.at);
    const hourStart = Math.floor((stamp === 'end' ? ms - 1 : ms) / HOUR_MS) * HOUR_MS;
    const bucket = buckets.get(hourStart) ?? { pm25: [], pm10: [] };
    bucket[row.parameter].push(row.value);
    buckets.set(hourStart, bucket);
  }
  const mean = (values: readonly number[]): number | null =>
    values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;
  return [...buckets]
    .sort(([a], [b]) => a - b)
    .map(([hourStart, bucket]) =>
      RawHour.parse({
        hourStart: new Date(hourStart).toISOString(),
        pm25: mean(bucket.pm25),
        pm10: mean(bucket.pm10),
      }),
    );
}

export interface ReplayStationInput {
  readonly station: {
    readonly id: string;
    readonly name: string;
    readonly lat: number;
    readonly lng: number;
  };
  readonly hours: readonly RawHour[];
}

export interface BuildReplayInput {
  readonly weekId: string;
  readonly title: string;
  /** The replay window, ISO. The viewer's clock runs from `start` to `end`. */
  readonly start: string;
  readonly end: string;
  readonly places: readonly Place[];
  readonly stations: readonly ReplayStationInput[];
  /** Dated events with the source of each date (for example a GRAP order). Never invented here. */
  readonly events: ReplayManifest['events'];
  /** A station needs at least this many PM2.5 hours in the window to be used. */
  readonly minValidHours?: number;
  /** The farthest a station may be from a place. */
  readonly maxKm?: number;
}

export interface ReplayWeek {
  readonly manifest: ReplayManifest;
  readonly series: ReadonlyMap<string, ReplayPlaceSeries>;
}

/** Prepares one replay week: for each place, the nearest station that has enough data, hours cut to the window. */
export function buildReplayWeek(input: BuildReplayInput): ReplayWeek {
  const minValid = input.minValidHours ?? 100;
  const maxKm = input.maxKm ?? 25;
  const from = Date.parse(input.start) - LOOKBACK_DAYS * DAY_MS;
  const to = Date.parse(input.end);

  const inWindow = (hours: readonly RawHour[]): RawHour[] =>
    hours.filter((hour) => Date.parse(hour.hourStart) >= from && Date.parse(hour.hourStart) < to);
  const usable = input.stations
    .map((entry) => ({ ...entry, hours: inWindow(entry.hours) }))
    .filter((entry) => entry.hours.filter((hour) => hour.pm25 !== null).length >= minValid);

  const series = new Map<string, ReplayPlaceSeries>();
  const missing: string[] = [];
  for (const place of input.places) {
    const nearest = usable
      .map((entry) => ({ entry, distanceKm: haversineKm(place, entry.station) }))
      .filter((candidate) => candidate.distanceKm <= maxKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)[0];
    if (nearest === undefined) {
      missing.push(place.id);
      continue;
    }
    series.set(
      place.id,
      ReplayPlaceSeries.parse({
        schemaVersion: 1,
        weekId: input.weekId,
        placeId: place.id,
        station: { ...nearest.entry.station, distanceKm: nearest.distanceKm },
        hours: nearest.entry.hours,
      }),
    );
  }

  const used = [...new Set([...series.values()].map((entry) => entry.station.id))];
  const manifest = ReplayManifest.parse({
    schemaVersion: 1,
    weekId: input.weekId,
    title: input.title,
    start: input.start,
    end: input.end,
    stationIds: used,
    events: input.events,
    ...(missing.length === 0
      ? {}
      : { note: `No station with enough data within ${maxKm} km for: ${missing.join(', ')}.` }),
  });
  return { manifest, series };
}

/** Where prepared replay weeks are read from. In AWS this is S3; in tests it is memory. */
export interface ReplayRepo {
  weeks(): Promise<readonly ReplayManifest[]>;
  manifest(weekId: string): Promise<ReplayManifest | undefined>;
  series(weekId: string, placeId: string): Promise<ReplayPlaceSeries | undefined>;
}

export function memoryReplayRepo(weeks: readonly ReplayWeek[]): ReplayRepo {
  const byId = new Map(weeks.map((week) => [week.manifest.weekId, week]));
  return {
    weeks: () => Promise.resolve(weeks.map((week) => week.manifest)),
    manifest: (weekId) => Promise.resolve(byId.get(weekId)?.manifest),
    series: (weekId, placeId) => Promise.resolve(byId.get(weekId)?.series.get(placeId)),
  };
}

/** Where a replay week lives in the data bucket: `replay/<weekId>/manifest.json` and `<placeId>.json`. */
export const replayKey = (weekId: string, file: string): string => `replay/${weekId}/${file}.json`;
export const REPLAY_INDEX_KEY = 'replay/index.json';

/** The files to upload for a prepared week, as key to JSON text. */
export function replayFiles(week: ReplayWeek): Map<string, string> {
  const files = new Map<string, string>();
  files.set(replayKey(week.manifest.weekId, 'manifest'), JSON.stringify(week.manifest));
  for (const [placeId, series] of week.series) {
    files.set(replayKey(week.manifest.weekId, placeId), JSON.stringify(series));
  }
  return files;
}
