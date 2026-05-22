import { describe, expect, test } from 'vitest';
import { RtwRuleCatalogSchema, RtwRuleSetSchema } from '../../../src/lib/schemas/rtw-rule.ts';

describe('RtwRuleSetSchema', () => {
  test('accepts an alliance cash RTW fare rule set', () => {
    const parsed = RtwRuleSetSchema.parse({
      id: 'oneworld-explorer',
      label: 'oneworld Explorer',
      kind: 'cash-rtw-fare',
      owner: 'oneworld',
      alliance: 'oneworld',
      version: '2026.2',
      status: 'active',
      sourceUrls: ['https://www.oneworld.com/round-the-world'],
      limits: {
        minFlights: 3,
        maxFlights: 16,
        minTripDays: 10,
        maxTripMonths: 12,
      },
      geography: {
        startEnd: 'same-city',
        directionPolicy: 'east-or-west-continuous',
        requiresAtlanticCrossing: true,
        requiresPacificCrossing: true,
        oceanCrossingCount: 'at-least-once',
        pricingBasis: 'continents',
      },
      airlineEligibility: {
        type: 'alliance-members',
        alliance: 'oneworld',
      },
    });

    expect(parsed.id).toBe('oneworld-explorer');
    expect(parsed.airlineEligibility.includeAffiliates).toBe(false);
  });

  test('accepts a discontinued airline-owned RTW award with booking note', () => {
    const parsed = RtwRuleSetSchema.parse({
      id: 'ana-star-alliance-rtw-award',
      label: 'ANA Star Alliance Round the World Award',
      kind: 'award-rtw',
      owner: 'airline',
      airline: 'NH',
      alliance: 'star',
      version: '2026.2',
      status: 'discontinued',
      bookingStatusNote:
        'New Star Alliance Round the World Award tickets are no longer issued as of 2025-06-23.',
      sourceUrls: ['https://www.ana.co.jp/en/gb/amc/partner-flight-awards/around-the-world/'],
      limits: {
        maxFlights: 12,
        maxStopovers: 8,
        maxSurfaceSectors: 4,
        minTripDays: 10,
      },
      geography: {
        startEnd: 'same-country',
        directionPolicy: 'no-backtracking',
        requiresAtlanticCrossing: true,
        requiresPacificCrossing: true,
        oceanCrossingCount: 'once',
        pricingBasis: 'distance',
      },
      airlineEligibility: {
        type: 'alliance-members',
        alliance: 'star',
      },
    });

    expect(parsed.status).toBe('discontinued');
    expect(parsed.airline).toBe('NH');
  });

  test('rejects malformed airline codes', () => {
    expect(() =>
      RtwRuleSetSchema.parse({
        id: 'bad-airline',
        label: 'Bad Airline Product',
        kind: 'multi-carrier-award',
        owner: 'airline',
        airline: 'ana',
        version: '2026.2',
        status: 'active',
        sourceUrls: ['https://example.com/rules'],
        limits: {},
        geography: {
          startEnd: 'open',
          directionPolicy: 'flexible',
        },
        airlineEligibility: {
          type: 'explicit-airline-set',
          airlines: ['NH'],
        },
      }),
    ).toThrow();
  });
});

describe('RtwRuleCatalogSchema', () => {
  test('requires at least one product', () => {
    expect(() =>
      RtwRuleCatalogSchema.parse({
        version: '2026.2',
        lastVerified: '2026-05-23',
        products: [],
      }),
    ).toThrow();
  });
});
