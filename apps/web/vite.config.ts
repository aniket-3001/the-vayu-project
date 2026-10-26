import { execSync } from 'node:child_process';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** The short id of the commit this build is made from: from CI when it builds, else from git. "dev" if neither knows. */
function commit(): string {
  const fromCi = process.env.GITHUB_SHA;
  if (fromCi !== undefined && fromCi !== '') return fromCi.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev';
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  plugins: [react()],
  // Shown on the Account page, so what is running on a phone can be told apart from an older build.
  define: { __BUILD__: JSON.stringify({ commit: commit(), date: new Date().toISOString().slice(0, 10) }) },
  // MapLibre starts its worker from a path relative to its own file, which pre-bundling would break.
  optimizeDeps: { exclude: ['maplibre-gl'] },
});
