// Sends the build's source maps to Sentry so stack traces show real file names and lines, then deletes the maps from
// the build so they are never uploaded to the public site. Off until a Sentry auth token is given:
//   SENTRY_AUTH_TOKEN=... SENTRY_ORG=aniket-gupta SENTRY_PROJECT=vayu-web SENTRY_URL=https://de.sentry.io \
//     scripts/deploy-site.sh
// Without SENTRY_AUTH_TOKEN it only makes sure no map file is left in the build.
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'apps/web/dist');
// Pinned: this tool runs with a Sentry token in its environment.
const SENTRY_CLI = '@sentry/cli@2.58.6';

/** Must match the release the page reports (apps/web/src/crashReporting.ts): `vayu@<version>+<commit>`. */
export function releaseName(version, commit) {
  return `vayu@${version}${commit === '' ? '' : `+${commit}`}`;
}

/** One argument made safe for a shell: a path with a space ("Vayu Labs") would otherwise arrive as two arguments. */
export function shellQuote(arg) {
  return /[\s"]/u.test(arg) ? `"${arg.replace(/"/gu, '\\"')}"` : arg;
}

/** The app version, read from the one place it is written, so the two cannot drift apart. */
export function appVersion(deviceSource) {
  const match = /APP_VERSION\s*=\s*'([^']+)'/u.exec(deviceSource);
  if (match?.[1] === undefined)
    throw new Error('could not read APP_VERSION from analytics/device.ts');
  return match[1];
}

function mapFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? mapFiles(join(dir, entry.name))
      : entry.name.endsWith('.map')
        ? [join(dir, entry.name)]
        : [],
  );
}

function commit() {
  const fromCi = process.env.GITHUB_SHA;
  if (fromCi !== undefined && fromCi !== '') return fromCi.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const token = process.env.SENTRY_AUTH_TOKEN ?? '';
  if (token !== '') {
    for (const name of ['SENTRY_ORG', 'SENTRY_PROJECT']) {
      if ((process.env[name] ?? '') === '') {
        console.error(`upload-sourcemaps: ${name} is not set`);
        process.exit(1);
      }
    }
    const release = releaseName(
      appVersion(readFileSync(join(root, 'apps/web/src/analytics/device.ts'), 'utf8')),
      commit(),
    );
    const run = (args) =>
      spawnSync('npx', ['--yes', SENTRY_CLI, ...args.map(shellQuote)], {
        stdio: ['inherit', 'pipe', 'inherit'],
        encoding: 'utf8',
        shell: true,
        env: process.env,
      });
    const steps = [
      ['releases', 'new', release],
      [
        'sourcemaps',
        'upload',
        '--release',
        release,
        '--url-prefix',
        '~/assets',
        join(dist, 'assets'),
      ],
      ['releases', 'finalize', release],
    ];
    let bundled = 0;
    for (const step of steps) {
      const result = run(step);
      const output = result.stdout ?? '';
      process.stdout.write(output);
      if (step[1] === 'upload') bundled = Number(/Bundled (\d+) files/u.exec(output)?.[1] ?? 0);
      // The tool can exit 0 having found nothing to send, so the upload step must also report the files it bundled.
      if (result.status !== 0 || (step[1] === 'upload' && bundled === 0)) {
        console.error(
          `upload-sourcemaps: "${step.slice(0, 2).join(' ')}" failed or found no files; the maps are removed anyway`,
        );
        for (const file of mapFiles(dist)) rmSync(file);
        process.exit(1);
      }
    }
    console.log(
      `upload-sourcemaps: sent ${String(bundled)} file(s) to Sentry for release ${release}`,
    );
  } else {
    console.log('upload-sourcemaps: no SENTRY_AUTH_TOKEN, nothing uploaded');
  }
  const left = mapFiles(dist);
  for (const file of left) rmSync(file);
  if (left.length > 0)
    console.log(`upload-sourcemaps: removed ${String(left.length)} map file(s) from the build`);
}
