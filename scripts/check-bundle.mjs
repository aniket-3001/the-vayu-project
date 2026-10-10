// Fails if the deployed bundle contains anything from the prototype build (device frames, scenarios, the tour),
// and if the prototype build has lost it. Run after `npm run build -w @vayu/web` and `npm run build:demo -w @vayu/web`.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MARKERS = ['vayu.demo.v1', 'Demo scenarios', 'demo-pill', 'second tour'];
// Made-up data and local addresses that must never be in the deployed app, only in the prototype and the tests.
const MADE_UP = [
  'Vayu unit at the school',
  'Sample monitor',
  'Gurugram',
  'shaped like Delhi',
  'localhost',
  'execute-api',
];

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

const real = 'apps/web/dist';
if (!existsSync(real)) throw new Error(`${real} is missing: build the app first`);
const text = read(real);
const found = [...MARKERS, ...MADE_UP].filter((m) => text.includes(m));
if (found.length > 0) {
  console.error(`The deployed bundle contains prototype code: ${found.join(', ')}`);
  process.exit(1);
}
console.log(`check-bundle: ${real} has no prototype code`);

const demo = 'apps/web/dist-demo';
if (existsSync(demo)) {
  const demoText = read(demo);
  const missing = MARKERS.filter((m) => !demoText.includes(m));
  if (missing.length > 0) {
    console.error(`The prototype build lost: ${missing.join(', ')}`);
    process.exit(1);
  }
  console.log(`check-bundle: ${demo} still has the prototype`);
}
