import { z } from 'zod';
import { isCalendarDate } from '../calendar-date.ts';

const CalendarDate = z.string().refine(isCalendarDate, 'Expected a real calendar date');
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);

export const DgcaScheduleSourceRowSchema = z.object({
  referenceRaw: z.string().min(1),
  page: z.number().int().positive(),
  physicalRow: z.number().int().positive().nullable(),
  stationSectionOrdinal: z.number().int().positive().nullable(),
  stationSectionRaw: z.string().nullable(),
  printedRowRaw: z.string().nullable(),
  sourceSide: z.enum(['arrival', 'departure']).nullable(),
  sourceRowSha256: Sha256.nullable(),
}).strict();

export const DgcaScheduleEvidenceVariantSchema = z.object({
  id: z.string().min(1),
  effectiveFrom: CalendarDate,
  effectiveUntil: CalendarDate,
  effectiveFromRaw: z.string().min(1),
  effectiveUntilRaw: z.string().min(1),
  frequencyRaw: z.string(),
  frequencyQualification: z.string().min(1),
  frequencyWeekdaysCorroborated: z.array(z.string()),
  departureClockValuesRaw: z.array(z.string()),
  arrivalClockValuesRaw: z.array(z.string()),
  aircraftTypeValuesRaw: z.array(z.string()),
  timeBasis: z.literal('unknown'),
  timezone: z.null(),
  sourceRows: z.array(DgcaScheduleSourceRowSchema).min(1),
  stationCodeResolution: z.string().min(1),
  stationLabelsRaw: z.array(z.string()),
  sourceMovementSides: z.array(z.enum(['arrival', 'departure'])),
  sourceCounterpartStatus: z.enum(['one-sided', 'paired', 'unknown']),
  conflictIds: z.array(z.string()),
  conflictKinds: z.array(z.string()),
  conflictFields: z.array(z.enum(['frequency', 'departureClock', 'arrivalClock', 'aircraftType', 'rawClock'])),
  hasVariantConflict: z.boolean(),
  timeConflict: z.boolean(),
  notes: z.array(z.string()),
}).strict().superRefine((variant, ctx) => {
  if (variant.effectiveFrom > variant.effectiveUntil) {
    ctx.addIssue({ code: 'custom', message: 'Source validity window is inverted' });
  }
  if (variant.hasVariantConflict !== (variant.conflictIds.length > 0 || variant.conflictFields.length > 0)) {
    ctx.addIssue({ code: 'custom', message: 'Conflict flag does not match preserved conflict evidence' });
  }
  if (variant.sourceCounterpartStatus === 'paired' && new Set(variant.sourceMovementSides).size < 2) {
    ctx.addIssue({ code: 'custom', message: 'Paired source status requires arrival and departure source rows' });
  }
});

export const DgcaScheduleIdentityReferenceSchema = z.object({
  id: z.string().min(1),
  publishedDesignatorRaw: z.string().min(1),
  designatorKey: z.string().regex(/^[A-Z0-9]{2}\d{1,4}[A-Z]?$/),
  designatorPrefixRaw: z.string().regex(/^[A-Z0-9]{2}$/),
  flightDigitsRaw: z.string().regex(/^\d{1,4}[A-Z]?$/),
  originIata: z.string().regex(/^[A-Z]{3}$/),
  destinationIata: z.string().regex(/^[A-Z]{3}$/),
  identityStatus: z.literal('accepted-identity-only'),
  airportCatalogStatus: z.enum(['all-endpoints-present', 'source-code-not-in-current-catalog']),
  otherDirectionalRoutes: z.array(z.string().regex(/^[A-Z]{3}-[A-Z]{3}$/)),
  sourceCounterpartStatus: z.enum(['one-sided', 'paired', 'unknown']),
  hasVariantConflict: z.boolean(),
  conflictReferences: z.array(z.string()),
  variants: z.array(DgcaScheduleEvidenceVariantSchema).min(1),
}).strict().superRefine((reference, ctx) => {
  if (reference.originIata === reference.destinationIata
    || reference.designatorKey !== `${reference.designatorPrefixRaw}${reference.flightDigitsRaw}`) {
    ctx.addIssue({ code: 'custom', message: 'Invalid designator or directed airport identity' });
  }
  if (reference.hasVariantConflict !== reference.variants.some(variant => variant.hasVariantConflict)) {
    ctx.addIssue({ code: 'custom', message: 'Reference conflict flag does not match its variants' });
  }
});

export const DgcaScheduleEvidenceCatalogSchema = z.object({
  version: z.literal(1),
  kind: z.literal('dgca-schedule-identity-evidence'),
  snapshotAsOfDate: CalendarDate,
  semantics: z.object({
    selectable: z.literal(false),
    actualOperationEstablished: z.literal(false),
    dateAvailability: z.literal('unknown'),
    sourceDateWindowSemantics: z.literal('inclusive-calendar-date-identity-window-only'),
    frequencyInterpretation: z.literal('raw-only-unverified'),
    timeBasis: z.literal('unknown'),
    utcOccurrencesGenerated: z.literal(false),
    connectionTimingEstablished: z.literal(false),
  }).strict(),
  sources: z.array(z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    url: z.string().url(),
    pdfSha256: Sha256,
    pdfBytes: z.number().int().positive(),
    pages: z.number().int().positive(),
    publishedDateRaw: z.string().min(1),
    checkedAt: z.string().datetime().nullable(),
    reviewBy: z.string().datetime().nullable(),
    reviewedSnapshotDate: CalendarDate,
    attribution: z.string().min(1),
    reusePolicyUrl: z.string().url(),
    reusePolicyStatement: z.string().min(1),
    operator: z.object({
      printedNameRaw: z.string().nullable(),
      operatorCodeRaw: z.string().nullable(),
      carrierIdentityStatus: z.enum(['independently-mapped', 'unresolved']),
      carrierName: z.string().nullable(),
      iataDesignator: z.string().nullable(),
      icaoCode: z.string().nullable(),
      identitySourceUrl: z.string().url().nullable(),
      qualification: z.string().min(1),
    }).strict(),
    counts: z.object({
      currentReferences: z.number().int().nonnegative(),
      currentVariants: z.number().int().nonnegative(),
      excludedExpiredVariants: z.number().int().nonnegative(),
      excludedHeldVariants: z.number().int().nonnegative(),
      excludedExpiredOnlyIdentityKeys: z.number().int().nonnegative().nullable(),
      overlapPairs: z.number().int().nonnegative(),
      conflictingCoreIdentityPairs: z.number().int().nonnegative(),
      conflictVariants: z.number().int().nonnegative(),
    }).strict(),
    sourceSpecificCounts: z.record(z.string(), z.number().int().nonnegative()),
    references: z.array(DgcaScheduleIdentityReferenceSchema).min(1),
  }).strict()).min(1),
}).strict().superRefine((catalog, ctx) => {
  const sourceIds = new Set<string>();
  for (const source of catalog.sources) {
    if (sourceIds.has(source.id)) ctx.addIssue({ code: 'custom', message: 'Duplicate DGCA source ID' });
    sourceIds.add(source.id);
    if (source.operator.carrierIdentityStatus === 'unresolved'
      && [source.operator.carrierName, source.operator.iataDesignator, source.operator.icaoCode, source.operator.identitySourceUrl].some(value => value !== null)) {
      ctx.addIssue({ code: 'custom', message: `Unresolved carrier identity contains a carrier mapping in ${source.id}` });
    }
    if (source.operator.carrierIdentityStatus === 'independently-mapped'
      && [source.operator.carrierName, source.operator.iataDesignator, source.operator.icaoCode].some(value => value === null)) {
      ctx.addIssue({ code: 'custom', message: `Independent carrier mapping is incomplete in ${source.id}` });
    }
    const identities = new Set<string>();
    const referenceIds = new Set<string>();
    const variantIds = new Set<string>();
    let variants = 0;
    for (const reference of source.references) {
      const identity = `${reference.designatorKey}|${reference.originIata}|${reference.destinationIata}`;
      if (identities.has(identity) || referenceIds.has(reference.id)) {
        ctx.addIssue({ code: 'custom', message: `Duplicate identity/reference in ${source.id}` });
      }
      identities.add(identity);
      referenceIds.add(reference.id);
      for (const variant of reference.variants) {
        if (variantIds.has(variant.id)) ctx.addIssue({ code: 'custom', message: `Duplicate variant ID in ${source.id}` });
        variantIds.add(variant.id);
        variants += 1;
      }
    }
    if (source.counts.currentReferences !== source.references.length || source.counts.currentVariants !== variants) {
      ctx.addIssue({ code: 'custom', message: `Source counts do not match records in ${source.id}` });
    }
  }
});

export type DgcaScheduleEvidenceCatalog = z.infer<typeof DgcaScheduleEvidenceCatalogSchema>;
export type DgcaScheduleIdentityReference = z.infer<typeof DgcaScheduleIdentityReferenceSchema>;

/** Checks only the published identity's inclusive source window, never flight availability. */
export function matchesDgcaIdentityWindow(reference: DgcaScheduleIdentityReference, date: string): boolean {
  return isCalendarDate(date) && reference.variants.some(variant => date >= variant.effectiveFrom && date <= variant.effectiveUntil);
}

export function dgcaSourceReviewState(
  source: Pick<DgcaScheduleEvidenceCatalog['sources'][number], 'checkedAt' | 'reviewBy'>,
  now: number,
): 'current-review' | 'review-window-expired' | 'checked-in-future' | 'snapshot-only' {
  if (source.checkedAt === null || source.reviewBy === null) return 'snapshot-only';
  if (Date.parse(source.checkedAt) > now + 60000) return 'checked-in-future';
  return Date.parse(source.reviewBy) > now ? 'current-review' : 'review-window-expired';
}
