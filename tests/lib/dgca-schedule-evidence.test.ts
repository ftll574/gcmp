import { describe, expect, it } from 'vitest';
import {
  DgcaScheduleEvidenceCatalogSchema,
  matchesDgcaIdentityWindow,
} from '../../src/lib/schemas/dgca-schedule-evidence.ts';

const row = {
  referenceRaw: 'p001/line001/station=Delhi/row=1/sha256=aaaaaaaaaaaa',
  page: 1,
  physicalRow: null,
  stationSectionOrdinal: null,
  stationSectionRaw: 'Delhi',
  printedRowRaw: '1',
  sourceSide: 'departure' as const,
  sourceRowSha256: 'a'.repeat(64),
};

const variant = {
  id: 'dgca-6e-example-variant',
  effectiveFrom: '2026-03-29',
  effectiveUntil: '2026-10-24',
  effectiveFromRaw: '29/03/2026',
  effectiveUntilRaw: '24/10/2026',
  frequencyRaw: '1234567',
  frequencyQualification: 'Raw source value; weekday mapping is unverified',
  frequencyWeekdaysCorroborated: [],
  departureClockValuesRaw: ['21:15'],
  arrivalClockValuesRaw: ['23:30'],
  aircraftTypeValuesRaw: ['A320'],
  timeBasis: 'unknown' as const,
  timezone: null,
  sourceRows: [row],
  stationCodeResolution: 'pdf-counterpart',
  stationLabelsRaw: ['Delhi'],
  sourceMovementSides: ['departure' as const],
  sourceCounterpartStatus: 'one-sided' as const,
  conflictIds: [],
  conflictKinds: [],
  conflictFields: [],
  hasVariantConflict: false,
  timeConflict: false,
  notes: ['No schedule occurrence or operation is inferred'],
};

const catalogFixture = () => DgcaScheduleEvidenceCatalogSchema.parse({
  version: 1,
  kind: 'dgca-schedule-identity-evidence',
  snapshotAsOfDate: '2026-10-07',
  semantics: {
    selectable: false,
    actualOperationEstablished: false,
    dateAvailability: 'unknown',
    sourceDateWindowSemantics: 'inclusive-calendar-date-identity-window-only',
    frequencyInterpretation: 'raw-only-unverified',
    timeBasis: 'unknown',
    utcOccurrencesGenerated: false,
    connectionTimingEstablished: false,
  },
  sources: [{
    id: 'dgca-example',
    title: 'DGCA approved schedule',
    url: 'https://example.gov/schedule.pdf',
    pdfSha256: 'b'.repeat(64),
    pdfBytes: 1000,
    pages: 1,
    publishedDateRaw: '18/03/2026',
    checkedAt: null,
    reviewBy: null,
    reviewedSnapshotDate: '2026-10-07',
    attribution: 'Source: DGCA.',
    reusePolicyUrl: 'https://example.gov/policy',
    reusePolicyStatement: 'Accurate reproduction with attribution.',
    operator: {
      printedNameRaw: 'INTERGLOBE AVIATION LTD.',
      operatorCodeRaw: 'IGO',
      carrierIdentityStatus: 'unresolved',
      carrierName: null,
      iataDesignator: null,
      icaoCode: null,
      identitySourceUrl: null,
      qualification: 'Designator and operator code are kept separate.',
    },
    counts: {
      currentReferences: 1,
      currentVariants: 1,
      excludedExpiredVariants: 0,
      excludedHeldVariants: 0,
      excludedExpiredOnlyIdentityKeys: 0,
      overlapPairs: 0,
      conflictingCoreIdentityPairs: 0,
      conflictVariants: 0,
    },
    sourceSpecificCounts: {},
    references: [{
      id: 'dgca-6e-example',
      publishedDesignatorRaw: '6E 102',
      designatorKey: '6E102',
      designatorPrefixRaw: '6E',
      flightDigitsRaw: '102',
      originIata: 'BOM',
      destinationIata: 'DEL',
      identityStatus: 'accepted-identity-only',
      airportCatalogStatus: 'all-endpoints-present',
      otherDirectionalRoutes: [],
      sourceCounterpartStatus: 'one-sided',
      hasVariantConflict: false,
      conflictReferences: [],
      variants: [variant],
    }],
  }],
});

describe('DGCA schedule evidence schema', () => {
  it('keeps identity references non-selectable and validates source lineage and inclusive windows', () => {
    const catalog = catalogFixture();
    const reference = catalog.sources[0]!.references[0]!;
    expect(catalog.semantics.selectable).toBe(false);
    expect(catalog.semantics.actualOperationEstablished).toBe(false);
    expect(reference.designatorKey).toBe('6E102');
    expect(reference.variants[0]!.timezone).toBeNull();
    expect(matchesDgcaIdentityWindow(reference, '2026-03-29')).toBe(true);
    expect(matchesDgcaIdentityWindow(reference, '2026-10-24')).toBe(true);
    expect(matchesDgcaIdentityWindow(reference, '2026-10-25')).toBe(false);
    expect(matchesDgcaIdentityWindow(reference, '2026-02-30')).toBe(false);
  });

  it('rejects an inverted window', () => {
    const invalid = catalogFixture();
    invalid.sources[0]!.references[0]!.variants[0]!.effectiveFrom = '2026-10-25';
    expect(() => DgcaScheduleEvidenceCatalogSchema.parse(invalid)).toThrow();
  });

  it('rejects a carrier mapping for an unresolved source identity', () => {
    const invalid = catalogFixture();
    invalid.sources[0]!.operator.iataDesignator = '6E';
    expect(() => DgcaScheduleEvidenceCatalogSchema.parse(invalid)).toThrow();
  });

  it('rejects a conflict flag that has no preserved conflict evidence', () => {
    const invalid = catalogFixture();
    invalid.sources[0]!.references[0]!.variants[0]!.hasVariantConflict = true;
    expect(() => DgcaScheduleEvidenceCatalogSchema.parse(invalid)).toThrow();
  });
});
