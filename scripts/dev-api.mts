// A local copy of the API for development and for `make local`: the same router the Lambda runs, on real
// Open-Meteo, and on real OpenAQ when OPENAQ_API_KEY is set (otherwise on the fixtures, labelled as a model).
//   OPENAQ_API_KEY=... npx tsx scripts/dev-api.mts     then   VITE_API_URL=http://localhost:8787 npm run dev
import { createServer } from 'node:http';
import { liveClock } from '@vayu/core';
import {
  cachedStationRepo,
  cachedWeatherRepo,
  fixtureFireRepo,
  fixtureForecastRepo,
  fixtureStationRepo,
  openAqMapStationRepo,
  openAqStationRepo,
  openMeteoForecastRepo,
  openMeteoGasRepo,
  openMeteoHistoryRepo,
  openMeteoWeatherForecastRepo,
  openMeteoWeatherRepo,
} from '@vayu/data';
import { fixtureLinkStore } from '@vayu/watch';
import { memoryQuota } from '../apps/api/src/quota';
import { createRouter } from '../apps/api/src/routes';

const key = process.env.OPENAQ_API_KEY;
const port = Number(process.env.PORT ?? 8787);
const live = key !== undefined && key !== '';

let monitors: unknown;
if (live) {
  const repo = openAqMapStationRepo({
    apiKey: key,
    maxStations: Number(process.env.MAX_STATIONS ?? 12),
  });
  repo
    .latest(new Date().toISOString())
    .then((stations) => {
      monitors = { harvestedAt: new Date().toISOString(), stations };
      console.log(`monitors: ${String(stations.length)}`);
    })
    .catch((error: unknown) => {
      console.log('monitors failed', error);
    });
}

const route = createRouter({
  stationRepo: live
    ? cachedStationRepo(openAqStationRepo({ apiKey: key }), 15 * 60_000)
    : fixtureStationRepo(),
  forecastRepo: live ? openMeteoForecastRepo() : fixtureForecastRepo(),
  weatherRepo: cachedWeatherRepo(openMeteoWeatherRepo(), 15 * 60_000),
  weatherForecastRepo: openMeteoWeatherForecastRepo(),
  gasRepo: openMeteoGasRepo(),
  historyRepo: openMeteoHistoryRepo(),
  fireRepo: fixtureFireRepo(),
  cache: {
    latest: () => Promise.resolve(undefined),
    latestForecast: () => Promise.resolve(undefined),
    stations: () => Promise.resolve(monitors),
  },
  requests: {
    save: (id, request) => {
      console.log('request saved', id, request.who, request.wants);
      return Promise.resolve();
    },
    quota: memoryQuota(),
    clock: liveClock(),
    salt: 'local',
  },
  assistant: {
    reword: () => Promise.reject(new Error('no model locally')),
    grounded: () => Promise.reject(new Error('no model locally')),
    enabled: () => Promise.resolve(true),
    quota: memoryQuota(),
    clock: liveClock(),
    salt: 'local',
  },
  clock: liveClock(),
  mode: live ? 'live' : 'model',
  linkStore: fixtureLinkStore(),
  telegram: { botToken: 'local', webhookSecret: 'local' },
});

createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'GET,POST',
    });
    res.end();
    return;
  }
  const url = new URL(req.url ?? '/', `http://localhost:${String(port)}`);
  const chunks: Buffer[] = [];
  req.on('data', (c: Buffer) => chunks.push(c));
  req.on('end', () => {
    void route({
      method: req.method ?? 'GET',
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers: Object.fromEntries(
        Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : v]),
      ),
      body: Buffer.concat(chunks).toString('utf8'),
      sourceIp: req.socket.remoteAddress ?? 'local',
    }).then((out) => {
      res.writeHead(out.statusCode, {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type',
        'cache-control': 'no-store',
        ...out.headers,
      });
      res.end(JSON.stringify(out.body));
    });
  });
}).listen(port, () => {
  console.log(
    `local API on http://localhost:${String(port)} (${live ? 'real monitors' : 'fixtures'})`,
  );
});
