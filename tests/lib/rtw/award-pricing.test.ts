import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { estimateAwardPrice } from '../../../src/lib/rtw/award-pricing.ts';
import { AwardPricingCatalogSchema } from '../../../src/lib/schemas/award-pricing.ts';

const catalog = AwardPricingCatalogSchema.parse(
  JSON.parse(readFileSync('public/data/award-pricing/current.json', 'utf8')),
);

describe('estimateAwardPrice', () => {
  test('returns EVA fixed business RTW price', () => {
    const estimate = estimateAwardPrice(
      catalog,
      'br-infinity-star-alliance-world-travel-award',
      24000,
      'business',
    );

    expect(estimate?.miles).toBe(325000);
    expect(estimate?.cabin).toBe('business');
    expect(estimate?.confidence).toBe('official-fixed');
  });

  test('returns Cathay distance-band price', () => {
    const estimate = estimateAwardPrice(
      catalog,
      'cx-asia-miles-oneworld-multi-carrier-award',
      19000,
      'business',
    );

    expect(estimate?.band).toEqual({ minMiles: 18001, maxMiles: 20000 });
    expect(estimate?.miles).toBe(165000);
    expect(estimate?.confidence).toBe('reference-recheck');
  });

  test('returns null for premium economy when product has no price', () => {
    const estimate = estimateAwardPrice(
      catalog,
      'cx-asia-miles-oneworld-multi-carrier-award',
      19000,
      'premium-economy',
    );

    expect(estimate).toBeNull();
  });
});
