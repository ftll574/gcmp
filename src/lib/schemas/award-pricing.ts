import { z } from 'zod';

export const AwardPricingCabinSchema = z.enum(['economy', 'business', 'first']);
export type AwardPricingCabin = z.infer<typeof AwardPricingCabinSchema>;

/**
 * Cabin prices may be partially known — archived charts (e.g. the
 * discontinued ANA RTW award) pin only some bands/cabins. An unpriced
 * cabin yields estimateAwardPrice() === null instead of a guessed number.
 */
export const AwardPricingBandSchema = z.object({
  minMiles: z.number().int().nonnegative(),
  maxMiles: z.number().int().positive().nullable(),
  prices: z
    .object({
      economy: z.number().int().positive().optional(),
      business: z.number().int().positive().optional(),
      first: z.number().int().positive().optional(),
    })
    .refine(
      (prices) =>
        prices.economy !== undefined || prices.business !== undefined || prices.first !== undefined,
      'at least one cabin must be priced',
    ),
});
export type AwardPricingBand = z.infer<typeof AwardPricingBandSchema>;

export const AwardPricingProductSchema = z.object({
  productId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  label: z.string().min(1),
  pricingModel: z.enum(['fixed-rtw', 'distance-band']),
  confidence: z.enum(['official-fixed', 'published-chart', 'reference-recheck']),
  currency: z.literal('miles'),
  sourceUrls: z.array(z.string().url()).min(1),
  notes: z.array(z.string()).optional(),
  bands: z.array(AwardPricingBandSchema).min(1),
});
export type AwardPricingProduct = z.infer<typeof AwardPricingProductSchema>;

export const AwardPricingCatalogSchema = z.object({
  version: z.string().regex(/^\d{4}\.[1-4]$/),
  lastVerified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  products: z.array(AwardPricingProductSchema).min(1),
});
export type AwardPricingCatalog = z.infer<typeof AwardPricingCatalogSchema>;
