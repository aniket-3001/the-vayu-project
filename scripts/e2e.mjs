// Builds the app for the live address (an empty API address: the page and the API share one address) and runs the
// browser tests in tests/e2e against it. Needs the browser once: `npx playwright install chromium`.
import { spawnSync } from 'node:child_process';

const run = (command, args, env = {}) => {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

if (!process.argv.includes('--no-build')) {
  run('npm', ['run', 'build', '-w', '@vayu/web'], { VITE_API_URL: '' });
}
run('npx', [
  'playwright',
  'test',
  '-c',
  'tests/e2e',
  ...process.argv.slice(2).filter((a) => a !== '--no-build'),
]);
