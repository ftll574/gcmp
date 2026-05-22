import type { AwardPricingCatalog, AwardPricingProduct } from '../schemas/award-pricing.ts';
import type { CabinId } from '../types.ts';

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

  const band = product.bands.find((candidate) => {
    const withinMin = distanceMiles >= candidate.minMiles;
    const withinMax = candidate.maxMiles === null || distanceMiles <= candidate.maxMiles;
    return withinMin && withinMax;
  });
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
