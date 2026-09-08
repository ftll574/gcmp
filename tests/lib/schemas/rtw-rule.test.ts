import { describe, expect, test } from 'vitest';
import {
  RtwRuleCatalogSchema,
  RtwRuleSetSchema,
  RtwTicketingProgramSchema,
} from '../../../src/lib/schemas/rtw-rule.ts';

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

  test('defaults openJawDistancePolicy to excluded-from-distance (D3 conservative default)', () => {
    // docs/decisions/open-jaw-distance.md: absent field = pre-policy
    // behavior — open jaws never enter the priced distance.
    const parsed = RtwRuleSetSchema.parse({
      id: 'policy-default-product',
      label: 'Policy Default Product',
      kind: 'multi-carrier-award',
      owner: 'airline',
      airline: 'CX',
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
        airlines: ['CX'],
      },
    });

    expect(parsed.openJawDistancePolicy).toBe('excluded-from-distance');
  });

  test('accepts an explicit counts-toward-distance opt-in and rejects unknown policies', () => {
    const base = {
      id: 'policy-opt-in-product',
      label: 'Policy Opt-In Product',
      kind: 'multi-carrier-award',
      owner: 'airline',
      airline: 'CX',
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
        airlines: ['CX'],
      },
    };

    const parsed = RtwRuleSetSchema.parse({
      ...base,
      openJawDistancePolicy: 'counts-toward-distance',
    });
    expect(parsed.openJawDistancePolicy).toBe('counts-toward-distance');

    const excluded = RtwRuleSetSchema.parse({
      ...base,
      openJawDistancePolicy: 'excluded-from-distance',
    });
    expect(excluded.openJawDistancePolicy).toBe('excluded-from-distance');

    // Unknown policy values fail validation rather than silently defaulting.
    expect(() =>
      RtwRuleSetSchema.parse({
        ...base,
        openJawDistancePolicy: 'counts-toward-miles',
      }),
    ).toThrow();
  });

  test('accepts product-specific RTW direction and origin-country primitives', () => {
    const parsed = RtwRuleSetSchema.parse({
      id: 'advanced-rtw-product',
      label: 'Advanced RTW Product',
      kind: 'award-rtw',
      owner: 'airline',
      airline: 'OZ',
      alliance: 'star',
      version: '2026.2',
      status: 'active',
      sourceUrls: ['https://example.com/rules'],
      limits: {
        maxStopoversPerCountry: 2,
        maxVisitsPerCity: 3,
        maxOpenJaws: 1,
      },
      geography: {
        startEnd: 'same-country',
        directionPolicy: 'iata-area-continuous',
        originCountryTerminalOnly: true,
        forbidOriginCountryStopoversWhenOriginIn: ['JP'],
      },
      airlineEligibility: {
        type: 'alliance-members',
        alliance: 'star',
      },
    });

    expect(parsed.limits.maxStopoversPerCountry).toBe(2);
    expect(parsed.limits.maxVisitsPerCity).toBe(3);
    expect(parsed.limits.maxOpenJaws).toBe(1);
    expect(parsed.geography.directionPolicy).toBe('iata-area-continuous');
    expect(parsed.geography.forbidOriginCountryStopoversWhenOriginIn).toEqual(['JP']);
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

  test('defaults the ticketing reference layer for legacy catalogs', () => {
    const parsed = RtwRuleCatalogSchema.parse({
      version: '2026.2',
      lastVerified: '2026-05-23',
      products: [{
        id: 'legacy-product',
        label: 'Legacy',
        kind: 'award-rtw',
        owner: 'airline',
        airline: 'BR',
        alliance: 'star',
        version: '2026.2',
        status: 'active',
        sourceUrls: ['https://example.com/rules'],
        limits: {},
        geography: { startEnd: 'open', directionPolicy: 'flexible' },
        airlineEligibility: { type: 'alliance-members', alliance: 'star' },
      }],
    });
    expect(parsed.ticketingPrograms).toEqual([]);
  });
});

describe('RtwTicketingProgramSchema', () => {
  test('accepts a bilingual reference-only partner award', () => {
    const parsed = RtwTicketingProgramSchema.parse({
      id: 'finnair-plus-oneworld-awards',
      programName: 'Finnair Plus',
      airlines: ['AY'],
      alliance: 'oneworld',
      scope: 'partner-award',
      status: 'active',
      checkedOn: '2026-09-07',
      keyRules: [{ en: 'Partner awards are available.', zhTW: '可兌換夥伴航空獎勵票。' }],
      sourceUrls: ['https://www.finnair.com/en/finnair-plus'],
    });
    expect(parsed.airlines).toEqual(['AY']);
    expect(parsed.plannerProductId).toBeUndefined();
  });
});
