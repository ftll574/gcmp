import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  CiZoneAssignmentSchema,
  CiZoneMapSchema,
  parseCiZoneMap,
} from '../../../src/lib/schemas/ci-zones.ts';

/** Valid assignment factory — each malformed case mutates exactly one field. */
function validAssignment(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    airport: 'TPE',
    zone: 'NEA',
    confidence: 'chart-verified',
    sourceUrls: ['https://www.china-airlines.com/skyteam-ticket-awards'],
    ...overrides,
  };
}

function mapWith(assignments: Record<string, unknown>[]): Record<string, unknown> {
  return {
    version: '2026.4',
    lastVerified: '2026-08-24',
    assignments,
  };
}

describe('CiZoneAssignmentSchema', () => {
  test('validates a minimal assignment; confidence is the dual-vocabulary enum', () => {
    const assignment = CiZoneAssignmentSchema.parse(validAssignment());
    expect(assignment.airport).toBe('TPE');
    expect(assignment.zone).toBe('NEA');
    expect(assignment.confidence).toBe('chart-verified');
    expect(assignment.notes).toBeUndefined();
    // Both confidence grades parse; anything outside the pair is rejected.
    expect(
      CiZoneAssignmentSchema.parse(validAssignment({ confidence: 'community-corrected' }))
        .confidence,
    ).toBe('community-corrected');
    expect(() =>
      CiZoneAssignmentSchema.parse(validAssignment({ confidence: 'guessed' })),
    ).toThrow();
  });

  test('airport must be a 3-letter uppercase IATA code (bad IATA rejected)', () => {
    expect(() => CiZoneAssignmentSchema.parse(validAssignment({ airport: 'tpe' }))).toThrow();
    expect(() => CiZoneAssignmentSchema.parse(validAssignment({ airport: 'TP' }))).toThrow();
    expect(() => CiZoneAssignmentSchema.parse(validAssignment({ airport: 'TPE2' }))).toThrow();
    expect(() => CiZoneAssignmentSchema.parse(validAssignment({ airport: '' }))).toThrow();
  });

  test('unknown-but-wellformed zone strings parse at schema level (vocabulary guarded elsewhere)', () => {
    // 'XX' is well-formed (2..4 chars) but not one of the 11 canonical chart
    // zones — the schema deliberately accepts it because the authoritative
    // vocabulary lives once in the award-pricing catalog (see the
    // canonical-set guard at the bottom of this file).
    expect(CiZoneAssignmentSchema.parse(validAssignment({ zone: 'XX' })).zone).toBe('XX');
    expect(CiZoneAssignmentSchema.parse(validAssignment({ zone: 'ABCD' })).zone).toBe('ABCD');
    // Malformed shapes still rejected.
    expect(() => CiZoneAssignmentSchema.parse(validAssignment({ zone: 'X' }))).toThrow();
    expect(() => CiZoneAssignmentSchema.parse(validAssignment({ zone: 'ABCDE' }))).toThrow();
  });

  test('sourceUrls must be non-empty URLs; https-only stays a test convention', () => {
    expect(() =>
      CiZoneAssignmentSchema.parse(validAssignment({ sourceUrls: [] })),
    ).toThrow();
    expect(() =>
      CiZoneAssignmentSchema.parse(validAssignment({ sourceUrls: ['not-a-url'] })),
    ).toThrow();
    // z.string().url() also admits http://, so the repo's https-only rule
    // rides on a startsWith check over parsed data — same convention as
    // flight-schedules.test.ts. Demonstrated on both sides of the predicate.
    const httpsOnly = (urls: string[]): boolean => urls.every((url) => url.startsWith('https://'));
    expect(httpsOnly(['https://example.com/chart'])).toBe(true);
    expect(httpsOnly(['http://example.com/chart'])).toBe(false);
  });

  test('notes accepts a bare string, normalized to a single-element array', () => {
    // Same option-b seam as ScheduleEntrySchema: prose-string notes stay
    // byte-verbatim in the JSON but normalize to string[] post-parse.
    expect(
      CiZoneAssignmentSchema.parse(validAssignment({ notes: 'Chart p.2 row 3.' })).notes,
    ).toEqual(['Chart p.2 row 3.']);
    expect(
      CiZoneAssignmentSchema.parse(validAssignment({ notes: ['a', 'b'] })).notes,
    ).toEqual(['a', 'b']);
  });
});

describe('CiZoneMapSchema', () => {
  test('rejects duplicate airport rows; distinct airports coexist', () => {
    expect(() =>
      CiZoneMapSchema.parse(mapWith([validAssignment(), validAssignment()])),
    ).toThrow();
    // Even a CONFLICTING re-zoning (same airport, different zone) is a dup.
    expect(() =>
      CiZoneMapSchema.parse(mapWith([validAssignment(), validAssignment({ zone: 'SEA' })])),
    ).toThrow();
    const parsed = CiZoneMapSchema.parse(
      mapWith([validAssignment(), validAssignment({ airport: 'HKG', zone: 'SEA' })]),
    );
    expect(parsed.assignments).toHaveLength(2);
  });

  test('map requires version YYYY.Q, lastVerified YYYY-MM-DD, ≥1 assignment', () => {
    expect(() =>
      CiZoneMapSchema.parse({ ...mapWith([validAssignment()]), version: '2026.5' }),
    ).toThrow();
    expect(() =>
      CiZoneMapSchema.parse({ ...mapWith([validAssignment()]), lastVerified: '2026-08' }),
    ).toThrow();
    expect(() => CiZoneMapSchema.parse(mapWith([]))).toThrow();
  });

  test('parseCiZoneMap is the loader seam with a declared return type', () => {
    const parsed: ReturnType<typeof parseCiZoneMap> = parseCiZoneMap(mapWith([validAssignment()]));
    expect(parsed.version).toBe('2026.4');
    expect(parsed.assignments[0]?.airport).toBe('TPE');
    expect(parsed.assignments[0]?.zone).toBe('NEA');
  });
});

describe('canonical zone vocabulary (public/data/award-pricing/current.json)', () => {
  // Hardcoded canonical set, cross-checked against the REAL catalog below so
  // drift on either side fails loudly. The real ci-zones.json lands after the
  // Phase-12 research pass; until then the ⊆-guard runs against this fixture.
  const CANONICAL_ZONES = [
    'NEA',
    'SEA',
    'SWA',
    'ME',
    'EU',
    'NAf',
    'SAf',
    'NAm',
    'CAm',
    'SAm',
    'SWP',
  ];

  const rawCatalog = JSON.parse(readFileSync('public/data/award-pricing/current.json', 'utf8')) as {
    products: Array<{ pricingModel: string; zones?: string[] }>;
  };

  const fixtureMap = CiZoneMapSchema.parse(
    mapWith([
      validAssignment(),
      validAssignment({ airport: 'HKG', zone: 'SEA', confidence: 'community-corrected' }),
      validAssignment({ airport: 'LHR', zone: 'EU' }),
      validAssignment({ airport: 'LAX', zone: 'NAm' }),
    ]),
  );

  test('real catalog publishes exactly one zone-pair product with the canonical 11 zones', () => {
    const zoneProducts = rawCatalog.products.filter((p) => p.pricingModel === 'zone-pair');
    expect(zoneProducts).toHaveLength(1);
    expect(zoneProducts[0]?.zones).toEqual(CANONICAL_ZONES);
  });

  test('guard: every zone in a parsed map ⊆ the 11 canonical names', () => {
    for (const assignment of fixtureMap.assignments) {
      expect(CANONICAL_ZONES).toContain(assignment.zone);
    }
  });

  test('REAL ci-zones.json parses; every assignment zones ⊆ canonical (§A12)', () => {
    const rawReal = JSON.parse(
      readFileSync('public/data/geo/ci-zones.json', 'utf8'),
    ) as unknown;
    const real = CiZoneMapSchema.parse(rawReal);
    expect(real.assignments.length).toBe(65); // §A12 station join — drift fails loudly
    const confidences = new Set(real.assignments.map((a) => a.confidence));
    expect(confidences).toEqual(new Set(['chart-verified']));
    for (const assignment of real.assignments) {
      expect(CANONICAL_ZONES).toContain(assignment.zone);
    }
  });
});
