import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build works from any static host path (e.g. GitHub Pages /repo/).
  base: './',
  // Three.js alone is ~550 kB minified; one bundle is fine for this single-page app.
  build: { chunkSizeWarningLimit: 800 },
});
