import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
  plugins: [react(), {
    name: 'gcmp-local-siros-query-catalog',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__local/siros-registered-query-catalog.json', (_request, response) => {
        try {
          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.setHeader('Cache-Control', 'no-store');
          response.end(readFileSync(resolve(import.meta.dirname, 'docs/coverage-ledger/siros-brazil-three-carrier-20261003/registered-query-catalog.json')));
        } catch {
          response.statusCode = 404;
          response.end('{"error":"local SIROS query catalog has not been generated"}');
        }
      });
    },
  }],
  build: {
    sourcemap: true,
    target: 'es2022',
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'vendor-react',
              test: /node_modules[\\/](?:react|react-dom|scheduler)[\\/]/,
              priority: 20,
            },
            {
              name: 'vendor-three',
              test: /node_modules[\\/]three[\\/]/,
              priority: 15,
            },
            {
              name: 'vendor-zod',
              test: /node_modules[\\/]zod[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api/schedules': { target: 'http://127.0.0.1:8787' },
    },
    watch: {
      // Atomic-save tools create+delete `<name>.<uuid>.tmpdir/<file>.tmp`
      // siblings next to real sources; chokidar's Windows watcher exits
      // with EBUSY when one of those transient files disappears mid-watch,
      // killing the whole dev server. Ignore them explicitly.
      ignored: ['**/.*.tmpdir/**', '**/*.tmp'],
    },
  },
});
