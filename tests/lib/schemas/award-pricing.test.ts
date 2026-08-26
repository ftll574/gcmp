import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  AwardPricingCatalogSchema,
  AwardPricingZonePairProductSchema,
} from '../../../src/lib/schemas/award-pricing.ts';

const catalog = AwardPricingCatalogSchema.parse(
  JSON.parse(readFileSync('public/data/award-pricing/current.json', 'utf8')),
);

describe('award pricing data', () => {
  test('validates current award pricing catalog', () => {
    expect(catalog.products).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ productId: 'br-infinity-star-alliance-world-travel-award' }),
        expect.objectContaining({ productId: 'cx-asia-miles-oneworld-multi-carrier-award' }),
        expect.objectContaining({ productId: 'qantas-oneworld-classic-flight-reward' }),
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
    expect(topBand?.prices.business).toBe(280000); // fourth era: E160/J280/F380 (§A9)
    expect(cathay?.confidence).toBe('reference-recheck');
  });
});

describe('award pricing product union (discriminated on pricingModel)', () => {
  test('validates the live catalog with the CI zone-pair product appended (A8)', () => {
    const ci = catalog.products.find((p) => p.productId === 'china-airlines-skyteam-partner-award');

    expect(ci?.pricingModel).toBe('zone-pair');
    expect(ci && 'zoneMatrix' in ci).toBe(true);
    expect(ci?.confidence).toBe('published-chart');
    expect(ci?.asOfEra).toBe('2025-10');
    if (ci && 'zoneMatrix' in ci) {
      expect(ci.zones).toEqual(['NEA', 'SEA', 'SWA', 'ME', 'EU', 'NAf', 'SAf', 'NAm', 'CAm', 'SAm', 'SWP']);
      // Upper triangle: 11 diagonal + 55 mirror-free pairs.
      expect(ci.zoneMatrix).toHaveLength(66);
      const seen = new Set<string>();
      for (const cell of ci.zoneMatrix) {
        seen.add(`${cell.originRegion}-${cell.destinationRegion}`);
        expect(Object.keys(cell.prices).sort()).toEqual(['business', 'economy', 'premiumEconomy']);
      }
      expect(seen.size).toBe(66);
    }
  });

  test('existing band-based products keep parsing under the discriminated union', () => {
    for (const id of [
      'br-infinity-star-alliance-world-travel-award',
      'cx-asia-miles-oneworld-multi-carrier-award',
      'ana-star-alliance-rtw-award',
      'qantas-oneworld-classic-flight-reward',
    ]) {
      const product = catalog.products.find((p) => p.productId === id);
      expect(product && 'bands' in product).toBe(true);
      expect(product && 'zoneMatrix' in product).toBe(false);
    }
    const br = catalog.products.find((p) => p.productId === 'br-infinity-star-alliance-world-travel-award');
    expect(br?.pricingModel).toBe('fixed-rtw');
  });

  test('rejects a zone-pair cell referencing a zone outside zones[]', () => {
    const raw = JSON.parse(readFileSync('public/data/award-pricing/current.json', 'utf8'));
    const ci = raw.products.find((p) => p.productId === 'china-airlines-skyteam-partner-award');
    ci.zoneMatrix[0].originRegion = 'XX';

    const result = AwardPricingCatalogSchema.safeParse(raw);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes("unknown zone 'XX'"))).toBe(
        true,
      );
    }
  });

  test('rejects a zone-pair product without zoneMatrix and an all-unpriced prices object', () => {
    const base = {
      productId: 'fixture-zone',
      label: 'Fixture zone-pair product',
      pricingModel: 'zone-pair',
      confidence: 'published-chart',
      currency: 'miles',
      sourceUrls: ['https://example.com/chart'],
      zones: ['AAA', 'BBB'],
    };

    // zoneMatrix is required on the zone-pair variant...
    expect(AwardPricingZonePairProductSchema.safeParse({ ...base }).success).toBe(false);
    // ...and every prices object must price at least one cabin.
    const noPrices = AwardPricingZonePairProductSchema.safeParse({
      ...base,
      zoneMatrix: [{ originRegion: 'AAA', destinationRegion: 'BBB', prices: {} }],
    });
    expect(noPrices.success).toBe(false);
    // A PE-only cell is valid — partial-chart honesty extends to PE.
    const peOnly = AwardPricingZonePairProductSchema.safeParse({
      ...base,
      asOfEra: '2025-10',
      zoneMatrix: [{ originRegion: 'AAA', destinationRegion: 'BBB', prices: { premiumEconomy: 45000 } }],
    });
    expect(peOnly.success).toBe(true);
  });

  test('rejects an unknown pricingModel and a malformed asOfEra', () => {
    const raw = JSON.parse(readFileSync('public/data/award-pricing/current.json', 'utf8'));
    raw.products[0].pricingModel = 'per-sector';

    expect(AwardPricingCatalogSchema.safeParse(raw).success).toBe(false);

    const badEra = JSON.parse(readFileSync('public/data/award-pricing/current.json', 'utf8'));
    badEra.products.find((p) => p.productId === 'china-airlines-skyteam-partner-award').asOfEra =
      '2025-10-08';

    expect(AwardPricingCatalogSchema.safeParse(badEra).success).toBe(false);
  });
});
