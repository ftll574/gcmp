import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite config.
 *
 *   base: served from `/gcmp/` on GitHub Pages, `/` on Cloudflare/local.
 *         Set GCMP_BASE env var when building for GH Pages.
 *
 * The app uses hash-based routing (URLs like `/#/r/v1/...`) so the base
 * path only affects static asset URLs (JS, CSS, fonts), not the share URL.
 */
const base = process.env['GCMP_BASE'] || '/';

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    sourcemap: true,
    target: 'es2022',
  },
});
