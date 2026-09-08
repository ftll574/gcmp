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

/**
 * Whether TRUE open jaws (the unflown gap between consecutive groups of a
 * multi-group routing — decision record docs/decisions/open-jaw-distance.md
 * D1) count toward the product's priced/capped distance. Conservative
 * default is excluded (= pre-policy behavior, D3); only evidence-backed
 * products opt into counting (FT 2184572 agent practice for the CX
 * oneworld Multi-carrier award). Jaws are DISTANCE-ONLY (D4): even when
 * counted they never become segments, stopovers, transfers, surface
 * sectors, or ocean crossings, and direction checks never see them.
 */
export const RtwOpenJawDistancePolicySchema = z.enum([
  'counts-toward-distance',
  'excluded-from-distance',
]);
export type RtwOpenJawDistancePolicy = z.infer<typeof RtwOpenJawDistancePolicySchema>;

export const RtwRuleLimitsSchema = z.object({
  minFlights: z.number().int().positive().optional(),
  maxFlights: z.number().int().positive().optional(),
  minStopovers: z.number().int().nonnegative().optional(),
  maxStopovers: z.number().int().nonnegative().optional(),
  maxTransfers: z.number().int().nonnegative().optional(),
  maxTransfersPerCity: z.number().int().nonnegative().optional(),
  maxStopoversPerCity: z.number().int().nonnegative().optional(),
  maxStopoversPerCountry: z.number().int().nonnegative().optional(),
  maxVisitsPerCity: z.number().int().positive().optional(),
  maxSurfaceSectors: z.number().int().nonnegative().optional(),
  maxOpenJaws: z.number().int().nonnegative().optional(),
  maxDistanceMiles: z.number().int().positive().optional(),
  minTripDays: z.number().int().positive().optional(),
  maxTripMonths: z.number().int().positive().optional(),
});
export type RtwRuleLimits = z.infer<typeof RtwRuleLimitsSchema>;

export const RtwGeographyRulesSchema = z.object({
  startEnd: z.enum(['same-city', 'same-country', 'open']),
  directionPolicy: z.enum([
    'east-or-west-continuous',
    'no-backtracking',
    'flexible',
    'iata-area-continuous',
    'network-required-backtracking',
  ]),
  /** JAL-style rule: after returning to the origin country, it cannot leave for a third country. */
  originCountryTerminalOnly: z.boolean().optional(),
  /** JAL-style stricter variant: returning to the origin city ends the itinerary. */
  originCityTerminalOnly: z.boolean().optional(),
  /** Thai-style rule: no stopover is allowed in the country where travel began. */
  forbidOriginCountryStopovers: z.boolean().optional(),
  /**
   * JAL-style conditional variant: when the itinerary originates in one of
   * these ISO alpha-2 countries, stopovers in that origin country are barred.
   */
  forbidOriginCountryStopoversWhenOriginIn: z
    .array(z.string().regex(/^[A-Z]{2}$/))
    .optional(),
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

export const RtwLocalizedRuleTextSchema = z.object({
  en: z.string().min(1),
  zhTW: z.string().min(1),
});
export type RtwLocalizedRuleText = z.infer<typeof RtwLocalizedRuleTextSchema>;

export const RtwTicketingScopeSchema = z.enum([
  'rtw-award',
  'multi-carrier-award',
  'alliance-award',
  'partner-award',
  'rtw-discontinued',
  'program-transition',
]);
export type RtwTicketingScope = z.infer<typeof RtwTicketingScopeSchema>;

export const RtwTicketingStatusSchema = z.enum(['active', 'discontinued', 'transition']);
export type RtwTicketingStatus = z.infer<typeof RtwTicketingStatusSchema>;

/**
 * Source-backed ticketing / mileage-redemption reference for one or more
 * alliance member airlines. These records are deliberately broader than
 * `RtwRuleSet`: a partner-award program belongs here even when it is NOT a
 * round-the-world product. Only records carrying `plannerProductId` may open
 * the structural RTW validator.
 */
export const RtwTicketingProgramSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  programName: z.string().min(1),
  airlines: z.array(z.string().regex(/^[A-Z0-9]{2,3}$/)).min(1),
  alliance: RtwAllianceSchema,
  scope: RtwTicketingScopeSchema,
  status: RtwTicketingStatusSchema,
  plannerProductId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).optional(),
  checkedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  keyRules: z.array(RtwLocalizedRuleTextSchema).min(1),
  sourceUrls: z.array(z.string().url()).min(1),
});
export type RtwTicketingProgram = z.infer<typeof RtwTicketingProgramSchema>;

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
  /** Last departure date for which this award product is published/usable. */
  travelEffectiveUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** JAL oneworld awards count every surface sector as one stopover. */
  surfaceSectorsCountAsStopovers: z.boolean().default(false),
  surfaceDistancePolicy: RtwSurfaceDistancePolicySchema.default('counts-toward-distance'),
  openJawDistancePolicy: RtwOpenJawDistancePolicySchema.default('excluded-from-distance'),
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
  ticketingPrograms: z.array(RtwTicketingProgramSchema).default([]),
});
export type RtwRuleCatalog = z.infer<typeof RtwRuleCatalogSchema>;
