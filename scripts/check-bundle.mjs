// Fails if the deployed bundle holds any made-up data from the test fixtures (apps/web/src/testing) or a local
// address. Run after `VITE_API_URL= npm run build -w @vayu/web`.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// One string from each fixture, so importing any of them into the app is caught.
const FIXTURES = [
  'Sample monitor', // testing/sampleDays.ts: the made-up days
  'Hot and still', // testing/sampleDays.ts: their labels
  'Vayu unit at the school', // testing/sampleExposure.ts: made-up units
  'N’Djamena', // testing/sampleMap.ts: made-up monitors
  'Gurugram', // testing/sampleMap.ts
];
// Local addresses, and the raw API address in place of the site's own.
const ADDRESSES = ['localhost', 'execute-api'];

const read = (dir) => {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, name.name);
      if (name.isDirectory()) walk(p);
      else if (/\.(js|css|html)$/u.test(name.name)) out.push(readFileSync(p, 'utf8'));
    }
  };
  walk(dir);
  return out.join('\n');
};

// Each fixture marker must still be in the fixtures, or this check would pass for nothing.
const fixtures = readdirSync('apps/web/src/testing')
  .filter((name) => /\.ts$/u.test(name) && !name.includes('.test.'))
  .map((name) => readFileSync(join('apps/web/src/testing', name), 'utf8'))
  .join('\n');
const stale = FIXTURES.filter((m) => !fixtures.includes(m));
if (stale.length > 0) {
  console.error(`check-bundle: these markers are no longer in the fixtures: ${stale.join(', ')}`);
  process.exit(1);
}

const real = 'apps/web/dist';
if (!existsSync(real)) throw new Error(`${real} is missing: build the app first`);
const text = read(real);
if (text.length === 0) throw new Error(`${real} has no js, css or html: build the app first`);
const found = [...FIXTURES, ...ADDRESSES].filter((m) => text.includes(m));
if (found.length > 0) {
  console.error(
    `The deployed bundle contains made-up data or a local address: ${found.join(', ')}`,
  );
  process.exit(1);
}
console.log(`check-bundle: ${real} has no made-up data`);
