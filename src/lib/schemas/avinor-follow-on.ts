import { z } from 'zod';

const IataSchema = z.string().regex(/^[A-Z]{3}$/);
const CarrierSchema = z.string().regex(/^[A-Z0-9]{2,3}$/);
const UtcDateTimeSchema = z.iso.datetime({ offset: true }).refine((value) => value.endsWith('Z'), 'Timestamp must be UTC');
const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);

const FollowOnOccurrenceSchema = z.object({
  arrDepRaw: z.string(),
  directnessAssessment: z.literal('no-via-airport-reported; nonstop-unverified'),
  destination: IataSchema,
  expiresAtUTC: UtcDateTimeSchema,
  oldCandidateWindowConflict: z.boolean(),
  oldCandidateWindowRelationship: z.string(),
  origin: IataSchema,
  scheduleDateUTC: z.iso.date(),
  scheduleTimeUTC: UtcDateTimeSchema,
  sourceAirport: IataSchema,
  sourceFullFlightID: z.string().min(1),
  sourceOperatingCarrierIATA: CarrierSchema,
  sourceRequestUrl: z.string().url(),
  sourceRow: z.number().int().positive(),
  sourceSnapshotPath: z.string().min(1),
  sourceSnapshotSHA256: HashSchema,
  sourceUniqueID: z.string().min(1),
  statusCode: z.string(),
  viaAirportRaw: z.string(),
  viaAirports: z.array(IataSchema),
}).passthrough().superRefine((occurrence, ctx) => {
  if (occurrence.expiresAtUTC !== occurrence.scheduleTimeUTC) {
    ctx.addIssue({ code: 'custom', path: ['expiresAtUTC'], message: 'Each occurrence expires exactly at its scheduled UTC time' });
  }
  if (occurrence.viaAirportRaw !== '' || occurrence.viaAirports.length !== 0) {
    ctx.addIssue({ code: 'custom', path: ['viaAirportRaw'], message: 'Accepted follow-on rows must retain an empty via field' });
  }
  if (occurrence.origin === occurrence.destination || ![occurrence.origin, occurrence.destination].includes(occurrence.sourceAirport)) {
    ctx.addIssue({ code: 'custom', path: ['sourceAirport'], message: 'Source airport must be one endpoint of the directed association' });
  }
  if (occurrence.sourceOperatingCarrierIATA + occurrence.sourceFullFlightID.slice(occurrence.sourceOperatingCarrierIATA.length) !== occurrence.sourceFullFlightID) {
    ctx.addIssue({ code: 'custom', path: ['sourceFullFlightID'], message: 'Full flight ID must retain the exact source operating IATA prefix' });
  }
  if (occurrence.scheduleDateUTC !== occurrence.scheduleTimeUTC.slice(0, 10)) {
    ctx.addIssue({ code: 'custom', path: ['scheduleDateUTC'], message: 'UTC schedule date must match the UTC timestamp' });
  }
});

const FollowOnIdentitySchema = z.object({
  carrierCode: CarrierSchema,
  carrierCodeRole: z.literal('source-reported-operating-IATA'),
  carrierEntityKey: z.string().min(1),
  carrierEntityName: z.string().nullable(),
  carrierEntityNameMapping: z.enum([
    'unique-trusted-name',
    'not-present-in-curated-registry',
    'unresolved-not-supplied-by-source-record',
  ]),
  destination: IataSchema,
  flightDesignator: z.string().regex(/^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/),
  marketingCarrierIATA: CarrierSchema.nullable(),
  marketingCarrierInferred: z.boolean(),
  origin: IataSchema,
  physicalOperatingCompany: z.null(),
  sourceOperatingCarrierIATA: CarrierSchema,
}).passthrough();

export const AvinorFollowOnLedgerRowSchema = z.object({
  acceptanceStatus: z.literal('follow-on-dated-schedule-evidence-accepted'),
  candidateKey: z.string().min(1),
  claimLimit: z.string().min(1),
  directnessAssessment: z.literal('no-via-airport-reported; nonstop-unverified'),
  identity: FollowOnIdentitySchema,
  occurrenceCount: z.number().int().positive(),
  occurrences: z.array(FollowOnOccurrenceSchema).min(1),
  oldCandidateWindow: z.object({
    appliesToExactExistingCandidateIdentity: z.boolean(),
    effectiveFrom: z.iso.date().nullable(),
    effectiveUntil: z.iso.date().nullable(),
    runtimeValidityAtCaptureDate: z.string().nullable(),
    source: z.string().min(1),
  }).passthrough(),
  oldCandidateWindowConflict: z.boolean(),
  oldCandidateWindowConflictOccurrenceCount: z.number().int().nonnegative(),
  runtimeBaseline: z.object({
    exactIdentityWasCandidateBeforeHandoff: z.boolean(),
    exactIdentityWasConfirmedBeforeHandoff: z.boolean(),
    runtimeSHA256: HashSchema,
    sameCarrierRouteContextIsNotFlightNumberValidity: z.literal(true),
  }).passthrough(),
  sourceArtifactKind: z.enum(['accepted-pending-179', 'accepted-batch3-22', 'independent-review-accepted-1172']),
  sourceArtifactLine: z.number().int().positive(),
  sourceArtifactPath: z.string().min(1),
  sourceArtifactSHA256: HashSchema,
}).passthrough().superRefine((row, ctx) => {
  const [carrier, carrierIdentity, route, flightId] = row.candidateKey.split('|');
  const [from, to] = route?.split('>') ?? [];
  if (carrier !== row.identity.carrierCode
    || carrierIdentity !== row.identity.carrierEntityKey
    || flightId !== row.identity.flightDesignator
    || row.identity.sourceOperatingCarrierIATA !== row.identity.carrierCode
    || row.identity.origin !== from
    || row.identity.destination !== to
    || row.occurrenceCount !== row.occurrences.length) {
    ctx.addIssue({ code: 'custom', path: ['candidateKey'], message: 'Candidate key must exactly match the accepted carrier, designator, and directed airports' });
  }
  if (row.oldCandidateWindowConflict !== (row.oldCandidateWindowConflictOccurrenceCount > 0)) {
    ctx.addIssue({ code: 'custom', path: ['oldCandidateWindowConflict'], message: 'Identity conflict flag must match its conflicting occurrence count' });
  }
  if (row.occurrences.some((occurrence) => occurrence.origin !== row.identity.origin
    || occurrence.destination !== row.identity.destination
    || occurrence.sourceOperatingCarrierIATA !== row.identity.sourceOperatingCarrierIATA
    || occurrence.sourceFullFlightID !== row.identity.flightDesignator)) {
    ctx.addIssue({ code: 'custom', path: ['occurrences'], message: 'Occurrence evidence must retain the exact accepted identity fields' });
  }
});

export const AvinorFollowOnReleaseSchema = z.object({
  version: z.literal(1),
  kind: z.literal('avinor-xml-public-follow-on-release'),
  releaseId: z.literal('avinor-follow-on-20261006'),
  packetAsOfUTC: UtcDateTimeSchema,
  networkRequestsMadeForHandoff: z.number().int().nonnegative(),
  coverage: z.object({
    scope: z.string().min(1),
    snapshotCount: z.literal(11),
    documentedAirportCount: z.literal(43),
    isGlobalCoverage: z.literal(false),
  }).strict(),
  accepted: z.object({
    identityGroups: z.literal(1373),
    occurrences: z.literal(5421),
    directedAirportPairs: z.literal(498),
    carrierDirectedRoutes: z.literal(650),
    earliestScheduleUTC: UtcDateTimeSchema,
    latestScheduleUTC: UtcDateTimeSchema,
    expiredAtPacketAsOf: z.literal(44),
    unresolvedDisplayNameIdentityGroups: z.literal(1330),
    newReviewedIdentityGroupsWithoutPriorExactCandidate: z.literal(1172),
    existingCandidateIdentityGroups: z.literal(201),
    identityGroupsFromAcceptedSourceSets: z.array(z.object({ name: z.enum([
      'accepted-pending-179', 'accepted-batch3-22', 'independent-review-accepted-1172', 'reviewer-held-8',
    ]), identityGroups: z.number().int(), sha256: HashSchema }).strict()).length(4),
  }).strict(),
  firstReleaseDisjointnessReference: z.object({
    identityGroups: z.literal(412),
    keyProjectionPath: z.string().min(1),
    keyProjectionSHA256: HashSchema,
    overlapWithFollowOn: z.literal(0),
    includedInFollowOnLedger: z.literal(false),
  }).strict(),
  held: z.object({
    identityGroups: z.literal(8),
    occurrences: z.literal(28),
    codes: z.array(CarrierSchema).length(3),
    ledgerPath: z.string().min(1),
    ledgerSHA256: HashSchema,
    integrated: z.literal(false),
  }).strict(),
  historicalWindowConflicts: z.object({}).passthrough(),
  sourceSnapshots: z.array(z.object({
    airport: IataSchema,
    httpStatus: z.literal(200),
    contentType: z.string().min(1),
    requestUrl: z.string().url(),
    retrievedAtUTC: UtcDateTimeSchema,
    feedLastUpdateUTC: UtcDateTimeSchema,
    freshUntilUTC: UtcDateTimeSchema,
    responseBytes: z.number().int().positive(),
    responseSHA256: HashSchema,
    xmlRowCount: z.number().int().positive(),
    requestMetadataSHA256: HashSchema,
    headersSHA256: HashSchema,
    rawAssetPath: z.string().min(1),
  }).strict()).length(11),
  assets: z.object({
    acceptedLedger: z.object({ path: z.string(), bytes: z.number().int().positive(), sha256: HashSchema }).strict(),
    validationReportPath: z.string(),
    validationReportSHA256: HashSchema,
    cachedTermsSnapshotPath: z.string(),
    cachedTermsSnapshotSHA256: HashSchema,
  }).strict(),
  licenseAndAttribution: z.object({
    cachedTermsSnapshotSHA256: HashSchema,
    futureHeavyLoadContactRequirement: z.boolean(),
    requiredVisibleAttribution: z.object({ href: z.string().url(), placement: z.string(), text: z.literal('Flight data from Avinor') }).strict(),
    termsLinkIsSeparateFromAttribution: z.literal(true),
    termsUrl: z.string().url(),
    termsUseSummary: z.string().min(1),
  }).strict(),
  dataLimits: z.array(z.string()),
  fieldSemantics: z.record(z.string(), z.string()),
  sourceIdentitySemantics: z.string().min(1),
}).strict().superRefine((release, ctx) => {
  const sourceSetCounts = new Map(release.accepted.identityGroupsFromAcceptedSourceSets.map((set) => [set.name, set.identityGroups] as const));
  if (sourceSetCounts.get('accepted-pending-179') !== 179
    || sourceSetCounts.get('accepted-batch3-22') !== 22
    || sourceSetCounts.get('independent-review-accepted-1172') !== 1172
    || sourceSetCounts.get('reviewer-held-8') !== 8) {
    ctx.addIssue({ code: 'custom', path: ['accepted', 'identityGroupsFromAcceptedSourceSets'], message: 'The three accepted evidence partitions and separate held partition must retain their reviewed counts' });
  }
});

export type AvinorFollowOnLedgerRow = z.infer<typeof AvinorFollowOnLedgerRowSchema>;
export type AvinorFollowOnOccurrence = AvinorFollowOnLedgerRow['occurrences'][number];
export type AvinorFollowOnRelease = z.infer<typeof AvinorFollowOnReleaseSchema>;

export function parseAvinorFollowOnLedgerJsonl(text: string): AvinorFollowOnLedgerRow[] {
  const rows: AvinorFollowOnLedgerRow[] = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(line) as unknown;
    } catch {
      throw new Error(`Avinor follow-on ledger line ${index + 1} is not valid JSON`);
    }
    const parsed = AvinorFollowOnLedgerRowSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`Avinor follow-on ledger line ${index + 1} failed schema validation: ${parsed.error.issues[0]?.message ?? 'invalid row'}`);
    }
    rows.push(parsed.data);
  }
  return rows;
}

export function parseAvinorFollowOnRelease(raw: unknown): AvinorFollowOnRelease {
  return AvinorFollowOnReleaseSchema.parse(raw);
}
