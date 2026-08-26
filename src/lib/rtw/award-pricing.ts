import type {
  AwardPricingBand,
  AwardPricingCabin,
  AwardPricingCatalog,
  AwardPricingProduct,
} from '../schemas/award-pricing.ts';
import type { CabinId, Leg } from '../types.ts';

export interface AwardPriceEstimate {
  readonly productId: string;
  readonly label: string;
  readonly miles: number;
  readonly cabin: AwardPricingCabin;
  readonly confidence: 'official-fixed' | 'published-chart' | 'reference-recheck';
  readonly band: {
    readonly minMiles: number;
    readonly maxMiles: number | null;
  };
  readonly notes: ReadonlyArray<string>;
  readonly sourceUrls: ReadonlyArray<string>;
}

/**
 * Cabin ids are kebab-case (`premium-economy`) while chart price keys —
 * in the data files and the zod schemas — are camelCase
 * (`premiumEconomy`). The three legacy cabins spell identically in both
 * conventions, which masked the mismatch until A8 added Premium Economy
 * (Era-2 CI chart publishes it). Every CabinId is priceable since PE
 * joined the enum; unpriced CABIN×BAND / CABIN×CELL combinations still
 * return null at the price lookup — nothing is ever guessed.
 */
export const PRICE_KEY_BY_CABIN: Record<
  CabinId,
  'economy' | 'premiumEconomy' | 'business' | 'first'
> = {
  economy: 'economy',
  'premium-economy': 'premiumEconomy',
  business: 'business',
  first: 'first',
};

function findProduct(catalog: AwardPricingCatalog, productId: string): AwardPricingProduct | undefined {
  return catalog.products.find((product) => product.productId === productId);
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
  // Zone-pair products price by region pairs, never by total distance —
  // they return null from this distance-band path (behavior preserved).
  if (!product || !('bands' in product)) return null;

  const band = findBand(product.bands, distanceMiles);
  if (!band) return null;

  const priceKey = PRICE_KEY_BY_CABIN[cabin];
  const miles = band.prices[priceKey];
  if (miles === undefined) return null;

  return {
    productId,
    label: product.label,
    miles,
    cabin,
    confidence: product.confidence,
    band: {
      minMiles: band.minMiles,
      maxMiles: band.maxMiles,
    },
    notes: product.notes ?? [],
    sourceUrls: product.sourceUrls,
  };
}

/**
 * Chart price records are keyed camelCase — exactly the data-file /
 * schema spelling (AwardCabinPricesSchema). Cabin ids elsewhere are
 * kebab-case; PRICE_KEY_BY_CABIN bridges the two conventions.
 */
export type AwardChartPrices = Readonly<
  Partial<Record<'economy' | 'premiumEconomy' | 'business' | 'first', number>>
>;

export interface AwardZoneQuote {
  readonly productId: string;
  readonly label: string;
  readonly confidence: 'official-fixed' | 'published-chart' | 'reference-recheck';
  readonly band: { readonly minMiles: number; readonly maxMiles: number | null };
  readonly prices: AwardChartPrices;
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
  if (!product || !('bands' in product)) return null;
  const band = findBand(product.bands, distanceMiles);
  if (!band) return null;

  const prices: { -readonly [K in keyof AwardChartPrices]: AwardChartPrices[K] } = {};
  if (band.prices.economy !== undefined) prices.economy = band.prices.economy;
  if (band.prices.premiumEconomy !== undefined) prices.premiumEconomy = band.prices.premiumEconomy;
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

export interface AwardZonePairQuote {
  readonly productId: string;
  readonly label: string;
  readonly confidence: 'official-fixed' | 'published-chart' | 'reference-recheck';
  /** Canonical stored direction of the matched matrix cell. */
  readonly originRegion: string;
  readonly destinationRegion: string;
  readonly cabin: AwardPricingCabin;
  readonly miles: number;
  /**
   * Every cabin the chart actually prices for this zone pair — unpriced
   * cabins are omitted keys (partial-chart honesty, like quoteAwardZone).
   */
  readonly prices: AwardChartPrices;
  readonly notes: ReadonlyArray<string>;
  readonly sourceUrls: ReadonlyArray<string>;
}

/**
 * Quote one zone-pair cell of a zone-based award chart (CI SkyTeam partner
 * award, docs/calibration-set.md §A8). Zone charts are published as an
 * unordered upper triangle — one value per region pair — so lookup matches
 * either direction (NEA→EU quotes the same cell as EU→NEA).
 *
 * Returns null for unknown products, non-zone-pair products, unknown
 * regions, and cabins the chart doesn't price (Era-2 discontinued First
 * Class). Deliberately returns AwardZonePairQuote rather than
 * AwardPriceEstimate: zone cells have no distance band {minMiles,maxMiles},
 * and keeping AwardPriceEstimate.band required preserves the existing
 * distance-band / fixed-rtw contract untouched.
 */
export function getZonePairQuote(
  catalog: AwardPricingCatalog,
  productId: string,
  fromZone: string,
  toZone: string,
  cabin: CabinId,
): AwardZonePairQuote | null {
  const product = findProduct(catalog, productId);
  if (!product || !('zoneMatrix' in product)) return null;

  const priceKey = PRICE_KEY_BY_CABIN[cabin];
  const cell = product.zoneMatrix.find(
    (candidate) =>
      (candidate.originRegion === fromZone && candidate.destinationRegion === toZone) ||
      (candidate.originRegion === toZone && candidate.destinationRegion === fromZone),
  );
  if (!cell) return null;

  const miles = cell.prices[priceKey];
  if (miles === undefined) return null;

  const prices: { -readonly [K in keyof AwardChartPrices]: AwardChartPrices[K] } = {};
  if (cell.prices.economy !== undefined) prices.economy = cell.prices.economy;
  if (cell.prices.premiumEconomy !== undefined) prices.premiumEconomy = cell.prices.premiumEconomy;
  if (cell.prices.business !== undefined) prices.business = cell.prices.business;
  if (cell.prices.first !== undefined) prices.first = cell.prices.first;

  return {
    productId,
    label: product.label,
    confidence: product.confidence,
    originRegion: cell.originRegion,
    destinationRegion: cell.destinationRegion,
    cabin,
    miles,
    prices,
    notes: product.notes ?? [],
    sourceUrls: product.sourceUrls,
  };
}

/**
 * Price a mixed-cabin itinerary at its HIGHEST booked cabin — "highest
 * class wins" (pivot plan; Cathay multi-carrier terms: pricing is based on
 * the highest class booked). Per-leg cabins raise the routing's fallback
 * cabin only upward; an unpriced highest cabin (one the product's chart
 * doesn't price at the quoted distance) yields null like any other
 * unpriced request.
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
