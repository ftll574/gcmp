import { describe, expect, test } from 'vitest';
import current from '../../../public/data/award-pricing/current.json';
import { AwardPricingCatalogSchema } from '../../../src/lib/schemas/award-pricing.ts';
import { estimateAwardPrice, quoteAwardZone } from '../../../src/lib/rtw/award-pricing.ts';

const catalog = AwardPricingCatalogSchema.parse(current);
const id = 'qantas-oneworld-classic-flight-reward';
// Official oneworld table (NOT the similarly named Partner table), checked
// 2026-09-05: https://www.qantas.com/en-us/frequent-flyer/use-points/classic-flight-rewards/tables
const rows = [
  [0, 1200, 23000, 33200, 42000, 61000],
  [1201, 2400, 32200, 49800, 63000, 91400],
  [2401, 4800, 46000, 72400, 92000, 135400],
  [4801, 7200, 56400, 116400, 146800, 215600],
  [7201, 9600, 69400, 141600, 180000, 258400],
  [9601, 11600, 87000, 170000, 216000, 310400],
  [11601, 14000, 103600, 196400, 250800, 359600],
  [14001, 16800, 115600, 224400, 286000, 410000],
  [16801, 19200, 141400, 261600, 334000, 478400],
  [19201, 35000, 152200, 287000, 365800, 523200],
] as const;

describe('Qantas new-booking chart from 2025-08-05', () => {
  test.each(rows)('pins all cabins and both distance boundaries for %i–%i', (min, max, economy, premiumEconomy, business, first) => {
    for (const distance of [min, max]) {
      expect(quoteAwardZone(catalog, id, distance)?.prices).toEqual({ economy, premiumEconomy, business, first });
      expect(estimateAwardPrice(catalog, id, distance, 'premium-economy')?.miles).toBe(premiumEconomy);
    }
  });
  test('carries points, official provenance, booking applicability and per-chart verification', () => {
    expect(catalog.products.find(p => p.productId === id)).toMatchObject({
      currency: 'points', confidence: 'published-chart', bookingEffectiveFrom: '2025-08-05', verifiedOn: '2026-09-05',
    });
    expect(estimateAwardPrice(catalog, id, 25000, 'business')).toMatchObject({ miles: 365800, currency: 'points' });
    expect(quoteAwardZone(catalog, id, 25000)?.currency).toBe('points');
  });
  test('does not extrapolate a price beyond the published cap', () => {
    expect(estimateAwardPrice(catalog, id, 35001, 'business')).toBeNull();
  });
});
