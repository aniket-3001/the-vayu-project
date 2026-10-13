// Builds the web app for the native shell into apps/mobile/www. It never writes to apps/web/dist, which is what
// the website's own deploy uploads.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..', '..', 'web');
const out = join(here, '..', 'www');
const api = process.env.VAYU_API_URL ?? 'https://d3lmq1mze2gup3.cloudfront.net';

const result = spawnSync('npx', ['vite', 'build', '--outDir', `"${out}"`, '--emptyOutDir'], {
  cwd: web,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, VITE_NATIVE: 'true', VITE_API_URL: api },
});
process.exit(result.status ?? 1);
