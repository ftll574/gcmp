/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['tests/**/*.test.{ts,tsx}'],
    // Iron Rule calibration suite (tests/calibration/flyertalk-routings.test.ts)
    // runs in the default run — CI gates /ship on any calibration failure.
    coverage: {
      reporter: ['text', 'json-summary'],
      include: ['src/lib/**'],
      exclude: ['src/lib/program-loader.ts'], // covered by integration, not unit
    },
  },
});
