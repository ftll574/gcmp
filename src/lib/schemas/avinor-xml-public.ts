import { z } from 'zod';

const IataSchema = z.string().regex(/^[A-Z]{3}$/);
const CarrierSchema = z.string().regex(/^[A-Z0-9]{2,3}$/);
const SourceIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const UtcDateTimeSchema = z.iso.datetime({ offset: true }).refine((value) => value.endsWith('Z'), 'UTC timestamp must end in Z');

const SupportingRowSchema = z.object({
  candidateCarrierIdentity: z.enum(['provider-listed', 'operating', 'unknown']),
  candidateKey: z.string().min(1),
  candidateSourceIds: z.array(SourceIdSchema).min(1),
  destination: IataSchema,
  domesticInternationalRaw: z.string(),
  flightIdRaw: z.string().min(1),
  flightIdStartsWithOperatingIATA: z.boolean(),
  observationClass: z.enum(['upcoming-scheduled-row', 'recent-status-departed-or-arrived']),
  operatingCarrierIATA: CarrierSchema,
  origin: IataSchema,
  scheduleTimeUTC: UtcDateTimeSchema,
  sourceRow: z.number().int().positive(),
  sourceUniqueId: z.string().min(1),
  statusCode: z.string(),
  statusTimeUTC: z.string(),
  viaAirportRaw: z.string(),
  viaAirports: z.array(IataSchema),
}).strict();

const AssociationSchema = z.object({
  candidateKey: z.string().min(1),
  candidateSourceIds: z.array(SourceIdSchema).min(1),
  evidenceClass: z.enum(['upcoming-schedule', 'recently-operated']),
  supportingSourceRows: z.array(SupportingRowSchema).min(1),
}).strict();

export const AvinorXmlPublicSnapshotSchema = z.object({
  version: z.literal(1),
  kind: z.literal('avinor-xml-public-osl-snapshot'),
  sourceId: SourceIdSchema,
  snapshot: z.object({
    airport: z.literal('OSL'),
    endpoint: z.literal('https://asrv.avinor.no/XmlFeed/v1.0'),
    requestUrl: z.string().url(),
    httpStatus: z.literal(200),
    contentType: z.string().min(1),
    retrievedAtUTC: UtcDateTimeSchema,
    feedLastUpdateUTC: UtcDateTimeSchema,
    timeFromHours: z.literal(1),
    timeToHours: z.literal(144),
    scopeHours: z.literal(144),
    validUntilUTC: UtcDateTimeSchema,
    reviewedBaseRuntimeSHA256: z.literal('2bd353350db6d871099a2c2aa2aee23b63b0a7e65cccbbc502d9234eeb017c8a'),
    responseBytes: z.number().int().positive(),
    responseSHA256: z.string().regex(/^[a-f0-9]{64}$/),
    rawResponsePath: z.string().min(1),
    acceptedAssociationsSHA256: z.string().regex(/^[a-f0-9]{64}$/),
    acceptedAssociationCount: z.number().int().positive(),
    acceptedDirectedRouteCount: z.number().int().positive(),
    xmlPublicRequestCount: z.literal(1),
    attributionText: z.literal('Flight data from Avinor'),
    attributionURL: z.literal('https://www.avinor.no/'),
    termsURL: z.literal('https://partner.avinor.no/en/services/flight-data/'),
    termsSummary: z.string().min(1),
    scopeNote: z.string().min(1),
  }).strict(),
  associations: z.array(AssociationSchema).min(1),
}).strict().superRefine((snapshot, ctx) => {
  const snapshotStart = Date.parse(snapshot.snapshot.retrievedAtUTC);
  const snapshotEnd = Date.parse(snapshot.snapshot.validUntilUTC);
  const seen = new Set<string>();
  const routes = new Set<string>();

  if (snapshotEnd - snapshotStart !== 144 * 60 * 60 * 1000) {
    ctx.addIssue({ code: 'custom', path: ['snapshot', 'validUntilUTC'], message: 'Snapshot validity must end at retrieval +144 hours' });
  }
  if (snapshot.snapshot.requestUrl !== `${snapshot.snapshot.endpoint}?airport=OSL&TimeFrom=1&TimeTo=144&codeshare=Y`) {
    ctx.addIssue({ code: 'custom', path: ['snapshot', 'requestUrl'], message: 'Unexpected Avinor request scope' });
  }
  for (const [index, association] of snapshot.associations.entries()) {
    const parts = association.candidateKey.split('|');
    if (parts.length !== 4) {
      ctx.addIssue({ code: 'custom', path: ['associations', index, 'candidateKey'], message: 'Candidate key must have four exact components' });
      continue;
    }
    const [carrier, identity, pair, number] = parts;
    const [from, to] = pair!.split('>');
    if (seen.has(association.candidateKey)) ctx.addIssue({ code: 'custom', path: ['associations', index, 'candidateKey'], message: 'Duplicate accepted candidate key' });
    seen.add(association.candidateKey);
    routes.add(`${carrier}|${pair}`);
    if (carrier !== identity || !from || !to || from === to || number !== association.supportingSourceRows[0]?.flightIdRaw) {
      ctx.addIssue({ code: 'custom', path: ['associations', index, 'candidateKey'], message: 'Accepted key must preserve exact IATA carrier, designator, and direction' });
    }
    const upcoming = association.supportingSourceRows.filter((row) => row.observationClass === 'upcoming-scheduled-row');
    if (!upcoming.some((row) => Date.parse(row.scheduleTimeUTC) > snapshotStart && Date.parse(row.scheduleTimeUTC) <= snapshotEnd)) {
      ctx.addIssue({ code: 'custom', path: ['associations', index, 'supportingSourceRows'], message: 'Accepted key needs an upcoming row within the 144-hour snapshot scope' });
    }
    for (const [rowIndex, row] of association.supportingSourceRows.entries()) {
      if (row.candidateKey !== association.candidateKey || row.candidateSourceIds.join('|') !== association.candidateSourceIds.join('|')
        || row.origin !== from || row.destination !== to || row.operatingCarrierIATA !== carrier
        || !row.flightIdStartsWithOperatingIATA || !row.flightIdRaw.startsWith(row.operatingCarrierIATA)
        || row.flightIdRaw !== number || row.viaAirportRaw !== '' || row.viaAirports.length !== 0
        || (row.observationClass === 'upcoming-scheduled-row' && row.statusCode === 'C')) {
        ctx.addIssue({ code: 'custom', path: ['associations', index, 'supportingSourceRows', rowIndex], message: 'Source row does not match the accepted exact direct operating identity' });
      }
    }
  }
  if (seen.size !== snapshot.snapshot.acceptedAssociationCount || routes.size !== snapshot.snapshot.acceptedDirectedRouteCount) {
    ctx.addIssue({ code: 'custom', path: ['associations'], message: 'Avinor accepted association totals do not match snapshot metadata' });
  }
});

export type AvinorXmlPublicSnapshot = z.infer<typeof AvinorXmlPublicSnapshotSchema>;
export type AvinorXmlPublicAssociation = AvinorXmlPublicSnapshot['associations'][number];

export function parseAvinorXmlPublicSnapshot(raw: unknown): AvinorXmlPublicSnapshot {
  return AvinorXmlPublicSnapshotSchema.parse(raw);
}
