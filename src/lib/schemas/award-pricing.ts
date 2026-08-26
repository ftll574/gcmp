import { z } from 'zod';

export const AwardPricingCabinSchema = z.enum(['economy', 'premium-economy', 'business', 'first']);
export type AwardPricingCabin = z.infer<typeof AwardPricingCabinSchema>;

/**
 * Cabin prices may be partially known — archived charts (e.g. the
 * discontinued ANA RTW award) pin only some bands/cabins. An unpriced
 * cabin yields estimateAwardPrice() === null instead of a guessed number.
 *
 * Shared by distance bands and zone-pair matrix cells (CI SkyTeam partner
 * award): both price the same four cabins, over a different lookup key.
 */
const AwardCabinPricesSchema = z
  .object({
    economy: z.number().int().positive().optional(),
    premiumEconomy: z.number().int().positive().optional(),
    business: z.number().int().positive().optional(),
    first: z.number().int().positive().optional(),
  })
  .refine(
    (prices) =>
      prices.economy !== undefined ||
      prices.premiumEconomy !== undefined ||
      prices.business !== undefined ||
      prices.first !== undefined,
    'at least one cabin must be priced',
  );

export const AwardPricingBandSchema = z.object({
  minMiles: z.number().int().nonnegative(),
  maxMiles: z.number().int().positive().nullable(),
  prices: AwardCabinPricesSchema,
});
export type AwardPricingBand = z.infer<typeof AwardPricingBandSchema>;

/**
 * One zone-pair cell of a zone-based chart (pricingModel 'zone-pair'): an
 * origin×destination region pair priced per cabin. Charts are published as
 * an upper triangle, so each unordered pair appears exactly once.
 */
export const AwardPricingZonePairCellSchema = z.object({
  originRegion: z.string().min(1),
  destinationRegion: z.string().min(1),
  prices: AwardCabinPricesSchema,
});
export type AwardPricingZonePairCell = z.infer<typeof AwardPricingZonePairCellSchema>;

/** Fields every award-pricing product carries regardless of pricing model. */
const AwardPricingProductBaseSchema = z.object({
  productId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  label: z.string().min(1),
  confidence: z.enum(['official-fixed', 'published-chart', 'reference-recheck']),
  currency: z.literal('miles'),
  sourceUrls: z.array(z.string().url()).min(1),
  notes: z.array(z.string()).optional(),
  /**
   * Publication era the chart was pinned to (YYYY-MM). Absent = priced
   * against the product's current rules version.
   */
  asOfEra: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

export const AwardPricingFixedRtwProductSchema = AwardPricingProductBaseSchema.extend({
  pricingModel: z.literal('fixed-rtw'),
  bands: z.array(AwardPricingBandSchema).min(1),
});
export type AwardPricingFixedRtwProduct = z.infer<typeof AwardPricingFixedRtwProductSchema>;

export const AwardPricingDistanceBandProductSchema = AwardPricingProductBaseSchema.extend({
  pricingModel: z.literal('distance-band'),
  bands: z.array(AwardPricingBandSchema).min(1),
});
export type AwardPricingDistanceBandProduct = z.infer<typeof AwardPricingDistanceBandProductSchema>;

export const AwardPricingZonePairProductSchema = AwardPricingProductBaseSchema.extend({
  pricingModel: z.literal('zone-pair'),
  /** Region vocabulary of the chart, in published column order. */
  zones: z.array(z.string().min(1)).min(2),
  zoneMatrix: z.array(AwardPricingZonePairCellSchema).min(1),
});
export type AwardPricingZonePairProduct = z.infer<typeof AwardPricingZonePairProductSchema>;

/**
 * Discriminated on pricingModel: band-based products key prices on total
 * distance; zone-pair products key prices on region pairs (a zone chart
 * cannot be expressed as distance bands without fabricating thresholds —
 * docs/calibration-set.md §A8(c)). Extending this union must not disturb
 * existing entries (BR / CX / ANA / QF parse unchanged).
 */
export const AwardPricingProductSchema = z.discriminatedUnion('pricingModel', [
  AwardPricingFixedRtwProductSchema,
  AwardPricingDistanceBandProductSchema,
  AwardPricingZonePairProductSchema,
]);
export type AwardPricingProduct = z.infer<typeof AwardPricingProductSchema>;

export const AwardPricingCatalogSchema = z
  .object({
    version: z.string().regex(/^\d{4}\.[1-4]$/),
    lastVerified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    products: z.array(AwardPricingProductSchema).min(1),
  })
  .superRefine((catalog, ctx) => {
    // Cross-field integrity at catalog level: every zone referenced by a
    // zoneMatrix cell must be declared in the product's zones[] vocabulary.
    // (Kept off the product member so the discriminated union stays pure
    // ZodObjects.)
    catalog.products.forEach((product, productIndex) => {
      if (!('zoneMatrix' in product)) return;
      const knownZones = new Set(product.zones);
      product.zoneMatrix.forEach((cell, cellIndex) => {
        for (const field of ['originRegion', 'destinationRegion'] as const) {
          if (!knownZones.has(cell[field])) {
            ctx.addIssue({
              code: 'custom',
              path: ['products', productIndex, 'zoneMatrix', cellIndex, field],
              message: `unknown zone '${cell[field]}' — not declared in zones[]`,
            });
          }
        }
      });
    });
  });
export type AwardPricingCatalog = z.infer<typeof AwardPricingCatalogSchema>;
