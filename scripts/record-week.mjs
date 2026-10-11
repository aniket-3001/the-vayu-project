// Records the real days of the "recorded week" demo: what four Delhi monitors measured (OpenAQ's public archive),
// the weather (Open-Meteo's archive), the regional model's gases (Open-Meteo), and the satellite fire detections (NASA
// FIRMS). Nothing is made up and nothing is smoothed: a missing hour stays missing.
//
//   FIRMS_MAP_KEY=... node scripts/record-week.mjs [out.json]
//
// The days, and why each was chosen, are in DAYS below. Re-run it to refresh the file; it needs network access, and
// the OpenAQ archive files are cached in the temporary folder.
import { gunzipSync } from 'node:zlib';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = process.argv[2] ?? 'apps/web/src/week/recorded.json';
const ARCHIVE = 'https://openaq-data-archive.s3.amazonaws.com';
/** Four Delhi monitors that reported through the winter of 2025 to 2026 (the ones of replay week W1). */
const STATIONS = [5622, 17, 6358, 11607];
/** Where the weather and the model's gases are taken: central Delhi. */
const POINT = { lat: 28.6, lng: 77.2 };
/** Where fires are counted: the north-west box the live app uses, and the hour the demo day is "now" (India time). */
const FIRE_BOX = '73.5,28,78,32.5';
const AS_OF_HOUR = 8;

const DAYS = [
  { date: '2025-10-06', title: 'A rainy day', tags: ['Rain'] },
  { date: '2025-10-07', title: 'The clean day after the rain', tags: ['Cleanest air'] },
  { date: '2025-10-21', title: 'The day after Diwali', tags: ['Fireworks smog'] },
  { date: '2025-10-31', title: 'Stubble-burning peak', tags: ['Stubble fires'] },
  { date: '2025-11-12', title: 'Smog settles in', tags: ['Smog'] },
  { date: '2025-12-22', title: 'GRAP IV, by our estimate', tags: ['Smog'] },
  { date: '2026-03-30', title: 'A windy day', tags: ['Wind'] },
];
/** Days before the demo day kept for the history, and days after it kept as "what came next". */
const BEFORE = 8;
const AFTER = 4;

const istDate = (ms) => new Date(ms + 5.5 * 3600e3).toISOString().slice(0, 10);
const addDays = (date, n) => istDate(Date.parse(`${date}T12:00:00+05:30`) + n * 86400e3);
const startMs = (date) => Date.parse(`${date}T00:00:00+05:30`);

function split(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) {
      cells.push(cell);
      cell = '';
    } else cell += ch;
  }
  cells.push(cell);
  return cells;
}

async function listKeys(prefix) {
  const keys = [];
  let token;
  do {
    const url = `${ARCHIVE}/?list-type=2&prefix=${prefix}${token ? `&continuation-token=${encodeURIComponent(token)}` : ''}`;
    const xml = await (await fetch(url)).text();
    keys.push(...[...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]));
    token = /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml)?.[1];
  } while (token);
  return keys;
}

const cache = join(tmpdir(), 'vayu-record-week');
mkdirSync(cache, { recursive: true });

/** The archive file for one station and one India day, as hourly PM2.5 and PM10 (null where not measured). */
const stationRows = new Map();
async function loadStation(id, months) {
  const rows = [];
  let info;
  for (const [y, m] of months) {
    for (const key of await listKeys(`records/csv.gz/locationid=${id}/year=${y}/month=${m}/`)) {
      const file = join(cache, key.replace(/\//g, '_'));
      const buf = existsSync(file)
        ? readFileSync(file)
        : Buffer.from(await (await fetch(`${ARCHIVE}/${key}`)).arrayBuffer());
      if (!existsSync(file)) writeFileSync(file, buf);
      const [header, ...lines] = gunzipSync(buf).toString('utf8').split('\n');
      const cols = split(header.trim());
      const at = cols.indexOf('datetime');
      const par = cols.indexOf('parameter');
      const val = cols.indexOf('value');
      for (const line of lines) {
        if (!line) continue;
        const c = split(line);
        const p = c[par];
        if (p !== 'pm25' && p !== 'pm10') continue;
        const v = Number(c[val]);
        // A value above these is an instrument fault, not air (999 is the feed's own "out of range"): it is dropped,
        // never clipped.
        if (!(v >= 0 && v < (p === 'pm25' ? 999 : 2000))) continue;
        rows.push([Date.parse(c[at]), p, v]);
        info ??= {
          id: String(id),
          name: c[cols.indexOf('location')],
          lat: Number(c[cols.indexOf('lat')]),
          lng: Number(c[cols.indexOf('lon')]),
        };
      }
    }
  }
  stationRows.set(id, rows);
  return info;
}

const monthsOf = (from, to) => {
  const out = [];
  const cur = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
  const end = new Date(`${to.slice(0, 7)}-01T00:00:00Z`);
  while (cur <= end) {
    out.push([String(cur.getUTCFullYear()), String(cur.getUTCMonth() + 1).padStart(2, '0')]);
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
};

const dates = DAYS.map((d) => d.date).sort();
const first = addDays(dates[0], -BEFORE);
const last = addDays(dates[dates.length - 1], AFTER);
const stations = [];
for (const id of STATIONS) {
  const info = await loadStation(id, monthsOf(first, last));
  if (info) stations.push(info);
}

/** Hourly means for one station between two instants: [{ pm25, pm10 }] for each hour from `from`. */
function hourly(id, from, hours) {
  const rows = stationRows.get(id) ?? [];
  const sums = Array.from({ length: hours }, () => ({ a: 0, an: 0, b: 0, bn: 0 }));
  for (const [t, p, v] of rows) {
    const k = Math.floor((t - from) / 3600e3);
    if (k < 0 || k >= hours) continue;
    // The archive stamps a reading with the hour it ended or started; the day's own hours are what matter here.
    if (p === 'pm25') {
      sums[k].a += v;
      sums[k].an += 1;
    } else {
      sums[k].b += v;
      sums[k].bn += 1;
    }
  }
  const r1 = (x) => Math.round(x * 10) / 10;
  const pm25 = sums.map((s) => (s.an > 0 ? r1(s.a / s.an) : null));
  // PM10 includes PM2.5, so a PM10 below the same hour's PM2.5 is two instruments disagreeing: the PM10 is dropped.
  const pm10 = sums.map((s, i) => {
    const v = s.bn > 0 ? r1(s.b / s.bn) : null;
    return v !== null && pm25[i] !== null && v < pm25[i] ? null : v;
  });
  return { pm25, pm10 };
}

/**
 * A cross-check between monitors, the one change made to the readings: an hour in which one monitor reads over three
 * times the median of the others (at least two others reporting) and is itself high (PM2.5 over 200, PM10 over 500)
 * is a spike of that instrument, not of the city, and is dropped. How many were dropped is written into the file.
 */
let dropped = 0;
function dropLoneSpikes(air) {
  const ids = Object.keys(air);
  for (const key of ['pm25', 'pm10']) {
    const floor = key === 'pm25' ? 200 : 500;
    const n = air[ids[0]][key].length;
    for (let i = 0; i < n; i++) {
      const values = ids.map((id) => air[id][key][i]);
      ids.forEach((id, k) => {
        const v = values[k];
        if (v === null || v <= floor) return;
        const others = values.filter((x, j) => j !== k && x !== null).sort((a, b) => a - b);
        if (others.length < 2) return;
        const median = others[Math.floor(others.length / 2)];
        if (v > 3 * median) {
          air[id][key][i] = null;
          dropped += 1;
        }
      });
    }
  }
}

const json = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.json();
};

const firmsKey = process.env.FIRMS_MAP_KEY;
if (!firmsKey) console.warn('FIRMS_MAP_KEY is not set: the fires will be left out.');

const days = [];
for (const day of DAYS) {
  const from = addDays(day.date, -BEFORE);
  const to = addDays(day.date, AFTER);
  const hours = (Date.parse(`${to}T23:00:00+05:30`) - startMs(from)) / 3600e3 + 1;
  const air = Object.fromEntries(
    stations.map((s) => [s.id, hourly(Number(s.id), startMs(from), hours)]),
  );
  dropLoneSpikes(air);
  const wx = await json(
    `https://archive-api.open-meteo.com/v1/archive?latitude=${POINT.lat}&longitude=${POINT.lng}` +
      `&start_date=${from}&end_date=${to}&timezone=Asia%2FKolkata` +
      '&hourly=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,is_day' +
      '&daily=sunrise,sunset',
  );
  const gas = await json(
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${POINT.lat}&longitude=${POINT.lng}` +
      `&start_date=${from}&end_date=${to}&timezone=Asia%2FKolkata` +
      '&hourly=ozone,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide',
  );
  const asOfMs = startMs(day.date) + (day.asOfHour ?? AS_OF_HOUR) * 3600e3;
  const fires = [];
  if (firmsKey) {
    // Detections in the 24 hours before the demo moment: yesterday's and today's dates cover them.
    for (const date of [addDays(day.date, -1), day.date]) {
      const csv = await (
        await fetch(
          `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${firmsKey}/VIIRS_SNPP_SP/${FIRE_BOX}/1/${date}`,
        )
      ).text();
      const [head, ...lines] = csv.trim().split('\n');
      const cols = head.split(',');
      for (const line of lines) {
        const c = line.split(',');
        const t = c[cols.indexOf('acq_time')].padStart(4, '0');
        const at = Date.parse(`${c[cols.indexOf('acq_date')]}T${t.slice(0, 2)}:${t.slice(2)}:00Z`);
        const ago = (asOfMs - at) / 3600e3;
        if (ago < 0 || ago > 24) continue;
        fires.push({
          lat: Math.round(Number(c[cols.indexOf('latitude')]) * 1000) / 1000,
          lng: Math.round(Number(c[cols.indexOf('longitude')]) * 1000) / 1000,
          hoursAgo: Math.round(ago * 10) / 10,
          frp: Math.round(Number(c[cols.indexOf('frp')]) * 10) / 10,
        });
      }
    }
  }
  days.push({
    date: day.date,
    title: day.title,
    tags: day.tags,
    asOf: new Date(asOfMs).toISOString(),
    /** The first hour of every series below, India midnight of this date. */
    seriesFrom: from,
    hours,
    air,
    weather: {
      temperatureC: wx.hourly.temperature_2m,
      humidityPct: wx.hourly.relative_humidity_2m,
      precipitationMm: wx.hourly.precipitation,
      code: wx.hourly.weather_code,
      windKmh: wx.hourly.wind_speed_10m,
      windFromDeg: wx.hourly.wind_direction_10m,
      isDay: wx.hourly.is_day,
      sunrise: wx.daily.sunrise,
      sunset: wx.daily.sunset,
    },
    gases: {
      o3: gas.hourly.ozone,
      no2: gas.hourly.nitrogen_dioxide,
      so2: gas.hourly.sulphur_dioxide,
      co: gas.hourly.carbon_monoxide,
    },
    fires,
  });
  console.log(day.date, 'fires', fires.length);
}

writeFileSync(
  OUT,
  JSON.stringify({
    version: 1,
    recordedAt: new Date().toISOString(),
    sources: {
      air: `OpenAQ public archive: four CPCB, DPCC and IITM monitors in Delhi. ${dropped} lone-monitor spikes dropped (see dropLoneSpikes)`,
      weather: 'Open-Meteo archive (ERA5 reanalysis), central Delhi',
      gases: 'Open-Meteo air quality (CAMS regional model), central Delhi',
      fires: 'NASA FIRMS, VIIRS S-NPP, north-west India box',
    },
    stations,
    days,
  }),
);
console.log('wrote', OUT, `${(readFileSync(OUT).length / 1024).toFixed(0)} KB`);
