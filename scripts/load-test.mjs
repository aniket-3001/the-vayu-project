// A small load test for the read-only routes. It is deliberately gentle and has hard limits, because the live stack has a
// public address and a bill: it never calls the assistant, the speech route or any POST, and it stops at --max requests.
//
//   node scripts/load-test.mjs https://<address> --rps 10 --seconds 30 --yes
//
// Reports p50/p95/p99 latency, the error rate and the status counts. Exit code 1 if the error rate or p95 is over the limits
// (--max-error-pct, default 1; --max-p95-ms, default 1500), so it can gate a release.
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';

const args = process.argv.slice(2);
const base = args.find((a) => /^https?:\/\//u.test(a))?.replace(/\/$/u, '');
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? Number(args[i + 1]) : fallback;
};
const rps = flag('rps', 10);
const seconds = flag('seconds', 30);
const max = flag('max', 2000);
const maxErrorPct = flag('max-error-pct', 1);
const maxP95 = flag('max-p95-ms', 1500);

if (base === undefined || !args.includes('--yes')) {
  console.error('usage: node scripts/load-test.mjs <https://address> [--rps 10] [--seconds 30] [--max 2000] --yes');
  console.error('--yes confirms you mean to send this traffic to that address.');
  process.exit(2);
}
if (rps > 50) {
  console.error('refusing more than 50 requests a second: the API throttle is 25 and a test must not look like an attack');
  process.exit(2);
}

// Places across north India, so the cache is exercised as it would be, not one hot key.
const PLACES = [
  [28.61, 77.21],
  [28.57, 77.19],
  [28.46, 77.03],
  [28.7, 77.1],
  [26.85, 80.95],
  [30.73, 76.78],
  [25.6, 85.14],
  [26.91, 75.79],
];
const paths = [
  ...PLACES.map(([lat, lng]) => `/v1/today?lat=${String(lat)}&lng=${String(lng)}`),
  '/v1/stations',
  '/v1/auth-config',
];

const latencies = [];
const statuses = new Map();
let sent = 0;
let failed = 0;

async function one(path) {
  const started = performance.now();
  try {
    const res = await fetch(base + path, { headers: { 'user-agent': 'vayu-load-test' } });
    await res.arrayBuffer();
    statuses.set(res.status, (statuses.get(res.status) ?? 0) + 1);
    if (res.status >= 500 || res.status === 429) failed += 1;
  } catch {
    statuses.set('network', (statuses.get('network') ?? 0) + 1);
    failed += 1;
  }
  latencies.push(performance.now() - started);
}

const inflight = new Set();
const end = Date.now() + seconds * 1000;
let tick = 0;
while (Date.now() < end && sent < max) {
  const path = paths[tick % paths.length] ?? paths[0];
  tick += 1;
  sent += 1;
  const p = one(path).finally(() => inflight.delete(p));
  inflight.add(p);
  await sleep(1000 / rps);
}
await Promise.all(inflight);

const sorted = [...latencies].sort((a, b) => a - b);
const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
const errorPct = sent === 0 ? 0 : (failed / sent) * 100;
console.log(`sent ${String(sent)} requests to ${base} at ${String(rps)}/s`);
console.log(`latency ms: p50 ${at(0.5).toFixed(0)}  p95 ${at(0.95).toFixed(0)}  p99 ${at(0.99).toFixed(0)}`);
console.log(`errors (5xx, 429, network): ${failed} (${errorPct.toFixed(2)}%)`);
console.log(`statuses: ${[...statuses].map(([k, v]) => `${String(k)}=${String(v)}`).join('  ')}`);
if (errorPct > maxErrorPct || at(0.95) > maxP95) {
  console.error(`FAILED: limits are ${String(maxErrorPct)}% errors and p95 ${String(maxP95)} ms`);
  process.exit(1);
}
console.log('within limits');
