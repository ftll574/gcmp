import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { AllianceCatalogSchema } from '../../../src/lib/schemas/alliance.ts';
import { RtwRuleCatalogSchema } from '../../../src/lib/schemas/rtw-rule.ts';

const alliances = AllianceCatalogSchema.parse(
  JSON.parse(readFileSync('public/data/alliances/current.json', 'utf8')),
);
const rules = RtwRuleCatalogSchema.parse(
  JSON.parse(readFileSync('public/data/rtw-products/current.json', 'utf8')),
);

describe('alliance ticketing program coverage', () => {
  test('every current full oneworld, Star and SkyTeam member has a sourced ticketing reference', () => {
    const expected = { oneworld: 16, star: 26, skyteam: 18 } as const;
    for (const alliance of ['oneworld', 'star', 'skyteam'] as const) {
      const members = alliances.memberships
        .filter((membership) => membership.alliance === alliance && membership.status === 'member')
        .map((membership) => membership.airline);
      const covered = new Set(
        rules.ticketingPrograms
          .filter((program) => program.alliance === alliance)
          .flatMap((program) => program.airlines),
      );
      expect(members).toHaveLength(expected[alliance]);
      expect(members.filter((airline) => covered.has(airline))).toHaveLength(expected[alliance]);
      expect(members.filter((airline) => !covered.has(airline))).toEqual([]);
    }
  });

  test('ticketing references never cross alliance membership and planner links resolve', () => {
    const memberAlliance = new Map(
      alliances.memberships
        .filter((membership) => membership.status === 'member')
        .map((membership) => [membership.airline, membership.alliance] as const),
    );
    const productIds = new Set(rules.products.map((product) => product.id));
    const programIds = new Set<string>();
    const coveredAirlines = new Set<string>();

    for (const program of rules.ticketingPrograms) {
      expect(programIds.has(program.id)).toBe(false);
      programIds.add(program.id);
      expect(program.sourceUrls.length).toBeGreaterThan(0);
      expect(program.sourceUrls.some((url) => /(?:uat|test|beta\.)/i.test(url))).toBe(false);
      expect(program.keyRules.length).toBeGreaterThan(0);
      for (const airline of program.airlines) {
        expect(memberAlliance.get(airline)).toBe(program.alliance);
        expect(coveredAirlines.has(airline)).toBe(false);
        coveredAirlines.add(airline);
      }
      if (program.plannerProductId) {
        expect(productIds.has(program.plannerProductId)).toBe(true);
      }
    }

    expect(rules.ticketingPrograms).toHaveLength(49);
    expect(coveredAirlines.size).toBe(60);
  });

  test('researched RTW products are planner-enabled only after their special rules are expressible', () => {
    const iberia = rules.products.find((product) => product.id === 'iberia-club-oneworld-multi-carrier-award');
    expect(iberia).toMatchObject({
      airline: 'IB',
      status: 'active',
      limits: { maxFlights: 8 },
      geography: { startEnd: 'same-city', directionPolicy: 'flexible' },
      carrierCombination: { triggerCarrier: 'IB', minCarriersWithoutTrigger: 2, minCarriersWithTrigger: 2 },
    });

    const milesMore = rules.products.find((product) => product.id === 'miles-more-star-alliance-world-award-flight');
    expect(milesMore).toMatchObject({
      airline: 'LH',
      status: 'active',
      limits: { maxFlights: 10, maxStopovers: 7, minTripDays: 10, maxTripMonths: 12 },
      geography: {
        startEnd: 'same-country',
        directionPolicy: 'east-or-west-continuous',
        requiresAtlanticCrossing: true,
        requiresPacificCrossing: true,
      },
    });

    const jal = rules.ticketingPrograms.find((program) => program.id === 'jal-mileage-bank-oneworld-awards');
    const thai = rules.ticketingPrograms.find((program) => program.id === 'thai-royal-orchid-plus-star-rtw');
    const asiana = rules.ticketingPrograms.find((program) => program.id === 'asiana-club-star-rtw-transition');
    expect(jal?.scope).toBe('multi-carrier-award');
    expect(jal?.plannerProductId).toBe('jal-oneworld-award-ticket');
    expect(thai?.scope).toBe('rtw-award');
    expect(thai?.plannerProductId).toBe('thai-royal-orchid-plus-star-rtw-award');
    expect(asiana?.plannerProductId).toBe('asiana-club-star-alliance-rtw-award');

    expect(rules.products.find((product) => product.id === 'jal-oneworld-award-ticket')).toMatchObject({
      airline: 'JL',
      surfaceSectorsCountAsStopovers: true,
      limits: { maxFlights: 8, maxStopovers: 7, maxStopoversPerCity: 1, maxVisitsPerCity: 3, maxSurfaceSectors: 1 },
      geography: {
        startEnd: 'open',
        directionPolicy: 'flexible',
        originCountryTerminalOnly: true,
        originCityTerminalOnly: true,
        forbidOriginCountryStopoversWhenOriginIn: ['JP'],
      },
      carrierCombination: { minCarriersWithoutTrigger: 2, minCarriersWithTrigger: 2 },
    });
    expect(rules.products.find((product) => product.id === 'thai-royal-orchid-plus-star-rtw-award')).toMatchObject({
      airline: 'TG',
      limits: {
        minStopovers: 3,
        maxStopovers: 10,
        maxStopoversPerCity: 1,
        maxStopoversPerCountry: 2,
        maxOpenJaws: 1,
      },
      geography: {
        startEnd: 'same-country',
        directionPolicy: 'network-required-backtracking',
        forbidOriginCountryStopovers: true,
      },
    });
    expect(rules.products.find((product) => product.id === 'asiana-club-star-alliance-rtw-award')).toMatchObject({
      airline: 'OZ',
      travelEffectiveUntil: '2026-12-16',
      limits: { maxStopovers: 7, maxStopoversPerCountry: 2, minTripDays: 10 },
      geography: {
        startEnd: 'same-country',
        directionPolicy: 'iata-area-continuous',
        requiresAtlanticCrossing: true,
        requiresPacificCrossing: true,
      },
    });
  });
});
