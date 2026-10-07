import { z } from 'zod';
import { isCalendarDate } from '../calendar-date.ts';

const CalendarDate = z.string().refine(isCalendarDate, 'Expected a real calendar date');
const SourceRowRef = z.string().regex(/^p\d{2}:[^|]+:r\d+$/);
const ConflictField = z.enum([
  'arrival_time_raw',
  'departure_time_raw',
  'frequency_raw',
  'aircraft_type_raw',
]);

const SpiceJetScheduleReferenceVariantSchema = z.object({
  claimId: z.string().regex(/^claim-\d{4}$/),
  effectiveFrom: CalendarDate,
  effectiveUntil: CalendarDate,
  pageRowRefs: z.array(SourceRowRef).min(1),
  sourcePages: z.array(z.number().int().min(1).max(6)).min(1),
  sourceSerials: z.array(z.string().regex(/^\d+$/)).min(1),
  directionalLegAssertionCount: z.number().int().positive(),
  counterpartStatus: z.enum(['one-sided', 'paired']),
  frequencyRaw: z.string(),
  departureTimeRaw: z.string(),
  arrivalTimeRaw: z.string(),
  aircraftTypeRaw: z.string(),
  frequencyInterpretation: z.literal('unverified'),
  timeBasis: z.literal('unknown'),
  overlappingMetadataVariant: z.boolean(),
  metadataDifferenceFields: z.array(ConflictField),
  metadataConflictPeerClaimIds: z.array(z.string().regex(/^claim-\d{4}$/)),
  contradictoryFlightNumberOrDirectionIdentity: z.literal(false),
  sameDesignatorHasOtherDirectionalRoutes: z.boolean(),
  otherDirectionalRoutes: z.array(z.string().regex(/^[A-Z]{3}-[A-Z]{3}$/)),
  sourceScope: z.literal('DGCA approved schedule identity only; operation not established'),
}).strict().superRefine((variant, ctx) => {
  if (variant.effectiveFrom > variant.effectiveUntil) {
    ctx.addIssue({ code: 'custom', message: 'Source validity window is inverted' });
  }
  const pagesFromRefs = [...new Set(variant.pageRowRefs.map(ref => Number(ref.slice(1, 3))))].sort((a, b) => a - b);
  if (JSON.stringify(pagesFromRefs) !== JSON.stringify([...new Set(variant.sourcePages)].sort((a, b) => a - b))) {
    ctx.addIssue({ code: 'custom', message: 'Source page numbers do not match page/row lineage' });
  }
  if (!variant.overlappingMetadataVariant && (variant.metadataDifferenceFields.length > 0 || variant.metadataConflictPeerClaimIds.length > 0)) {
    ctx.addIssue({ code: 'custom', message: 'Unflagged metadata variant carries conflict details' });
  }
  if (variant.sameDesignatorHasOtherDirectionalRoutes !== (variant.otherDirectionalRoutes.length > 0)) {
    ctx.addIssue({ code: 'custom', message: 'Cross-route designator flag and routes disagree' });
  }
});

export const SpiceJetScheduleReferenceSchema = z.object({
  id: z.string().regex(/^dgca-spicejet-ss26-sg\d{1,4}[a-z]?-[a-z]{3}-[a-z]{3}$/),
  publishedDesignatorRaw: z.string().min(1),
  flightNumber: z.string().regex(/^\d{1,4}[A-Z]?$/),
  designator: z.string().regex(/^SG\d{1,4}[A-Z]?$/),
  from: z.string().regex(/^[A-Z]{3}$/),
  to: z.string().regex(/^[A-Z]{3}$/),
  hasCurrentSourceCounterpart: z.boolean(),
  overlappingMetadataVariant: z.boolean(),
  otherDirectionalRoutes: z.array(z.string().regex(/^[A-Z]{3}-[A-Z]{3}$/)),
  variants: z.array(SpiceJetScheduleReferenceVariantSchema).min(1),
}).strict().superRefine((reference, ctx) => {
  if (reference.from === reference.to || reference.designator !== `SG${reference.flightNumber}`) {
    ctx.addIssue({ code: 'custom', message: 'Invalid SpiceJet designator or direction' });
  }
  if (reference.overlappingMetadataVariant !== reference.variants.some(variant => variant.overlappingMetadataVariant)) {
    ctx.addIssue({ code: 'custom', message: 'Identity metadata-conflict flag does not match its variants' });
  }
  if (reference.hasCurrentSourceCounterpart !== reference.variants.some(variant => variant.counterpartStatus === 'paired')) {
    ctx.addIssue({ code: 'custom', message: 'Counterpart summary does not match source rows' });
  }
  const variantRoutes = [...new Set(reference.variants.flatMap(variant => variant.otherDirectionalRoutes))].sort();
  if (JSON.stringify(variantRoutes) !== JSON.stringify([...reference.otherDirectionalRoutes].sort())) {
    ctx.addIssue({ code: 'custom', message: 'Cross-route designator routes are not preserved' });
  }
});

const SourceSchema = z.object({
  id: z.literal('dgca-spicejet-ss-2026'),
  title: z.string().min(1),
  url: z.string().url().refine(url => url.startsWith('https://')),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  bytes: z.number().int().positive(),
  pages: z.literal(6),
  publishedOn: CalendarDate,
  checkedAt: z.string().datetime(),
  reviewBy: z.string().datetime(),
  attribution: z.string().min(1),
  reusePolicyUrl: z.string().url(),
  reusePolicyStatement: z.string().min(1),
}).strict().superRefine((source, ctx) => {
  const reviewWindow = Date.parse(source.reviewBy) - Date.parse(source.checkedAt);
  if (reviewWindow <= 0 || reviewWindow > 31 * 86400000) {
    ctx.addIssue({ code: 'custom', message: 'Source review window must be positive and at most 31 days' });
  }
  if (source.publishedOn > source.checkedAt.slice(0, 10)) {
    ctx.addIssue({ code: 'custom', message: 'Publication cannot postdate source verification' });
  }
});

export const SpiceJetScheduleReferenceCatalogSchema = z.object({
  version: z.literal(1),
  kind: z.literal('dgca-spicejet-approved-schedule-references'),
  snapshotAsOfDate: CalendarDate,
  sourceDateWindowSemantics: z.literal('inclusive-calendar-dates'),
  selectable: z.literal(false),
  actualOperationEstablished: z.literal(false),
  dateAvailability: z.literal('unknown'),
  frequencyInterpretation: z.literal('raw-only-unverified'),
  timeBasis: z.literal('unknown'),
  source: SourceSchema,
  carrierIdentity: z.object({
    name: z.literal('SpiceJet Limited'),
    iataDesignator: z.literal('SG'),
    icaoCode: z.literal('SEJ'),
    identitySourceUrl: z.string().url(),
    basis: z.string().min(1),
  }).strict(),
  counts: z.object({
    currentReferences: z.number().int().nonnegative(),
    currentVariants: z.number().int().nonnegative(),
    expiredVariantsExcluded: z.number().int().nonnegative(),
    expiredOnlyIdentityKeysExcluded: z.number().int().nonnegative(),
    overlappingMetadataVariantPairs: z.number().int().nonnegative(),
    currentVariantsWithMetadataConflict: z.number().int().nonnegative(),
    overlappingClaimsFlagged: z.number().int().nonnegative(),
    conflictingCoreIdentityPairs: z.literal(0),
    currentIdentityKeysWithCounterparts: z.number().int().nonnegative(),
    currentIdentityKeysWithoutCounterparts: z.number().int().nonnegative(),
    currentReferencesWithOtherDirectionalRoutes: z.number().int().nonnegative(),
    sourceDesignatorsWithOtherDirectionalRoutes: z.number().int().nonnegative(),
  }).strict(),
  references: z.array(SpiceJetScheduleReferenceSchema).min(1),
}).strict().superRefine((catalog, ctx) => {
  const referenceIds = new Set<string>();
  const identities = new Set<string>();
  const claimIds = new Set<string>();
  let variantCount = 0;
  let withCounterpart = 0;

  for (const reference of catalog.references) {
    const identityKey = `${reference.designator}:${reference.from}-${reference.to}`;
    if (referenceIds.has(reference.id) || identities.has(identityKey)) {
      ctx.addIssue({ code: 'custom', message: 'Duplicate SpiceJet reference identity' });
    }
    referenceIds.add(reference.id);
    identities.add(identityKey);
    if (reference.hasCurrentSourceCounterpart) withCounterpart += 1;
    for (const variant of reference.variants) {
      if (claimIds.has(variant.claimId)) ctx.addIssue({ code: 'custom', message: 'Duplicate source claim ID' });
      claimIds.add(variant.claimId);
      variantCount += 1;
    }
  }

  if (catalog.counts.currentReferences !== catalog.references.length
    || catalog.counts.currentVariants !== variantCount
    || catalog.counts.currentVariantsWithMetadataConflict !== catalog.references.reduce((sum, reference) => sum + reference.variants.filter(variant => variant.overlappingMetadataVariant).length, 0)
    || catalog.counts.currentIdentityKeysWithCounterparts !== withCounterpart
    || catalog.counts.currentIdentityKeysWithoutCounterparts !== catalog.references.length - withCounterpart) {
    ctx.addIssue({ code: 'custom', message: 'SpiceJet source-reference counts do not match the catalog' });
  }
});

export type SpiceJetScheduleReferenceCatalog = z.infer<typeof SpiceJetScheduleReferenceCatalogSchema>;
export type SpiceJetScheduleReference = z.infer<typeof SpiceJetScheduleReferenceSchema>;
export type SpiceJetScheduleReferenceVariant = z.infer<typeof SpiceJetScheduleReferenceVariantSchema>;

/** This is a source-identity-window check only; it never means a flight is scheduled or operating. */
export function matchesPublishedIdentityWindow(reference: SpiceJetScheduleReference, date: string): boolean {
  return isCalendarDate(date) && reference.variants.some(variant => date >= variant.effectiveFrom && date <= variant.effectiveUntil);
}

export function spiceJetSourceReviewState(source: SpiceJetScheduleReferenceCatalog['source'], now: number): 'current-review' | 'review-window-expired' | 'checked-in-future' {
  if (Date.parse(source.checkedAt) > now + 60000) return 'checked-in-future';
  return Date.parse(source.reviewBy) > now ? 'current-review' : 'review-window-expired';
}
