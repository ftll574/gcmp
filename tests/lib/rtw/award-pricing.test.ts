import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { estimateAwardPrice, priceRtwItinerary } from '../../../src/lib/rtw/award-pricing.ts';
import { AwardPricingCatalogSchema } from '../../../src/lib/schemas/award-pricing.ts';
import type { CabinId, Leg } from '../../../src/lib/types.ts';

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

describe('priceRtwItinerary', () => {
  // Inline fixture catalog — mixed-cabin mechanics only; real products are
  // pinned by tests above and by the calibration suite.
  const fixtureCatalog = AwardPricingCatalogSchema.parse({
    version: '2026.2',
    lastVerified: '2026-05-23',
    products: [
      {
        productId: 'fixture-rtw',
        label: 'Fixture RTW product',
        pricingModel: 'distance-band',
        confidence: 'official-fixed',
        currency: 'miles',
        sourceUrls: ['https://example.com/chart'],
        bands: [
          { minMiles: 0, maxMiles: null, prices: { economy: 100000, business: 200000, first: 400000 } },
        ],
      },
    ],
  });

  const leg = (cabin?: CabinId): Leg =>
    cabin === undefined
      ? { from: 'TPE', to: 'NRT', operatingCarrier: 'BR' }
      : { from: 'TPE', to: 'NRT', operatingCarrier: 'BR', cabin };

  test('prices a mixed itinerary at the highest booked cabin (any-F-sector → First)', () => {
    const legs: Leg[] = [leg('economy'), leg('first'), leg(undefined)];

    const estimate = priceRtwItinerary(fixtureCatalog, 'fixture-rtw', 21000, legs, 'business');

    expect(estimate?.cabin).toBe('first');
    expect(estimate?.miles).toBe(400000);
  });

  test('falls back to the routing cabin when no leg books higher', () => {
    const legs: Leg[] = [leg('economy'), leg(undefined), leg('economy')];

    const estimate = priceRtwItinerary(fixtureCatalog, 'fixture-rtw', 21000, legs, 'business');

    expect(estimate?.cabin).toBe('business');
    expect(estimate?.miles).toBe(200000);
  });

  test('premium-economy highest cabin stays unpriced (null, not a guess)', () => {
    const legs: Leg[] = [leg('economy'), leg('premium-economy')];

    const estimate = priceRtwItinerary(fixtureCatalog, 'fixture-rtw', 21000, legs, 'economy');

    expect(estimate).toBeNull();
  });
});
