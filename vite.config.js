import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs. A static host can serve the build from any path,
  // and absolute `/assets/...` only resolves when the app happens to sit at
  // the domain root. Vercel puts it there today; a preview deployment or a
  // subpath tomorrow would 404 every chunk.
  base: './',
  server: { port: 5173, open: false },
  build: { target: 'es2020', assetsInlineLimit: 0 },
});
