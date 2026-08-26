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
  server: {
    watch: {
      // Atomic-save tools create+delete `<name>.<uuid>.tmpdir/<file>.tmp`
      // siblings next to real sources; chokidar's Windows watcher exits
      // with EBUSY when one of those transient files disappears mid-watch,
      // killing the whole dev server. Ignore them explicitly.
      ignored: ['**/.*.tmpdir/**', '**/*.tmp'],
    },
  },
});
