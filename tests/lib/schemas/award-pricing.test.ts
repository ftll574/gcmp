import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  AwardFeeScheduleSchema,
  AwardPricingCatalogSchema,
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

  test('Cathay product carries the era-pinned May-2018 fee schedule', () => {
    const cathay = catalog.products.find((p) => p.productId === 'cx-asia-miles-oneworld-multi-carrier-award');

    expect(cathay?.fees).toMatchObject({
      currency: 'HKD',
      confidence: 'community-corrected',
      asOf: '2018-05',
    });
    // PTT-sourced values stay community-corrected with at least one source.
    expect(cathay?.fees?.sourceUrls.length ?? 0).toBeGreaterThanOrEqual(1);
  });

  test('Cathay fee entry values are exact: {40/4000, 100/10000, 120/12000}', () => {
    const entries = catalog.products.find(
      (p) => p.productId === 'cx-asia-miles-oneworld-multi-carrier-award',
    )?.fees?.entries;

    expect(entries?.[0]).toEqual({ type: 'date-change', baseAmount: 40, perMiles: 4000 });
    expect(entries?.[1]).toEqual({ type: 'reissue', baseAmount: 100, perMiles: 10000 });
    expect(entries?.[2]).toEqual({ type: 'refund', baseAmount: 120, perMiles: 12000 });
  });

  test('BR and ANA products keep NO fees key (optional-key proof)', () => {
    const br = catalog.products.find((p) => p.productId === 'br-infinity-star-alliance-world-travel-award');
    const ana = catalog.products.find((p) => p.productId === 'ana-star-alliance-rtw-award');

    // Absent key — never an explicit undefined placeholder.
    expect(br && 'fees' in br).toBe(false);
    expect(ana && 'fees' in ana).toBe(false);
  });
});

describe('award fee schedule schema', () => {
  const validFees = {
    currency: 'HKD',
    confidence: 'community-corrected',
    asOf: '2018-05',
    sourceUrls: ['https://www.ptt.cc/bbs/points/M.1526375797.A.BBB'],
    entries: [{ type: 'date-change', baseAmount: 40, perMiles: 4000 }],
  };

  test('accepts a well-formed fee schedule', () => {
    expect(AwardFeeScheduleSchema.safeParse(validFees).success).toBe(true);
  });

  test('rejects a negative fee baseAmount', () => {
    const bad = { ...validFees, entries: [{ type: 'date-change', baseAmount: -1, perMiles: 4000 }] };

    expect(AwardFeeScheduleSchema.safeParse(bad).success).toBe(false);
  });

  test('rejects an unknown fee entry type', () => {
    const bad = { ...validFees, entries: [{ type: 'no-show', baseAmount: 40 }] };

    expect(AwardFeeScheduleSchema.safeParse(bad).success).toBe(false);
  });

  test('catalog rejects a product whose fees violate the schedule schema', () => {
    // Round-trip through JSON.parse keeps this untyped so the malformed
    // payload can be expressed without fighting enum inference.
    const raw = JSON.parse(readFileSync('public/data/award-pricing/current.json', 'utf8'));
    raw.products[1].fees.entries[0].baseAmount = -1;

    expect(AwardPricingCatalogSchema.safeParse(raw).success).toBe(false);
  });
});
