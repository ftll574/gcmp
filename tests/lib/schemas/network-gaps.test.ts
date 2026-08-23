import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  NetworkGapCatalogSchema,
  NetworkGapEntrySchema,
  parseNetworkGapCatalog,
} from '../../../src/lib/schemas/network-gaps.ts';

const catalog = NetworkGapCatalogSchema.parse(
  JSON.parse(readFileSync('public/data/network-gaps/current.json', 'utf8')),
);

/** Valid entry factory — each malformed case mutates exactly one field. */
function validEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    carrier: 'BR',
    pair: ['TPE', 'GUM'],
    status: 'not-flown',
    since: '2017-06',
    until: null,
    action: 'warn',
    confidence: 'chart-verified',
    evidence: ['https://example.com/source'],
    ...overrides,
  };
}

describe('NetworkGapCatalogSchema', () => {
  test('validates the real network-gaps watchlist', () => {
    expect(catalog.gaps.length).toBeGreaterThanOrEqual(2);
    const br = catalog.gaps.find((g) => g.carrier === 'BR');
    expect(br?.pair).toEqual(['TPE', 'GUM']);
    // BR TPE–GUM ceased 2017-06 and has NOT resumed → open-ended gap.
    expect(br?.since).toBe('2017-06');
    expect(br?.until).toBeNull();
    // UA resumed the same pair 2025-04 → closed historical gap.
    const ua = catalog.gaps.find((g) => g.carrier === 'UA');
    expect(ua?.since).toBe('2005');
    expect(ua?.until).toBe('2025-04');
  });

  test('every real entry carries at least one evidence URL', () => {
    for (const gap of catalog.gaps) {
      expect(gap.evidence.length).toBeGreaterThan(0);
      expect(gap.evidence.every((u) => u.startsWith('https://'))).toBe(true);
    }
  });

  test('carrier must be a 2-char uppercase IATA airline code', () => {
    expect(() => NetworkGapEntrySchema.parse(validEntry({ carrier: 'br' }))).toThrow();
    expect(() => NetworkGapEntrySchema.parse(validEntry({ carrier: 'BRA' }))).toThrow();
    expect(() => NetworkGapEntrySchema.parse(validEntry({ carrier: '' }))).toThrow();
  });

  test('pair endpoints must be 3-letter IATA codes', () => {
    expect(() => NetworkGapEntrySchema.parse(validEntry({ pair: ['TP', 'GUM'] }))).toThrow();
    expect(() => NetworkGapEntrySchema.parse(validEntry({ pair: ['TPE', 'gum'] }))).toThrow();
    expect(() =>
      NetworkGapEntrySchema.parse(validEntry({ pair: ['TPE'] })),
    ).toThrow();
  });

  test('since/until accept YYYY or YYYY-MM, nothing looser', () => {
    expect(NetworkGapEntrySchema.parse(validEntry()).since).toBe('2017-06');
    expect(
      NetworkGapEntrySchema.parse(validEntry({ since: '2005' })).since,
    ).toBe('2005');
    expect(() => NetworkGapEntrySchema.parse(validEntry({ since: '2017-6' }))).toThrow();
    expect(() => NetworkGapEntrySchema.parse(validEntry({ since: '06-2017' }))).toThrow();
    expect(() => NetworkGapEntrySchema.parse(validEntry({ until: '' }))).toThrow();
  });

  test('until is required-but-nullable (open vs closed gaps)', () => {
    expect(NetworkGapEntrySchema.parse(validEntry({ until: null })).until).toBeNull();
    expect(
      NetworkGapEntrySchema.parse(validEntry({ until: '2025-04' })).until,
    ).toBe('2025-04');
    // Omitting until entirely is a schema error — explicit null only.
    const missingUntil = validEntry();
    delete missingUntil.until;
    expect(() => NetworkGapEntrySchema.parse(missingUntil)).toThrow();
  });

  test('status/action/confidence are closed enums', () => {
    expect(() => NetworkGapEntrySchema.parse(validEntry({ status: 'suspended' }))).toThrow();
    expect(() => NetworkGapEntrySchema.parse(validEntry({ action: 'fail' }))).toThrow();
    expect(() => NetworkGapEntrySchema.parse(validEntry({ confidence: 'guessed' }))).toThrow();
  });

  test('evidence must be a non-empty URL array', () => {
    expect(() => NetworkGapEntrySchema.parse(validEntry({ evidence: [] }))).toThrow();
    expect(() =>
      NetworkGapEntrySchema.parse(validEntry({ evidence: ['not-a-url'] })),
    ).toThrow();
  });

  test('catalog rejects an empty gap list', () => {
    expect(() =>
      NetworkGapCatalogSchema.parse({
        version: '2026.2',
        lastVerified: '2026-05-23',
        gaps: [],
      }),
    ).toThrow();
  });

  test('duplicate carrier + unordered pair is rejected', () => {
    expect(() =>
      NetworkGapCatalogSchema.parse({
        version: '2026.2',
        lastVerified: '2026-05-23',
        gaps: [
          validEntry(),
          validEntry({ confidence: 'community-corrected' }),
        ],
      }),
    ).toThrow();
    // Reversed pair is still the same unordered pair.
    expect(() =>
      NetworkGapCatalogSchema.parse({
        version: '2026.2',
        lastVerified: '2026-05-23',
        gaps: [validEntry(), validEntry({ pair: ['GUM', 'TPE'] })],
      }),
    ).toThrow();
  });

  test('parseNetworkGapCatalog is the loader seam with a declared return type', () => {
    const raw: unknown = JSON.parse(
      readFileSync('public/data/network-gaps/current.json', 'utf8'),
    );
    const parsed = parseNetworkGapCatalog(raw);
    expect(parsed.version).toBe(catalog.version);
    expect(parsed.gaps.length).toBe(catalog.gaps.length);
  });
});
