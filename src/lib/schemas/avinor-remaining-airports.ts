import { z } from 'zod';

const IataSchema = z.string().regex(/^[A-Z]{3}$/);
const CarrierSchema = z.string().regex(/^[A-Z0-9]{2,3}$/);
const FlightDesignatorSchema = z.string().regex(/^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/);
const UtcDateTimeSchema = z.iso.datetime({ offset: true }).refine((value) => value.endsWith('Z'), 'Timestamp must be UTC');
const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);

const RemainingCandidateSchema = z.object({
  carrierCode: z.enum(['SK', 'WF']),
  carrierCodeRole: z.literal('source-reported-operating-IATA'),
  carrierEntityKey: z.string().min(1),
  carrierEntityName: z.string().nullable(),
  carrierEntityNameMapping: z.enum([
    'unique-trusted-name',
    'not-present-in-curated-registry',
    'unresolved-not-supplied-by-source-record',
  ]),
  destination: IataSchema,
  flightDesignator: FlightDesignatorSchema,
  origin: IataSchema,
  routeCategory: z.enum(['new-directed-route-pair', 'new-flight-number-on-known-same-carrier-route']),
  routePairPresentInRuntime: z.boolean(),
  sameCarrierDirectedRoutePresentInRuntime: z.boolean(),
}).passthrough();

const RemainingOccurrenceSchema = z.object({
  arrDepRaw: z.enum(['A', 'D']),
  codeshareAirlineDesignatorsRaw: z.string(),
  codeshareAliasesUsedForIdentity: z.literal(false),
  codeshareFlightNumbersRaw: z.string(),
  codeshareOperationalSuffixsRaw: z.string(),
  currentAtSourceCapture: z.boolean(),
  destination: IataSchema,
  expiresAtUTC: UtcDateTimeSchema,
  fullFlightID: FlightDesignatorSchema,
  oldCandidateWindowConflict: z.boolean(),
  oldCandidateWindowConflicts: z.array(z.unknown()),
  oldCandidateWindowRelationship: z.string().min(1),
  operatingCarrierIATA: CarrierSchema,
  origin: IataSchema,
  requestUrl: z.string().url(),
  retrievedAtUTC: UtcDateTimeSchema,
  scheduleTimeRaw: z.string().min(1),
  scheduleTimeUTC: UtcDateTimeSchema,
  snapshotSHA256: HashSchema,
  sourceAirport: IataSchema,
  sourceRow: z.number().int().positive(),
  sourceUniqueID: z.string().min(1),
  statusCode: z.string(),
  statusTimeRaw: z.string(),
  viaAirportRaw: z.string(),
  viaAirports: z.array(IataSchema),
}).passthrough().superRefine((occurrence, ctx) => {
  if (occurrence.expiresAtUTC !== occurrence.scheduleTimeUTC) {
    ctx.addIssue({ code: 'custom', path: ['expiresAtUTC'], message: 'Every accepted occurrence expires exactly at its scheduled UTC time' });
  }
  if (occurrence.origin === occurrence.destination || ![occurrence.origin, occurrence.destination].includes(occurrence.sourceAirport)) {
    ctx.addIssue({ code: 'custom', path: ['sourceAirport'], message: 'The source airport must be one endpoint of the directed identity' });
  }
  if (occurrence.viaAirportRaw !== '' || occurrence.viaAirports.length !== 0) {
    ctx.addIssue({ code: 'custom', path: ['viaAirportRaw'], message: 'Accepted records must preserve the source’s empty via field' });
  }
});

export const AvinorRemainingAirportsLedgerRowSchema = z.object({
  candidate: RemainingCandidateSchema,
  candidateKey: z.string().min(1),
  claimLimit: z.string().min(1),
  directnessAssessment: z.literal('no-via-airport-reported; nonstop-unverified'),
  occurrenceEvidence: z.array(RemainingOccurrenceSchema).min(1),
  promotion: z.literal(false),
  proposalDisposition: z.literal('accepted-source-evidence-candidate-proposal'),
}).passthrough().superRefine((row, ctx) => {
  const { candidate } = row;
  const [carrier, carrierEntityKey, route, flightDesignator] = row.candidateKey.split('|');
  const [origin, destination] = route?.split('>') ?? [];
  if (carrier !== candidate.carrierCode
    || carrierEntityKey !== candidate.carrierEntityKey
    || origin !== candidate.origin
    || destination !== candidate.destination
    || flightDesignator !== candidate.flightDesignator
    || candidate.carrierEntityKey !== candidate.carrierCode
    || !candidate.flightDesignator.startsWith(candidate.carrierCode)) {
    ctx.addIssue({ code: 'custom', path: ['candidateKey'], message: 'Accepted identity key must exactly retain the source carrier, designator and direction' });
  }
  if (candidate.carrierCode === 'WF'
    && (candidate.carrierEntityName !== null || candidate.carrierEntityNameMapping !== 'not-present-in-curated-registry')) {
    ctx.addIssue({ code: 'custom', path: ['candidate', 'carrierEntityName'], message: 'WF must remain the raw source code without a guessed display name' });
  }
  if (row.occurrenceEvidence.some((occurrence) => occurrence.origin !== candidate.origin
    || occurrence.destination !== candidate.destination
    || occurrence.operatingCarrierIATA !== candidate.carrierCode
    || occurrence.fullFlightID !== candidate.flightDesignator)) {
    ctx.addIssue({ code: 'custom', path: ['occurrenceEvidence'], message: 'Every source occurrence must match the accepted exact identity' });
  }
  const occurrenceKeys = row.occurrenceEvidence.map((occurrence) => `${occurrence.sourceAirport}|${occurrence.sourceRow}|${occurrence.sourceUniqueID}`);
  if (new Set(occurrenceKeys).size !== occurrenceKeys.length) {
    ctx.addIssue({ code: 'custom', path: ['occurrenceEvidence'], message: 'Source-row citations must be unique within an identity' });
  }
});

const RemainingSnapshotSchema = z.object({
  airport: IataSchema,
  sourcePacket: z.enum(['task-14-main', 'KSU-supplement-20261007']),
  httpStatus: z.literal(200),
  contentType: z.string().min(1),
  requestUrl: z.string().url(),
  retrievedAtUTC: UtcDateTimeSchema,
  feedLastUpdateUTC: UtcDateTimeSchema,
  timeFromHours: z.literal(1),
  timeToHours: z.literal(144),
  scopeHours: z.literal(144),
  codeshare: z.literal('Y'),
  direction: z.literal('both'),
  freshUntilUTC: UtcDateTimeSchema,
  responseBytes: z.number().int().positive(),
  responseSHA256: HashSchema,
  xmlRowCount: z.number().int().positive(),
  requestMetadataSHA256: HashSchema,
  headersSHA256: HashSchema,
  rawAssetPath: z.string().regex(/^route-network\/avinor-remaining-xml-public-[a-z]{3}-20261007\.xml$/),
}).strict().superRefine((snapshot, ctx) => {
  if (Date.parse(snapshot.freshUntilUTC) - Date.parse(snapshot.retrievedAtUTC) !== 144 * 60 * 60 * 1000) {
    ctx.addIssue({ code: 'custom', path: ['freshUntilUTC'], message: 'Snapshot freshness must match its 144-hour query window' });
  }
  if (!snapshot.requestUrl.includes(`airport=${snapshot.airport}&TimeFrom=1&TimeTo=144&codeshare=Y`)) {
    ctx.addIssue({ code: 'custom', path: ['requestUrl'], message: 'Snapshot URL must pin the airport and bounded query parameters' });
  }
  if ((snapshot.airport === 'KSU') !== (snapshot.sourcePacket === 'KSU-supplement-20261007')) {
    ctx.addIssue({ code: 'custom', path: ['sourcePacket'], message: 'Only the successful KSU supplement may supply KSU source data' });
  }
});

export const AvinorRemainingAirportsReleaseSchema = z.object({
  version: z.literal(1),
  kind: z.literal('avinor-xml-public-remaining-airports-release'),
  releaseId: z.literal('avinor-remaining-airports-20261007'),
  reviewAsOfUTC: UtcDateTimeSchema,
  networkRequestsMadeForHandoff: z.literal(0),
  packetProvenance: z.object({
    mainPacketManifestSHA256: HashSchema,
    mainPacketEntriesVerified: z.literal(123),
    supplementManifestSHA256: HashSchema,
    supplementEntriesVerified: z.literal(15),
    sourceInputManifestEntriesVerified: z.number().int().positive(),
    successfulSnapshotsAcrossBothPackets: z.literal(32),
    originalKSUAttemptPromoted: z.literal(false),
    supplementKSUHTTPStatus: z.literal(200),
    supplementKSUResponseBytes: z.literal(19514),
    supplementKSUSHA256: HashSchema,
  }).strict(),
  coverage: z.object({
    documentedAirportCount: z.literal(43),
    remainingAirportScopeCount: z.literal(32),
    contributingSnapshotCount: z.literal(24),
    successfulSnapshotCount: z.literal(32),
    isGlobalCoverage: z.literal(false),
    scope: z.string().min(1),
  }).strict(),
  accepted: z.object({
    identityGroups: z.literal(143),
    occurrences: z.literal(517),
    directedEndpointPairs: z.literal(76),
    carrierDirectedRoutes: z.literal(76),
    newCarrierDirectedRoutes: z.literal(45),
    existingCarrierDirectedRoutes: z.literal(31),
    currentOccurrenceEvidenceAtReviewAsOf: z.literal(513),
    expiredOccurrenceEvidenceAtReviewAsOf: z.literal(4),
    identityGroupsWithCurrentOccurrenceAtReviewAsOf: z.literal(143),
    sourceOperatingCodeCounts: z.object({ SK: z.literal(2), WF: z.literal(141) }).strict(),
    candidateWindowConflicts: z.literal(0),
    routeCategoryIdentityCounts: z.object({
      'new-directed-route-pair': z.literal(68),
      'new-flight-number-on-known-same-carrier-route': z.literal(75),
    }).strict(),
  }).strict(),
  held: z.object({
    identityGroups: z.literal(4),
    occurrences: z.literal(20),
    codes: z.tuple([z.literal('LTR')]),
    directedPairs: z.tuple([z.literal('BOO>VRY'), z.literal('VRY>BOO')]),
    integrated: z.literal(false),
    disposition: z.string().min(1),
  }).strict(),
  rejected: z.object({
    rawRows: z.literal(415),
    historicalAtCaptureRows: z.literal(30),
    viaRows: z.literal(390),
    cancelledRows: z.literal(7),
    categoriesOverlap: z.literal(true),
    parseFailures: z.literal(0),
    routeTimeConflicts: z.literal(0),
  }).strict(),
  runtimeBaseline: z.object({
    sha256: z.literal('1d6f2565df9f6be1168b88c9f27d5a2df2dc9790204eaf276ffd571b5d36f400'),
    bytes: z.literal(21207504),
    routeRecords: z.literal(32171),
    publishedRouteRecords: z.literal(31581),
    confirmedFlightIdentityKeys: z.literal(2624),
    accepted1785IdentityKeys: z.literal(1785),
    accepted1785ExactKeysFoundInRuntime: z.literal(1785),
  }).strict(),
  acceptedInput: z.object({
    path: z.literal('route-network/avinor-remaining-airports-accepted-20261007.jsonl'),
    bytes: z.literal(1043409),
    sha256: z.literal('35f9c0c587a5dc9290cd8d3f9ccd861a6cd4536b1b4a2ba1e9a91959fb811612'),
    identityCount: z.literal(143),
    ordering: z.string().min(1),
  }).strict(),
  independentReview: z.object({
    reviewReportSHA256: HashSchema,
    eligibleSourceOccurrencesSHA256: z.literal('dd5aae1a91ec9c3284e0d8de546ea01274d0f296bd4e862c6b9c8319da02d9c0'),
    verifierScriptSHA256: HashSchema,
    verifierPathInReviewWorkspace: z.string().min(1),
    sourcePacketFilesModified: z.literal(false),
    runtimeModifiedDuringReview: z.literal(false),
    networkRequestsMade: z.literal(0),
  }).strict(),
  sourceSnapshots: z.array(RemainingSnapshotSchema).length(24),
  licenseAndAttribution: z.object({
    cachedTermsSnapshotSHA256: HashSchema,
    requiredVisibleAttribution: z.object({ href: z.string().url(), placement: z.string(), text: z.literal('Flight data from Avinor') }).strict(),
    termsURL: z.string().url(),
    termsLinkIsSeparateFromAttribution: z.literal(true),
    futureHeavyLoadContactRequirement: z.literal(true),
    termsUseSummary: z.string().min(1),
  }).strict(),
  dataLimits: z.array(z.string().min(1)).min(4),
  fieldSemantics: z.record(z.string(), z.string()),
  sourceIdentitySemantics: z.string().min(1),
}).strict().superRefine((release, ctx) => {
  const airports = release.sourceSnapshots.map((snapshot) => snapshot.airport);
  if (new Set(airports).size !== airports.length) {
    ctx.addIssue({ code: 'custom', path: ['sourceSnapshots'], message: 'Each contributing airport has one pinned snapshot' });
  }
  const usedAirports = new Set(release.sourceSnapshots.map((snapshot) => snapshot.airport));
  if (release.sourceSnapshots.some((snapshot) => !usedAirports.has(snapshot.airport))) {
    ctx.addIssue({ code: 'custom', path: ['sourceSnapshots'], message: 'Snapshot provenance must be keyed by airport' });
  }
});

export type AvinorRemainingAirportsLedgerRow = z.infer<typeof AvinorRemainingAirportsLedgerRowSchema>;
export type AvinorRemainingAirportsOccurrence = AvinorRemainingAirportsLedgerRow['occurrenceEvidence'][number];
export type AvinorRemainingAirportsRelease = z.infer<typeof AvinorRemainingAirportsReleaseSchema>;

export function parseAvinorRemainingAirportsLedgerJsonl(text: string): AvinorRemainingAirportsLedgerRow[] {
  const rows: AvinorRemainingAirportsLedgerRow[] = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(line) as unknown;
    } catch {
      throw new Error(`Avinor remaining-airports ledger line ${index + 1} is not valid JSON`);
    }
    const parsed = AvinorRemainingAirportsLedgerRowSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`Avinor remaining-airports ledger line ${index + 1} failed schema validation: ${parsed.error.issues[0]?.message ?? 'invalid row'}`);
    }
    rows.push(parsed.data);
  }
  return rows;
}

export function parseAvinorRemainingAirportsRelease(raw: unknown): AvinorRemainingAirportsRelease {
  return AvinorRemainingAirportsReleaseSchema.parse(raw);
}
