/**
 * Prepares one replay week from the public OpenAQ archive and writes it to a folder, ready to
 * upload under `replay/` in the data bucket. No AWS account or key is needed to read the archive.
 *
 *   npx tsx packages/data/src/replayPrep.cli.ts \
 *     --week W1 --title "GRAP IV week" --start 2025-12-08T00:00:00Z --end 2025-12-15T00:00:00Z \
 *     --stations 123,456 --out replay-out [--events events.json]
 *
 * `events.json` is a list of { date, label, source }. We never invent event dates: leave it out
 * unless each date has a source you can cite.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { DEMO_PLACES, type ReplayManifest } from '@vayu/contracts';
import {
  REPLAY_INDEX_KEY,
  buildReplayWeek,
  hourlyFromRows,
  parseArchiveCsv,
  parseArchiveStation,
  replayFiles,
  type ReplayStationInput,
} from './replay';

const BASE = 'https://openaq-data-archive.s3.amazonaws.com';
const DAY_MS = 86_400_000;

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? undefined : process.argv[index + 1];
}
function need(name: string): string {
  const value = arg(name);
  if (value === undefined) throw new Error(`Missing --${name}`);
  return value;
}

/** Every month between two instants, as [year, month]. */
function months(fromMs: number, toMs: number): [number, number][] {
  const out: [number, number][] = [];
  const cursor = new Date(
    Date.UTC(new Date(fromMs).getUTCFullYear(), new Date(fromMs).getUTCMonth(), 1),
  );
  while (cursor.getTime() < toMs) {
    out.push([cursor.getUTCFullYear(), cursor.getUTCMonth() + 1]);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

async function listKeys(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const url = `${BASE}/?list-type=2&prefix=${prefix}${token === undefined ? '' : `&continuation-token=${encodeURIComponent(token)}`}`;
    const xml = await (await fetch(url)).text();
    keys.push(...[...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((match) => match[1] ?? ''));
    token = /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml)?.[1];
  } while (token !== undefined);
  return keys;
}

async function loadStation(
  id: string,
  fromMs: number,
  toMs: number,
): Promise<ReplayStationInput | undefined> {
  const texts: string[] = [];
  for (const [year, month] of months(fromMs, toMs)) {
    const keys = await listKeys(
      `records/csv.gz/locationid=${id}/year=${year}/month=${String(month).padStart(2, '0')}/`,
    );
    for (const key of keys) {
      const response = await fetch(`${BASE}/${key}`);
      if (response.ok) texts.push(gunzipSync(Buffer.from(await response.arrayBuffer())).toString());
    }
  }
  const meta = texts.map(parseArchiveStation).find((station) => station !== undefined);
  if (meta === undefined) return undefined;
  const rows = texts.flatMap((text) => parseArchiveCsv(text));
  return { station: { id, ...meta }, hours: hourlyFromRows(rows) };
}

const start = need('start');
const end = need('end');
const ids = need('stations').split(',');
const out = need('out');
const eventsFile = arg('events');

const loaded = (
  await Promise.all(
    ids.map((id) => loadStation(id, Date.parse(start) - 7 * DAY_MS, Date.parse(end))),
  )
).filter((station) => station !== undefined);
const week = buildReplayWeek({
  weekId: need('week'),
  title: need('title'),
  start,
  end,
  places: DEMO_PLACES,
  stations: loaded,
  events:
    eventsFile === undefined
      ? []
      : (JSON.parse(readFileSync(eventsFile, 'utf8')) as ReplayManifest['events']),
});

for (const [key, body] of replayFiles(week)) {
  const path = join(out, key);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
}
writeFileSync(join(out, REPLAY_INDEX_KEY), JSON.stringify([week.manifest]));
process.stdout.write(
  `Week ${week.manifest.weekId}: ${loaded.length} of ${ids.length} stations had data; ` +
    `places covered: ${[...week.series.keys()].join(', ') || 'none'}. ${week.manifest.note ?? ''}\n`,
);
