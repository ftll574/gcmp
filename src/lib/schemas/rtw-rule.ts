import { z } from 'zod';

export const RtwAllianceSchema = z.enum(['oneworld', 'star', 'skyteam']);
export type RtwAlliance = z.infer<typeof RtwAllianceSchema>;

export const RtwProductKindSchema = z.enum([
  'cash-rtw-fare',
  'award-rtw',
  'multi-carrier-award',
]);
export type RtwProductKind = z.infer<typeof RtwProductKindSchema>;

export const RtwProductStatusSchema = z.enum(['active', 'discontinued', 'archived']);
export type RtwProductStatus = z.infer<typeof RtwProductStatusSchema>;

/**
 * Whether surface (ground transport) sectors count toward the product's
 * priced/capped distance. Calibration evidence splits the two branches:
 * Qantas oneworld Classic Flight Reward counts them (docs/calibration-set.md
 * Case 1, chart-verified), while ANA Star Alliance RTW excluded them
 * (Case 4, 「陸地交通區間不列入計算」). Defaults to counting, which matches
 * most RTW products and preserves pre-policy behavior.
 */
export const RtwSurfaceDistancePolicySchema = z.enum([
  'counts-toward-distance',
  'excluded-from-distance',
]);
export type RtwSurfaceDistancePolicy = z.infer<typeof RtwSurfaceDistancePolicySchema>;

export const RtwRuleLimitsSchema = z.object({
  minFlights: z.number().int().positive().optional(),
  maxFlights: z.number().int().positive().optional(),
  minStopovers: z.number().int().nonnegative().optional(),
  maxStopovers: z.number().int().nonnegative().optional(),
  maxTransfers: z.number().int().nonnegative().optional(),
  maxTransfersPerCity: z.number().int().nonnegative().optional(),
  maxStopoversPerCity: z.number().int().nonnegative().optional(),
  maxSurfaceSectors: z.number().int().nonnegative().optional(),
  maxDistanceMiles: z.number().int().positive().optional(),
  minTripDays: z.number().int().positive().optional(),
  maxTripMonths: z.number().int().positive().optional(),
});
export type RtwRuleLimits = z.infer<typeof RtwRuleLimitsSchema>;

export const RtwGeographyRulesSchema = z.object({
  startEnd: z.enum(['same-city', 'same-country', 'open']),
  directionPolicy: z.enum(['east-or-west-continuous', 'no-backtracking', 'flexible']),
  requiresAtlanticCrossing: z.boolean().optional(),
  requiresPacificCrossing: z.boolean().optional(),
  rejectsAtlanticAndPacificCrossing: z.boolean().optional(),
  oceanCrossingCount: z.enum(['once', 'at-least-once']).optional(),
  pricingBasis: z.enum(['continents', 'distance', 'zones']).optional(),
});
export type RtwGeographyRules = z.infer<typeof RtwGeographyRulesSchema>;

export const RtwAirlineEligibilitySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('alliance-members'),
    alliance: RtwAllianceSchema,
    includeAffiliates: z.boolean().default(false),
  }),
  z.object({
    type: z.literal('explicit-airline-set'),
    airlines: z.array(z.string().regex(/^[A-Z0-9]{2,3}$/)).min(1),
    includeAffiliates: z.boolean().default(false),
  }),
]);
export type RtwAirlineEligibility = z.infer<typeof RtwAirlineEligibilitySchema>;

export const RtwCarrierCombinationSchema = z.object({
  triggerCarrier: z.string().regex(/^[A-Z0-9]{2,3}$/),
  minCarriersWithoutTrigger: z.number().int().positive(),
  minCarriersWithTrigger: z.number().int().positive(),
});
export type RtwCarrierCombination = z.infer<typeof RtwCarrierCombinationSchema>;

export const RtwRuleSetSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  label: z.string().min(1),
  kind: RtwProductKindSchema,
  owner: z.enum(['oneworld', 'star', 'skyteam', 'airline']),
  airline: z.string().regex(/^[A-Z0-9]{2,3}$/).optional(),
  alliance: RtwAllianceSchema.optional(),
  version: z.string().regex(/^\d{4}\.[1-4]$/),
  status: RtwProductStatusSchema,
  bookingStatusNote: z.string().min(1).optional(),
  surfaceDistancePolicy: RtwSurfaceDistancePolicySchema.default('counts-toward-distance'),
  sourceUrls: z.array(z.string().url()).min(1),
  limits: RtwRuleLimitsSchema,
  geography: RtwGeographyRulesSchema,
  airlineEligibility: RtwAirlineEligibilitySchema,
  carrierCombination: RtwCarrierCombinationSchema.optional(),
});
export type RtwRuleSet = z.infer<typeof RtwRuleSetSchema>;

export const RtwRuleCatalogSchema = z.object({
  version: z.string().regex(/^\d{4}\.[1-4]$/),
  lastVerified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  products: z.array(RtwRuleSetSchema).min(1),
});
export type RtwRuleCatalog = z.infer<typeof RtwRuleCatalogSchema>;
