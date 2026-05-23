import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { RtwRuleCatalogSchema } from '../../../src/lib/schemas/rtw-rule.ts';

const catalog = RtwRuleCatalogSchema.parse(
  JSON.parse(readFileSync('public/data/rtw-products/current.json', 'utf8')),
);

describe('RTW products data', () => {
  test('validates the current RTW product catalog', () => {
    expect(catalog.version).toBe('2026.2');
    expect(catalog.products.length).toBeGreaterThanOrEqual(5);
  });

  test('keeps cash RTW fares as reference data, not mileage-redemption candidates', () => {
    expect(catalog.products).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'oneworld-explorer',
          kind: 'cash-rtw-fare',
          status: 'active',
          alliance: 'oneworld',
        }),
        expect.objectContaining({
          id: 'star-alliance-rtw-fare',
          kind: 'cash-rtw-fare',
          status: 'active',
          alliance: 'star',
        }),
      ]),
    );
  });

  test('includes Taiwan-first EVA and Cathay award products', () => {
    expect(catalog.products).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'br-infinity-star-alliance-world-travel-award',
          kind: 'award-rtw',
          status: 'active',
          airline: 'BR',
        }),
        expect.objectContaining({
          id: 'cx-asia-miles-oneworld-multi-carrier-award',
          kind: 'multi-carrier-award',
          status: 'active',
          airline: 'CX',
        }),
      ]),
    );
  });

  test('models Cathay oneworld Multi-carrier carrier-combination rule', () => {
    const cathay = catalog.products.find((p) => p.id === 'cx-asia-miles-oneworld-multi-carrier-award');

    expect(cathay?.limits.maxDistanceMiles).toBe(50000);
    expect(cathay?.limits.maxStopovers).toBe(5);
    expect(cathay?.limits.maxTransfers).toBe(2);
    expect(cathay?.limits.maxSurfaceSectors).toBe(2);
    expect(cathay?.carrierCombination).toEqual({
      triggerCarrier: 'CX',
      minCarriersWithoutTrigger: 2,
      minCarriersWithTrigger: 3,
    });
  });

  test('keeps ANA RTW award discontinued, not active', () => {
    expect(catalog.products).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'ana-star-alliance-rtw-award',
          kind: 'award-rtw',
          status: 'discontinued',
        }),
      ]),
    );
  });

  test('marks China Airlines as a Taiwan-important non-RTW award product', () => {
    const product = catalog.products.find((p) => p.id === 'china-airlines-skyteam-partner-award');

    expect(product?.bookingStatusNote).toContain('not a true RTW candidate');
    expect(product?.geography.directionPolicy).toBe('no-backtracking');
    expect(product?.geography.rejectsAtlanticAndPacificCrossing).toBe(true);
  });
});
