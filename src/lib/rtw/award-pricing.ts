import type {
  AwardFeeSchedule,
  AwardPricingBand,
  AwardPricingCatalog,
  AwardPricingProduct,
} from '../schemas/award-pricing.ts';
import type { CabinId, Leg } from '../types.ts';

export interface AwardPriceEstimate {
  readonly productId: string;
  readonly label: string;
  readonly miles: number;
  readonly cabin: 'economy' | 'business' | 'first';
  readonly confidence: 'official-fixed' | 'published-chart' | 'reference-recheck';
  readonly band: {
    readonly minMiles: number;
    readonly maxMiles: number | null;
  };
  readonly notes: ReadonlyArray<string>;
  readonly sourceUrls: ReadonlyArray<string>;
}

function pricingCabin(cabin: CabinId): 'economy' | 'business' | 'first' | null {
  if (cabin === 'economy') return 'economy';
  if (cabin === 'business') return 'business';
  if (cabin === 'first') return 'first';
  return null;
}

function findProduct(catalog: AwardPricingCatalog, productId: string): AwardPricingProduct | undefined {
  return catalog.products.find((product) => product.productId === productId);
}

/**
 * Look up a product's era-pinned award fee schedule (display-only this
 * phase; NO tax estimation). Thin find by productId: returns the catalog's
 * schedule object by identity, or undefined when the product is unknown or
 * carries no fees key (e.g. BR, ANA — optional key intentionally absent).
 */
export function getAwardFees(
  catalog: AwardPricingCatalog,
  productId: string,
): AwardFeeSchedule | undefined {
  return findProduct(catalog, productId)?.fees;
}

/**
 * First band whose inclusive [minMiles, maxMiles] range contains the given
 * distance. maxMiles === null means the band is open-ended above.
 */
function findBand(
  bands: ReadonlyArray<AwardPricingBand>,
  distanceMiles: number,
): AwardPricingBand | undefined {
  return bands.find((candidate) => {
    const withinMin = distanceMiles >= candidate.minMiles;
    const withinMax = candidate.maxMiles === null || distanceMiles <= candidate.maxMiles;
    return withinMin && withinMax;
  });
}

export function estimateAwardPrice(
  catalog: AwardPricingCatalog,
  productId: string,
  distanceMiles: number,
  cabin: CabinId,
): AwardPriceEstimate | null {
  const product = findProduct(catalog, productId);
  if (!product) return null;
  const mappedCabin = pricingCabin(cabin);
  if (!mappedCabin) return null;

  const band = findBand(product.bands, distanceMiles);
  if (!band) return null;

  const miles = band.prices[mappedCabin];
  if (miles === undefined) return null;

  return {
    productId,
    label: product.label,
    miles,
    cabin: mappedCabin,
    confidence: product.confidence,
    band: {
      minMiles: band.minMiles,
      maxMiles: band.maxMiles,
    },
    notes: product.notes ?? [],
    sourceUrls: product.sourceUrls,
  };
}

export interface AwardZoneQuote {
  readonly productId: string;
  readonly label: string;
  readonly confidence: 'official-fixed' | 'published-chart' | 'reference-recheck';
  readonly band: { readonly minMiles: number; readonly maxMiles: number | null };
  readonly prices: Readonly<Partial<Record<'economy' | 'business' | 'first', number>>>;
  readonly notes: ReadonlyArray<string>;
  readonly sourceUrls: ReadonlyArray<string>;
}

/**
 * Quote EVERY cabin the catalog actually prices for one distance zone of a
 * product — lets the UI show which award zone an itinerary falls into plus
 * all known prices. Charts may be partial (e.g. the archived ANA RTW chart
 * pins business only): unpriced cabins are omitted from `prices` entirely
 * rather than filled with guesses or explicit undefineds.
 */
export function quoteAwardZone(
  catalog: AwardPricingCatalog,
  productId: string,
  distanceMiles: number,
): AwardZoneQuote | null {
  const product = findProduct(catalog, productId);
  if (!product) return null;
  const band = findBand(product.bands, distanceMiles);
  if (!band) return null;

  const prices: Partial<Record<'economy' | 'business' | 'first', number>> = {};
  if (band.prices.economy !== undefined) prices.economy = band.prices.economy;
  if (band.prices.business !== undefined) prices.business = band.prices.business;
  if (band.prices.first !== undefined) prices.first = band.prices.first;

  return {
    productId,
    label: product.label,
    confidence: product.confidence,
    band: {
      minMiles: band.minMiles,
      maxMiles: band.maxMiles,
    },
    prices,
    notes: product.notes ?? [],
    sourceUrls: product.sourceUrls,
  };
}

const RANK_BY_CABIN: Record<CabinId, number> = {
  economy: 0,
  'premium-economy': 1,
  business: 2,
  first: 3,
};

/**
 * Price a mixed-cabin itinerary at its HIGHEST booked cabin — "highest
 * class wins" (pivot plan; Cathay multi-carrier terms: pricing is based on
 * the highest class booked). Per-leg cabins raise the routing's fallback
 * cabin only upward; an unpriced highest cabin (e.g. premium economy)
 * yields null like any other unpriced request.
 */
export function priceRtwItinerary(
  catalog: AwardPricingCatalog,
  productId: string,
  distanceMiles: number,
  legs: ReadonlyArray<Leg>,
  fallbackCabin: CabinId,
): AwardPriceEstimate | null {
  let highest = fallbackCabin;
  for (const leg of legs) {
    const legCabin = leg.cabin;
    if (legCabin !== undefined && RANK_BY_CABIN[legCabin] > RANK_BY_CABIN[highest]) {
      highest = legCabin;
    }
  }
  return estimateAwardPrice(catalog, productId, distanceMiles, highest);
}
