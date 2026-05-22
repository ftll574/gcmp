import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { AwardPricingCatalogSchema } from '../../../src/lib/schemas/award-pricing.ts';

const catalog = AwardPricingCatalogSchema.parse(
  JSON.parse(readFileSync('public/data/award-pricing/current.json', 'utf8')),
);

describe('award pricing data', () => {
  test('validates current award pricing catalog', () => {
    expect(catalog.products).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ productId: 'br-infinity-star-alliance-world-travel-award' }),
        expect.objectContaining({ productId: 'cx-asia-miles-oneworld-multi-carrier-award' }),
      ]),
    );
  });

  test('keeps EVA fixed RTW pricing', () => {
    const eva = catalog.products.find((p) => p.productId === 'br-infinity-star-alliance-world-travel-award');

    expect(eva?.bands[0]?.prices).toEqual({
      economy: 180000,
      business: 325000,
      first: 480000,
    });
    expect(eva?.confidence).toBe('official-fixed');
  });

  test('keeps Cathay 35,001-50,000 mile top band', () => {
    const cathay = catalog.products.find((p) => p.productId === 'cx-asia-miles-oneworld-multi-carrier-award');
    const topBand = cathay?.bands.find((band) => band.minMiles === 35001);

    expect(topBand?.maxMiles).toBe(50000);
    expect(topBand?.prices.business).toBe(240000);
    expect(cathay?.confidence).toBe('reference-recheck');
  });
});
