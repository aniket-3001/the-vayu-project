import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    setupFiles: ['apps/web/src/test-setup.ts'],
    include: [
      'packages/**/*.test.{ts,tsx}',
      'apps/**/*.test.{ts,tsx}',
      'infra/**/*.test.ts',
      'tests/**/*.test.ts',
    ],
    environment: 'node',
  },
});
