// Deterministic synthetic Delhi-like hourly series for building and testing without any network.
// It is NOT real data. Everything made from it must be labelled "Sample data".
import { writeFileSync } from 'node:fs';

function rng(seed) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}
const rand = rng(42);
const start = Date.parse('2025-12-05T00:00:00Z');
const hours = 14 * 24;
const out = [];
for (let i = 0; i < hours; i++) {
  const t = start + i * 3600_000;
  const ist = new Date(t + 330 * 60_000).getUTCHours();
  // morning and late-evening peaks, afternoon low
  const daily =
    1 +
    0.6 * Math.exp(-((ist - 9) ** 2) / 8) +
    0.7 * Math.exp(-((ist - 22) ** 2) / 10) -
    0.35 * Math.exp(-((ist - 15) ** 2) / 10);
  const day = i / 24;
  const episode = day > 7 ? 1 + Math.min(2.6, (day - 7) * 0.7) : 1; // a rising smog episode in the second week
  const noise = 0.9 + rand() * 0.2;
  const pm25 = Math.max(8, 130 * daily * episode * noise);
  out.push({
    hourStart: new Date(t).toISOString(),
    pm25: Math.round(pm25 * 10) / 10,
    pm10: Math.round(pm25 * 1.9 * 10) / 10,
  });
}
writeFileSync(
  new URL('../fixtures/synthetic-hourly.json', import.meta.url),
  JSON.stringify({ note: 'Synthetic sample data, not real.', hours: out }, null, 1),
);
console.log('wrote', out.length, 'hours');
