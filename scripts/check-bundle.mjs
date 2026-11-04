// Fails if the deployed bundle holds any made-up data from the test fixtures (apps/web/src/testing) or a local
// address. Run after `VITE_API_URL= npm run build -w @vayu/web`.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
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
const ADDRESSES = ['127.0.0.1', 'execute-api'];
// A local address with a port is a development server baked in (the local API is on 8787). Two libraries mention localhost
// harmlessly and are allowed: react-router uses a bare "http://localhost" as the base to read a relative address, and
// Sentry's off-by-default Spotlight option names its own default port, 8969.
const LOCAL_PORT_ALLOWED = new Set(['8969']);
const localPorts = (text) =>
  [...text.matchAll(/localhost:(\d+)/gu)]
    .map((m) => m[1])
    .filter((port) => !LOCAL_PORT_ALLOWED.has(port));

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
const found = [
  ...[...FIXTURES, ...ADDRESSES].filter((m) => text.includes(m)),
  ...localPorts(text).map((port) => `localhost:${port}`),
];
if (found.length > 0) {
  console.error(
    `The deployed bundle contains made-up data or a local address: ${found.join(', ')}`,
  );
  process.exit(1);
}
console.log(`check-bundle: ${real} has no made-up data`);

// Size budget for the script every visitor downloads first. The map, the Lens, the admin screen and the recorded days
// load on demand; if this grows past the budget, something heavy has crept back into the first load.
const MAIN_BUDGET_KB = 900;
const html = readFileSync(join(real, 'index.html'), 'utf8');
const mainSrc = /<script[^>]*type="module"[^>]*src="([^"]+)"/u.exec(html)?.[1];
if (mainSrc === undefined) throw new Error('check-bundle: index.html has no module script');
const mainKb = statSync(join(real, mainSrc.replace(/^\//u, ''))).size / 1024;
if (mainKb > MAIN_BUDGET_KB) {
  console.error(
    `check-bundle: the main script is ${mainKb.toFixed(0)} KB, over the ${MAIN_BUDGET_KB} KB budget. Load the new weight on demand (React.lazy) or raise the budget on purpose.`,
  );
  process.exit(1);
}
console.log(`check-bundle: main script ${mainKb.toFixed(0)} KB (budget ${MAIN_BUDGET_KB} KB)`);
