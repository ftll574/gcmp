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
      // Public-domain OurAirports origin for airports.json is evidenced by the
      // build script (scripts/build-airports.ts SOURCE_URL); airlines.json is an
      // in-repo curated list whose collection origin the repo owner has not
      // confirmed yet, so it honestly stays "pending confirmation".
      if (file === 'public/data/airports.meta.json') {
        expect(meta.source).toMatch(/OurAirports/);
        expect(meta.license).toBe('Public-Domain');
      } else {
        expect(meta.source).toBe('curated project data (alliance member airlines, see THIRD_PARTY_NOTICES.md)');
        expect(meta.license).toBe('pending-confirmation');
      }
    });
  }
});
