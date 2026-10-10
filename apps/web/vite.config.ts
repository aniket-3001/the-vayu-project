import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // MapLibre starts its worker from a path relative to its own file, which pre-bundling would break.
  optimizeDeps: { exclude: ['maplibre-gl'] },
});
