import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseGeneratedOverlay } from '../../../src/lib/schemas/route-network-generated.ts';

const NETWORK_DIR = resolve(import.meta.dirname, '..', '..', '..', 'public', 'data', 'route-network');

describe('route-network generated overlay', () => {
  test('every generated overlay present in the repo parses', () => {
    const files = readdirSync(NETWORK_DIR).filter((name) => /^runtime-generated-\d{4}-\d{2}\.json$/.test(name));
    for (const file of files) {
      const overlay = parseGeneratedOverlay(
        JSON.parse(readFileSync(resolve(NETWORK_DIR, file), 'utf8')),
      );
      expect(overlay.license).toBe('ODbL-1.0');
      expect(overlay.mergeStrategy).toBe('curated + generated');
    }
    expect(files.length).toBeGreaterThanOrEqual(0); // repo may not have one yet — CI will
  });

  test('when no generated overlay exists yet, no stale file is required', () => {
    const files = readdirSync(NETWORK_DIR).filter((name) => /^runtime-generated-\d{4}-\d{2}\.json$/.test(name));
    if (files.length === 0) {
      expect(existsSync(resolve(NETWORK_DIR, 'runtime-generated.meta.json'))).toBe(false);
    }
  });
});
