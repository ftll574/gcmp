import { z } from 'zod';
import { RegisteredPlanSchema, RouteNetworkSourceSchema } from './route-network.ts';

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const ArtifactSchema = z.object({
  path: z.string().min(1),
  bytes: z.number().int().positive(),
  sha256: Sha256Schema,
}).strict();

const RouteSchema = z.object({
  carrier: z.string().regex(/^[A-Z0-9]{2,3}$/),
  carrierEntityKey: z.string().min(1).optional(),
  pair: z.tuple([z.string().regex(/^[A-Z]{3}$/), z.string().regex(/^[A-Z]{3}$/)]),
  registeredPlans: z.array(RegisteredPlanSchema).min(1),
}).strict();

const AssociationSchema = z.object({
  key: z.string().regex(/^[A-Z0-9]{2,3}\|[^|]+\|[A-Z]{3}>[A-Z]{3}\|[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/),
  tier: z.enum(['existing-candidate', 'new-identity-on-existing-route']),
}).strict();

export const SiroRegisteredPlanOverlaySchema = z.object({
  schemaVersion: z.literal(1),
  source: RouteNetworkSourceSchema,
  attributionText: z.string().min(1),
  rightsBasis: z.string().min(1),
  artifacts: z.object({
    proposal: ArtifactSchema,
    acceptedRawRows: ArtifactSchema,
  }).strict(),
  review: z.object({
    handoffSummarySHA256: Sha256Schema,
    reviewSummarySHA256: Sha256Schema,
    reviewReportSHA256: Sha256Schema,
    reviewManifestSHA256: Sha256Schema,
    runtimeCommit: z.string().regex(/^[a-f0-9]{40}$/),
    runtimeSHA256: Sha256Schema,
  }).strict(),
  counts: z.object({
    acceptedSourceRows: z.literal(14997),
    associationGroups: z.literal(1447),
    existingRouteKeys: z.literal(386),
    candidateRows: z.literal(276),
    candidateAssociations: z.literal(57),
    confirmedRows: z.literal(0),
    newIdentityRows: z.literal(14721),
    newIdentityAssociations: z.literal(1390),
    registeredPlanIdentityMatchRows: z.literal(2592),
    sameRegistrationAndProfileRows: z.literal(2575),
    conflictRowsHeldOut: z.literal(308),
    expiredRowsHeldOut: z.literal(2146),
    schemaIncompatibleRowsHeldOut: z.literal(316),
    newRouteRowsHeldOut: z.literal(108),
  }).strict(),
  associations: z.array(AssociationSchema).length(1447),
  routes: z.array(RouteSchema).length(386),
}).strict();

export type SiroRegisteredPlanOverlay = z.infer<typeof SiroRegisteredPlanOverlaySchema>;
