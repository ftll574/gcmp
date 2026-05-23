import { describe, expect, it } from 'vitest';
import marketProfile from '../../../public/data/markets/tw/current.json' with { type: 'json' };
import rtwProducts from '../../../public/data/rtw-products/current.json' with { type: 'json' };
import { MarketProfileSchema } from '../../../src/lib/schemas/market.ts';
import { RtwRuleCatalogSchema } from '../../../src/lib/schemas/rtw-rule.ts';
import {
  isMileageRedemptionRtwProduct,
  preferredCarrierForProduct,
  scoreRtwProduct,
  sortMileageRedemptionRtwProductsForMarket,
  sortRtwProductsForMarket,
} from '../../../src/lib/rtw/products.ts';

const market = MarketProfileSchema.parse(marketProfile);
const catalog = RtwRuleCatalogSchema.parse(rtwProducts);

describe('RTW product market helpers', () => {
  it('prioritizes Taiwan-relevant RTW products above negative programs', () => {
    const sorted = sortRtwProductsForMarket(catalog.products, market);
    expect(sorted[0]?.id).toBe('br-infinity-star-alliance-world-travel-award');
    expect(scoreRtwProduct('china-airlines-skyteam-partner-award', market)).toBeLessThan(
      scoreRtwProduct('br-infinity-star-alliance-world-travel-award', market),
    );
  });

  it('filters the planning list to mileage-redemption products only', () => {
    const sorted = sortMileageRedemptionRtwProductsForMarket(catalog.products, market);

    expect(sorted.map((product) => product.kind)).not.toContain('cash-rtw-fare');
    expect(sorted[0]?.id).toBe('br-infinity-star-alliance-world-travel-award');
    expect(sorted.some((product) => product.id === 'oneworld-explorer')).toBe(false);
    expect(sorted.some((product) => product.id === 'star-alliance-rtw-fare')).toBe(false);
    expect(catalog.products.filter(isMileageRedemptionRtwProduct).length).toBe(sorted.length);
  });

  it('chooses the owning airline as the preferred carrier for airline-owned products', () => {
    const eva = catalog.products.find((product) => product.id === 'br-infinity-star-alliance-world-travel-award');
    const cathay = catalog.products.find((product) => product.id === 'cx-asia-miles-oneworld-multi-carrier-award');

    expect(preferredCarrierForProduct(eva, market)).toBe('BR');
    expect(preferredCarrierForProduct(cathay, market)).toBe('CX');
  });

  it('falls back to a Taiwan-priority alliance carrier for alliance-owned products', () => {
    const starFare = catalog.products.find((product) => product.id === 'star-alliance-rtw-fare');
    const oneworldFare = catalog.products.find((product) => product.id === 'oneworld-explorer');

    expect(preferredCarrierForProduct(starFare, market)).toBe('BR');
    expect(preferredCarrierForProduct(oneworldFare, market)).toBe('CX');
  });
});
