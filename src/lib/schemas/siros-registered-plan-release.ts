import { z } from 'zod';

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const ArtifactSchema = z.object({
  path: z.string().min(1),
  bytes: z.number().int().positive(),
  sha256: Sha256Schema,
}).strict();

export const SiroRegisteredPlanReleaseSchema = z.object({
  schemaVersion: z.literal(1),
  releaseId: z.literal('anac-siros-registered-plans-20261007'),
  source: z.object({
    id: z.literal('anac-siros-registrations-20261007'),
    url: z.literal('https://siros.anac.gov.br/siros/registros/registros/registros.csv'),
    checkedOn: z.literal('2026-10-07'),
    retrievedAtUTC: z.literal('2026-10-07T07:14:26.504894Z'),
    bodyBytes: z.literal(27270017),
    bodySHA256: Sha256Schema,
    attributionText: z.string().min(1),
    rightsBasis: z.string().min(1),
  }).strict(),
  baselineRuntime: z.object({
    commit: z.string().regex(/^[a-f0-9]{40}$/),
    runtimeSHA256: Sha256Schema,
  }).strict(),
  inputs: z.object({
    proposal: ArtifactSchema,
    acceptedRawRows: ArtifactSchema,
    independentReview: z.object({
      handoffSummarySHA256: Sha256Schema,
      reviewSummarySHA256: Sha256Schema,
      reviewReportSHA256: Sha256Schema,
      reviewManifestSHA256: Sha256Schema,
    }).strict(),
  }).strict(),
  accepted: z.object({
    sourceRows: z.literal(14997),
    existingRouteKeys: z.literal(386),
    uniqueDesignatorAssociations: z.literal(1447),
    existingCandidateRows: z.literal(276),
    existingCandidateAssociations: z.literal(57),
    confirmedFlightOverlaps: z.literal(0),
    newIdentityRowsOnExistingRoutes: z.literal(14721),
    newIdentityAssociationsOnExistingRoutes: z.literal(1390),
    registeredPlanIdentityMatchRows: z.literal(2592),
    sameRegistrationAndProfileRows: z.literal(2575),
    designatorIdentitiesAbsentFromCandidateAndConfirmedLayers: z.literal(1390),
    baselineConfirmedFlightAssociations: z.literal(2767),
  }).strict(),
  excluded: z.object({
    allHeldExpiredAndOutOfScopeRowsOmitted: z.literal(true),
    clockConflictRowsHeld: z.literal(308),
    expiredRows: z.literal(2146),
    schemaIncompatibleZRows: z.literal(316),
    newRouteAdmissionRows: z.literal(108),
  }).strict(),
  boundaries: z.array(z.string().min(1)).min(4),
}).strict();

export type SiroRegisteredPlanRelease = z.infer<typeof SiroRegisteredPlanReleaseSchema>;
