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

    test(`${file} marks the source as verified with a license`, () => {
      const meta = parseDataFileMeta(JSON.parse(readFileSync(file, 'utf8')));
      // Public-domain OurAirports origin for airports.json is evidenced by the
      // build script (scripts/build-airports.ts SOURCE_URL); airlines.json is
      // cross-verified against the OpenFlights airlines.dat snapshot by
      // scripts/verify-airlines-provenance.ts (45/45 code pairs), ODbL-1.0.
      if (file === 'public/data/airports.meta.json') {
        expect(meta.source).toMatch(/OurAirports/);
        expect(meta.license).toBe('Public-Domain');
      } else {
        expect(meta.source).toMatch(/OpenFlights/);
        expect(meta.license).toBe('ODbL-1.0');
      }
    });
  }
});
