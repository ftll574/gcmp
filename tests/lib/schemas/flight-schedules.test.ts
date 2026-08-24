import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  ScheduleCatalogSchema,
  ScheduleEntrySchema,
  parseScheduleCatalog,
} from '../../../src/lib/schemas/flight-schedules.ts';

/** Valid entry factory — each malformed case mutates exactly one field. */
function validEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    carrier: 'BR',
    pair: ['TPE', 'NRT'],
    daysOfWeek: [1, 3, 5],
    status: 'operating',
    confidence: 'chart-verified',
    sourceUrls: ['https://example.com/br-tpe-nrt'],
    ...overrides,
  };
}

function catalogWith(entries: Record<string, unknown>[]): Record<string, unknown> {
  return {
    version: '2026.4',
    lastVerified: '2026-08-24',
    entries,
  };
}

describe('ScheduleEntrySchema', () => {
  test('validates a minimal entry; optional fields stay absent', () => {
    const entry = ScheduleEntrySchema.parse(validEntry());
    expect(entry.carrier).toBe('BR');
    expect(entry.pair).toEqual(['TPE', 'NRT']);
    expect(entry.daysOfWeek).toEqual([1, 3, 5]);
    expect(entry.flightNumbers).toBeUndefined();
    expect(entry.seasonStart).toBeUndefined();
    expect(entry.seasonEnd).toBeUndefined();
    expect(entry.effectiveFrom).toBeUndefined();
    expect(entry.effectiveUntil).toBeUndefined();
    expect(entry.notes).toBeUndefined();
  });

  test('carrier must be a 2-char uppercase IATA airline code', () => {
    expect(() => ScheduleEntrySchema.parse(validEntry({ carrier: 'br' }))).toThrow();
    expect(() => ScheduleEntrySchema.parse(validEntry({ carrier: 'BRA' }))).toThrow();
    expect(() => ScheduleEntrySchema.parse(validEntry({ carrier: '' }))).toThrow();
  });

  test('pair is an ordered from→to tuple of two IATA codes', () => {
    expect(() => ScheduleEntrySchema.parse(validEntry({ pair: ['TPE'] }))).toThrow();
    expect(() => ScheduleEntrySchema.parse(validEntry({ pair: ['TP', 'GUM'] }))).toThrow();
    expect(() => ScheduleEntrySchema.parse(validEntry({ pair: ['tpe', 'nrt'] }))).toThrow();
    // Order preserved, not normalized.
    expect(
      ScheduleEntrySchema.parse(validEntry({ pair: ['NRT', 'TPE'] })).pair,
    ).toEqual(['NRT', 'TPE']);
  });

  test('daysOfWeek accepts ISO 1..7 only, non-empty, no duplicates', () => {
    expect(ScheduleEntrySchema.parse(validEntry({ daysOfWeek: [7] })).daysOfWeek).toEqual([7]);
    expect(() => ScheduleEntrySchema.parse(validEntry({ daysOfWeek: [] }))).toThrow();
    expect(() => ScheduleEntrySchema.parse(validEntry({ daysOfWeek: [0] }))).toThrow();
    expect(() => ScheduleEntrySchema.parse(validEntry({ daysOfWeek: [8] }))).toThrow();
    expect(() => ScheduleEntrySchema.parse(validEntry({ daysOfWeek: [1.5] }))).toThrow();
    // Duplicate weekday is a transcription slip — rejected at entry level.
    expect(() => ScheduleEntrySchema.parse(validEntry({ daysOfWeek: [1, 1, 5] }))).toThrow();
  });

  test('season fields are MM-DD; effective fields are YYYY-MM-DD', () => {
    expect(
      ScheduleEntrySchema.parse(validEntry({ seasonStart: '06-01', seasonEnd: '09-30' })).seasonStart,
    ).toBe('06-01');
    expect(() => ScheduleEntrySchema.parse(validEntry({ seasonStart: '6-01' }))).toThrow();
    expect(() => ScheduleEntrySchema.parse(validEntry({ seasonStart: '2026-06-01' }))).toThrow();
    expect(
      ScheduleEntrySchema.parse(validEntry({ effectiveFrom: '2026-06-01' })).effectiveFrom,
    ).toBe('2026-06-01');
    expect(() => ScheduleEntrySchema.parse(validEntry({ effectiveFrom: '2026-6-1' }))).toThrow();
  });

  test('effectiveUntil is required-nullable-optional (explicit null only)', () => {
    expect(ScheduleEntrySchema.parse(validEntry({ effectiveUntil: null })).effectiveUntil).toBeNull();
    expect(
      ScheduleEntrySchema.parse(validEntry({ effectiveUntil: '2026-10-31' })).effectiveUntil,
    ).toBe('2026-10-31');
  });

  test('status and confidence are closed enums', () => {
    expect(() => ScheduleEntrySchema.parse(validEntry({ status: 'cancelled' }))).toThrow();
    expect(() => ScheduleEntrySchema.parse(validEntry({ status: 'not-flown' }))).toThrow();
    expect(() => ScheduleEntrySchema.parse(validEntry({ confidence: 'guessed' }))).toThrow();
    for (const status of ['operating', 'seasonal', 'suspended'] as const) {
      expect(ScheduleEntrySchema.parse(validEntry({ status })).status).toBe(status);
    }
  });

  test('sourceUrls must be a non-empty URL array', () => {
    expect(() => ScheduleEntrySchema.parse(validEntry({ sourceUrls: [] }))).toThrow();
    expect(() =>
      ScheduleEntrySchema.parse(validEntry({ sourceUrls: ['not-a-url'] })),
    ).toThrow();
  });

  test('notes accepts a bare string, normalized to a single-element array', () => {
    // Captain ruling (option b): §A10 appendix copies stay byte-verbatim
    // with prose-string notes; the schema normalizes at the seam so the
    // post-parse type remains string[] for engine and UI consumers.
    expect(
      ScheduleEntrySchema.parse(validEntry({ notes: 'Transcribed from chart.' })).notes,
    ).toEqual(['Transcribed from chart.']);
    expect(
      ScheduleEntrySchema.parse(validEntry({ notes: ['a', 'b'] })).notes,
    ).toEqual(['a', 'b']);
    expect(ScheduleEntrySchema.parse(validEntry()).notes).toBeUndefined();
  });
});

describe('ScheduleCatalogSchema', () => {
  test('rejects duplicate carrier|pair|season-window but allows different windows', () => {
    const entries = [
      validEntry(),
      validEntry({ seasonStart: '06-01', seasonEnd: '09-30' }),
    ];
    // Same carrier+pair, disjoint season windows → legitimate summer/winter split.
    const parsed = ScheduleCatalogSchema.parse(catalogWith(entries));
    expect(parsed.entries).toHaveLength(2);
    // Identical window (both absent) → duplicate.
    expect(() => ScheduleCatalogSchema.parse(catalogWith([validEntry(), validEntry()]))).toThrow();
    // Identical explicit window → duplicate.
    expect(() =>
      ScheduleCatalogSchema.parse(
        catalogWith([
          validEntry({ seasonStart: '06-01', seasonEnd: '09-30' }),
          validEntry({ seasonStart: '06-01', seasonEnd: '09-30', confidence: 'community-corrected' }),
        ]),
      ),
    ).toThrow();
    // Reversed pair is a DIFFERENT directional entry, not a duplicate
    // (schedules are directional by S3).
    const reversed = ScheduleCatalogSchema.parse(
      catalogWith([validEntry(), validEntry({ pair: ['NRT', 'TPE'] })]),
    );
    expect(reversed.entries).toHaveLength(2);
  });

  test('rejects effectiveFrom after effectiveUntil; accepts ordered and open-ended pairs', () => {
    expect(() =>
      ScheduleCatalogSchema.parse(
        catalogWith([validEntry({ effectiveFrom: '2026-10-01', effectiveUntil: '2026-09-01' })]),
      ),
    ).toThrow();
    expect(
      ScheduleCatalogSchema.parse(
        catalogWith([validEntry({ effectiveFrom: '2026-09-01', effectiveUntil: '2026-09-01' })]),
      ).entries,
    ).toHaveLength(1);
    expect(
      ScheduleCatalogSchema.parse(
        catalogWith([validEntry({ effectiveFrom: '2026-09-01', effectiveUntil: null })]),
      ).entries,
    ).toHaveLength(1);
  });

  test('catalog requires version YYYY.Q, lastVerified YYYY-MM-DD, ≥1 entry', () => {
    expect(() =>
      ScheduleCatalogSchema.parse({ ...catalogWith([validEntry()]), version: '2026.5' }),
    ).toThrow();
    expect(() =>
      ScheduleCatalogSchema.parse({ ...catalogWith([validEntry()]), lastVerified: '2026-08' }),
    ).toThrow();
    expect(() => ScheduleCatalogSchema.parse(catalogWith([]))).toThrow();
  });

  test('parseScheduleCatalog is the loader seam with a declared return type', () => {
    const parsed: ReturnType<typeof parseScheduleCatalog> = parseScheduleCatalog(
      catalogWith([validEntry()]),
    );
    expect(parsed.version).toBe('2026.4');
    expect(parsed.entries[0]?.carrier).toBe('BR');
  });
});

describe('real §A10 catalog (public/data/schedules/current.json)', () => {
  // Verbatim transcription of the researcher's §A10 machine-readable block
  // (docs/calibration-set.md A10) applied by t3. Data facts below are asserted
  // against the raw JSON so they hold independently of schema evolution; only
  // the parse test couples this suite to ScheduleCatalogSchema.
  const raw = JSON.parse(readFileSync('public/data/schedules/current.json', 'utf8')) as {
    version: string;
    lastVerified: string;
    entries: Array<{
      carrier: string;
      pair: [string, string];
      daysOfWeek: number[];
      sourceUrls: string[];
    }>;
  };

  test('catalog parses against ScheduleCatalogSchema', () => {
    const parsed = ScheduleCatalogSchema.safeParse(raw);
    if (!parsed.success) expect(parsed.error.issues).toEqual([]);
    expect(parsed.success).toBe(true);
    // Option-b seam: every real §A10 notes string normalizes to an array.
    const catalog = ScheduleCatalogSchema.parse(raw);
    expect(catalog.entries.every((e) => Array.isArray(e.notes))).toBe(true);
  });

  test('entry count matches the §A10 machine-readable block', () => {
    // Captain ruling: the CX HKG→LHR extras-only row is OMITTED from the
    // applied catalog — it pins only seasonal extra sections (Tue–Sat)
    // while base 32-weekly days stay unpinned; keeping it would make the
    // engine/UI misjudge base flights as not operating. 11 − 1 = 10.
    expect(raw.entries.length).toBe(10);
  });

  test('spot-checks daysOfWeek for CI TPE→HKG, BR TPE→SFO, JX TPE→KIX', () => {
    const find = (carrier: string, from: string, to: string) =>
      raw.entries.find((e) => e.carrier === carrier && e.pair[0] === from && e.pair[1] === to);
    expect(find('CI', 'TPE', 'HKG')?.daysOfWeek).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(find('BR', 'TPE', 'SFO')?.daysOfWeek).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(find('JX', 'TPE', 'KIX')?.daysOfWeek).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test('every sourceUrl is a non-empty https URL', () => {
    for (const entry of raw.entries) {
      expect(entry.sourceUrls.length).toBeGreaterThan(0);
      for (const url of entry.sourceUrls) {
        expect(url.startsWith('https://')).toBe(true);
      }
    }
  });
});
