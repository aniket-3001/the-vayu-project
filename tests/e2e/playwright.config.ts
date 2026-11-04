import { defineConfig } from '@playwright/test';

const PORT = 4180;

/**
 * Real-browser checks of the built app. It serves apps/web/dist exactly as CloudFront would (same content policy and
 * headers, scripts/serve-dist.mts) and fakes the API in each test, so no network and no AWS account are needed.
 * Build first: `VITE_API_URL= npm run build -w @vayu/web`, or just `npm run e2e`.
 */
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  timeout: 30_000,
  retries: process.env.CI === undefined ? 0 : 1,
  reporter: process.env.CI === undefined ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${String(PORT)}`,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'phone-chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npx tsx scripts/serve-dist.mts',
    cwd: '../..',
    url: `http://127.0.0.1:${String(PORT)}/`,
    reuseExistingServer: process.env.CI === undefined,
    // The API is faked in every test, so the server's own forwarding goes nowhere.
    env: { PORT: String(PORT), API: 'http://127.0.0.1:9' },
  },
});
