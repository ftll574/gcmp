import { z } from 'zod';

const IataSchema = z.string().regex(/^[A-Z]{3}$/);
const CarrierSchema = z.string().regex(/^[A-Z0-9]{2,3}$/);
const SourceIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const UtcDateTimeSchema = z.iso.datetime({ offset: true }).refine((value) => value.endsWith('Z'), 'UTC timestamp must end in Z');

const SnapshotSchema = z.object({
  batchId: z.string().min(1),
  airport: IataSchema,
  sourceId: SourceIdSchema,
  endpoint: z.literal('https://asrv.avinor.no/XmlFeed/v1.0'),
  requestUrl: z.string().url(),
  httpStatus: z.literal(200),
  contentType: z.string().startsWith('application/xml'),
  retrievedAtUTC: UtcDateTimeSchema,
  requestStartedAtUTC: UtcDateTimeSchema.optional(),
  requestCompletedAtUTC: UtcDateTimeSchema.optional(),
  timeFromHours: z.literal(1),
  timeToHours: z.literal(144),
  scopeHours: z.literal(144),
  codeshare: z.literal('Y'),
  direction: z.literal('both'),
  validUntilUTC: UtcDateTimeSchema,
  responseBytes: z.number().int().positive(),
  responseSHA256: z.string().regex(/^[a-f0-9]{64}$/),
  rawResponsePath: z.string().regex(/^route-network\/avinor-xml-public-[a-z]{3}-20261006\.xml$/),
  acceptedAssociationCount: z.number().int().nonnegative(),
}).strict();

const CandidateSchema = z.object({
  candidateCarrierIdentity: z.enum(['provider-listed', 'operating', 'unknown']),
  candidateSourceIds: z.array(SourceIdSchema).min(1),
  carrierCode: CarrierSchema,
  carrierEntityKey: CarrierSchema,
  origin: IataSchema,
  destination: IataSchema,
  flightDesignator: z.string().regex(/^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/),
  service: z.literal('nonstop'),
  effectiveFrom: z.iso.date().optional(),
  effectiveUntil: z.iso.date().optional(),
  runtimeValidityAtCaptureDate: z.enum(['active', 'unknown']),
}).strict().superRefine((candidate, ctx) => {
  if (candidate.effectiveFrom && candidate.effectiveUntil && candidate.effectiveFrom > candidate.effectiveUntil) {
    ctx.addIssue({ code: 'custom', path: ['effectiveUntil'], message: 'Inverted candidate effective window' });
  }
  if (!candidate.flightDesignator.startsWith(candidate.carrierCode)) {
    ctx.addIssue({ code: 'custom', path: ['flightDesignator'], message: 'Flight designator must preserve the candidate carrier code' });
  }
  if (new Set(candidate.candidateSourceIds).size !== candidate.candidateSourceIds.length) {
    ctx.addIssue({ code: 'custom', path: ['candidateSourceIds'], message: 'Duplicate candidate source reference' });
  }
});

const SupportingRowSchema = z.object({
  arrDepRaw: z.string(),
  candidateKey: z.string().min(1),
  candidateSourceIds: z.array(SourceIdSchema).min(1),
  destination: IataSchema,
  flightIdRaw: z.string().min(1),
  flightIdStartsWithOperatingIATA: z.boolean(),
  observationClass: z.enum(['upcoming-scheduled-row', 'recent-status-departed-or-arrived']),
  operatingCarrierIATA: CarrierSchema,
  origin: IataSchema,
  scheduleTimeUTC: UtcDateTimeSchema,
  sourceAirport: IataSchema,
  sourceRow: z.number().int().positive(),
  sourceUniqueId: z.string().min(1),
  statusCode: z.string(),
  statusTimeUTC: z.string(),
  viaAirportRaw: z.string(),
  viaAirports: z.array(IataSchema),
}).strict();

const AssociationSchema = z.object({
  candidateKey: z.string().min(1),
  airportSnapshots: z.array(IataSchema).min(1),
  candidate: CandidateSchema,
  supportingRows: z.array(SupportingRowSchema).min(1),
}).strict();

export const AvinorXmlPublicBatchSchema = z.object({
  version: z.literal(1),
  kind: z.literal('avinor-xml-public-airport-batch'),
  batchId: z.string().min(1),
  endpoint: z.literal('https://asrv.avinor.no/XmlFeed/v1.0'),
  timeFromHours: z.literal(1),
  timeToHours: z.literal(144),
  scopeHours: z.literal(144),
  baselineRuntimeSHA256BeforeOSL: z.string().regex(/^[a-f0-9]{64}$/),
  integrationRuntimeSHA256: z.string().regex(/^[a-f0-9]{64}$/),
  frozenOSLAcceptedAssociationsSHA256: z.string().regex(/^[a-f0-9]{64}$/),
  acceptedInputPackets: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    associationCount: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict()).min(1),
  acceptedAssociationCount: z.number().int().positive(),
  acceptedDirectedCarrierRouteCount: z.number().int().positive(),
  acceptedCarrierDesignatorCount: z.number().int().positive(),
  requestCount: z.number().int().positive(),
  attributionText: z.literal('Flight data from Avinor'),
  attributionURL: z.literal('https://www.avinor.no/'),
  termsURL: z.literal('https://partner.avinor.no/en/services/flight-data/'),
  termsSummary: z.string().min(1),
  scopeNote: z.string().min(1),
  snapshots: z.array(SnapshotSchema).min(1),
  associations: z.array(AssociationSchema).min(1),
}).strict().superRefine((batch, ctx) => {
  const snapshotsByAirport = new Map(batch.snapshots.map((snapshot) => [snapshot.airport, snapshot]));
  const snapshotIds = new Set<string>();
  for (const [index, snapshot] of batch.snapshots.entries()) {
    const sourceKey = `${snapshot.airport}|${snapshot.sourceId}`;
    if (snapshotIds.has(sourceKey)) ctx.addIssue({ code: 'custom', path: ['snapshots', index], message: 'Duplicate Avinor airport snapshot' });
    snapshotIds.add(sourceKey);
    if (snapshot.sourceId !== `avinor-xml-public-batch-${snapshot.airport.toLowerCase()}-20261006`) {
      ctx.addIssue({ code: 'custom', path: ['snapshots', index, 'sourceId'], message: 'Unexpected airport snapshot source ID' });
    }
    if (snapshot.requestUrl !== `${snapshot.endpoint}?airport=${snapshot.airport}&TimeFrom=1&TimeTo=144&codeshare=Y`) {
      ctx.addIssue({ code: 'custom', path: ['snapshots', index, 'requestUrl'], message: 'Unexpected Avinor XML Public request scope' });
    }
    if (Date.parse(snapshot.validUntilUTC) - Date.parse(snapshot.retrievedAtUTC) !== 144 * 60 * 60 * 1000) {
      ctx.addIssue({ code: 'custom', path: ['snapshots', index, 'validUntilUTC'], message: 'Snapshot freshness must end exactly at retrieval +144 hours' });
    }
  }

  const seen = new Set<string>();
  const routeKeys = new Set<string>();
  const carrierDesignators = new Set<string>();
  const keyCountByAirport = new Map<string, number>();
  for (const [index, association] of batch.associations.entries()) {
    const candidate = association.candidate;
    const expectedKey = `${candidate.carrierCode}|${candidate.carrierEntityKey}|${candidate.origin}>${candidate.destination}|${candidate.flightDesignator}`;
    if (association.candidateKey !== expectedKey) {
      ctx.addIssue({ code: 'custom', path: ['associations', index, 'candidateKey'], message: 'Association key does not preserve exact carrier, designator, and direction' });
    }
    if (seen.has(association.candidateKey)) ctx.addIssue({ code: 'custom', path: ['associations', index, 'candidateKey'], message: 'Duplicate accepted association key' });
    seen.add(association.candidateKey);
    routeKeys.add(`${candidate.carrierEntityKey}|${candidate.origin}>${candidate.destination}`);
    carrierDesignators.add(`${candidate.carrierCode}|${candidate.flightDesignator}`);
    if (new Set(association.airportSnapshots).size !== association.airportSnapshots.length) {
      ctx.addIssue({ code: 'custom', path: ['associations', index, 'airportSnapshots'], message: 'Duplicate airport snapshot reference' });
    }
    let hasUpcomingInScope = false;
    for (const [rowIndex, row] of association.supportingRows.entries()) {
      const snapshot = snapshotsByAirport.get(row.sourceAirport);
      if (!snapshot || !association.airportSnapshots.includes(row.sourceAirport)) {
        ctx.addIssue({ code: 'custom', path: ['associations', index, 'supportingRows', rowIndex, 'sourceAirport'], message: 'Supporting row must reference its retained airport snapshot' });
        continue;
      }
      if (row.candidateKey !== association.candidateKey || row.candidateSourceIds.join('|') !== candidate.candidateSourceIds.join('|')
        || row.origin !== candidate.origin || row.destination !== candidate.destination
        || row.operatingCarrierIATA !== candidate.carrierCode || !row.flightIdStartsWithOperatingIATA
        || row.flightIdRaw !== candidate.flightDesignator || !row.flightIdRaw.startsWith(row.operatingCarrierIATA)
        || row.viaAirportRaw !== '' || row.viaAirports.length !== 0
        || (row.observationClass === 'upcoming-scheduled-row' && row.statusCode.toUpperCase() === 'C')) {
        ctx.addIssue({ code: 'custom', path: ['associations', index, 'supportingRows', rowIndex], message: 'Supporting row does not match the exact direct operating-carrier schedule identity' });
      }
      if (row.observationClass === 'upcoming-scheduled-row'
        && Date.parse(row.scheduleTimeUTC) > Date.parse(snapshot.retrievedAtUTC)
        && Date.parse(row.scheduleTimeUTC) <= Date.parse(snapshot.validUntilUTC)) {
        hasUpcomingInScope = true;
      }
    }
    if (!hasUpcomingInScope) {
      ctx.addIssue({ code: 'custom', path: ['associations', index, 'supportingRows'], message: 'Accepted association requires an upcoming schedule row inside an accepted snapshot window' });
    }
    for (const airport of association.airportSnapshots) {
      if (!snapshotsByAirport.has(airport)) ctx.addIssue({ code: 'custom', path: ['associations', index, 'airportSnapshots'], message: `Unknown airport snapshot ${airport}` });
      keyCountByAirport.set(airport, (keyCountByAirport.get(airport) ?? 0) + 1);
    }
  }
  if (batch.requestCount !== batch.snapshots.length) {
    ctx.addIssue({ code: 'custom', path: ['requestCount'], message: 'Request count must equal retained airport snapshots' });
  }
  if (batch.acceptedAssociationCount !== seen.size || batch.acceptedDirectedCarrierRouteCount !== routeKeys.size
    || batch.acceptedCarrierDesignatorCount !== carrierDesignators.size) {
    ctx.addIssue({ code: 'custom', path: ['associations'], message: 'Accepted association totals differ from provenance metadata' });
  }
  if (batch.acceptedInputPackets.reduce((count, packet) => count + packet.associationCount, 0) !== batch.acceptedAssociationCount) {
    ctx.addIssue({ code: 'custom', path: ['acceptedInputPackets'], message: 'Input packet totals differ from accepted associations' });
  }
  for (const [index, snapshot] of batch.snapshots.entries()) {
    if (snapshot.acceptedAssociationCount !== (keyCountByAirport.get(snapshot.airport) ?? 0)) {
      ctx.addIssue({ code: 'custom', path: ['snapshots', index, 'acceptedAssociationCount'], message: 'Airport association count differs from accepted keys' });
    }
  }
});

export type AvinorXmlPublicBatch = z.infer<typeof AvinorXmlPublicBatchSchema>;
export type AvinorXmlPublicBatchAssociation = AvinorXmlPublicBatch['associations'][number];

export function parseAvinorXmlPublicBatch(raw: unknown): AvinorXmlPublicBatch {
  return AvinorXmlPublicBatchSchema.parse(raw);
}
