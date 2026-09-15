import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDataFileMeta } from '../../../src/lib/schemas/data-file-meta.ts';

const META_FILES = [
  'public/data/airlines.meta.json',
  'public/data/airports.meta.json',
] as const;

describe('data-file provenance metadata', () => {
  for (const file of META_FILES) {
    test(`${file} parses and carries provenance fields`, () => {
      const meta = parseDataFileMeta(JSON.parse(readFileSync(file, 'utf8')));
      expect(meta.source.length).toBeGreaterThan(0);
      expect(meta.license.length).toBeGreaterThan(0);
      expect(meta.attribution === null || typeof meta.attribution === 'string').toBe(true);
    });

    test(`${file} marks the source as unattributed pending confirmation`, () => {
      const meta = parseDataFileMeta(JSON.parse(readFileSync(file, 'utf8')));
      expect(meta.source).toBe('unattributed (pending confirmation)');
      expect(meta.license).toBe('pending-confirmation');
    });
  }
});
