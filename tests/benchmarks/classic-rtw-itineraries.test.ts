import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { validateRtwRoute } from '../../src/lib/rtw/validate.ts';
import { AllianceCatalogSchema } from '../../src/lib/schemas/alliance.ts';
import { CountryContinentCatalogSchema } from '../../src/lib/schemas/country-continent.ts';
import { RouteNetworkCatalogSchema } from '../../src/lib/schemas/route-network.ts';
import { RtwRuleCatalogSchema } from '../../src/lib/schemas/rtw-rule.ts';
import type { Leg } from '../../src/lib/types.ts';

const airportsRaw = JSON.parse(readFileSync('public/data/airports.json', 'utf8')) as Array<{
  iata: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  icao?: string;
}>;
const airports = new Map(airportsRaw.map((airport) => [airport.iata, airport]));
const alliances = AllianceCatalogSchema.parse(JSON.parse(readFileSync('public/data/alliances/current.json', 'utf8')));
const products = RtwRuleCatalogSchema.parse(JSON.parse(readFileSync('public/data/rtw-products/current.json', 'utf8')));
const geo = CountryContinentCatalogSchema.parse(JSON.parse(readFileSync('public/data/geo/current.json', 'utf8')));
const routes = RouteNetworkCatalogSchema.parse(JSON.parse(readFileSync('public/data/route-network/runtime-current.json', 'utf8')));
const countryContinents = new Map(geo.mappings.map((row) => [row.country, row.continent]));
const airportContinentOverrides = new Map(geo.airportOverrides.map((row) => [row.iata, row.continent]));

interface ClassicCase {
  readonly id: string;
  readonly productId: string;
  readonly sourceDistanceMiles?: number;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly legs: ReadonlyArray<Leg>;
}

const cases: ReadonlyArray<ClassicCase> = [
  {
    id: 'eva-official-example',
    productId: 'br-infinity-star-alliance-world-travel-award',
    startDate: '2026-10-01',
    endDate: '2026-10-21',
    legs: [
      { from: 'TPE', to: 'NRT', operatingCarrier: 'BR', cabin: 'business', stopover: true },
      { from: 'NRT', to: 'LAX', operatingCarrier: 'NH', cabin: 'business', stopover: true },
      { from: 'LAX', to: 'EWR', operatingCarrier: 'UA', cabin: 'business', stopover: true },
      { from: 'EWR', to: 'LHR', operatingCarrier: 'UA', cabin: 'business', stopover: true },
      { from: 'LHR', to: 'FRA', operatingCarrier: 'LH', cabin: 'business', stopover: true },
      { from: 'FRA', to: 'SIN', operatingCarrier: 'SQ', cabin: 'business', stopover: true },
      { from: 'SIN', to: 'BKK', operatingCarrier: 'TG', cabin: 'business', stopover: true },
      { from: 'BKK', to: 'TPE', operatingCarrier: 'BR', cabin: 'business', stopover: false },
    ],
  },
  {
    id: 'qantas-ticketed-2025',
    productId: 'qantas-oneworld-classic-flight-reward',
    sourceDistanceMiles: 34383,
    legs: [
      { from: 'SYD', to: 'LAX', operatingCarrier: 'QF', flightNumber: '11', cabin: 'business', stopover: true },
      { from: 'LAX', to: 'PDX', operatingCarrier: 'AA', flightNumber: '6424', cabin: 'business', stopover: true },
      { from: 'PDX', to: 'LAX', operatingCarrier: 'AA', flightNumber: '4891', cabin: 'business', stopover: false },
      { from: 'LAX', to: 'HND', operatingCarrier: 'AA', flightNumber: '27', cabin: 'economy', stopover: true },
      { from: 'HND', to: 'KIX', surface: true, stopover: false },
      { from: 'KIX', to: 'BKK', operatingCarrier: 'JL', flightNumber: '727', cabin: 'business', stopover: true },
      { from: 'BKK', to: 'HEL', operatingCarrier: 'AY', flightNumber: '142', cabin: 'business', stopover: false },
      { from: 'HEL', to: 'LHR', operatingCarrier: 'AY', flightNumber: '1339', cabin: 'business', stopover: true },
      { from: 'LHR', to: 'SIN', operatingCarrier: 'QF', flightNumber: '2', cabin: 'business', stopover: false },
      { from: 'SIN', to: 'SYD', operatingCarrier: 'QF', flightNumber: '2', cabin: 'business', stopover: false },
    ],
  },
  {
    id: 'cathay-issued-2017-multicarrier',
    productId: 'cx-asia-miles-oneworld-multi-carrier-award',
    legs: [
      { from: 'TSA', to: 'HND', operatingCarrier: 'JL', cabin: 'business', stopover: true },
      { from: 'HND', to: 'LHR', operatingCarrier: 'JL', cabin: 'first', stopover: true },
      { from: 'LHR', to: 'CDG', operatingCarrier: 'BA', cabin: 'business', stopover: true },
      { from: 'CDG', to: 'ZRH', surface: true, stopover: false },
      { from: 'ZRH', to: 'HKG', operatingCarrier: 'CX', cabin: 'first', stopover: true },
      { from: 'HKG', to: 'TPE', operatingCarrier: 'CX', cabin: 'business', stopover: false },
    ],
  },
  {
    id: 'ana-ticketed-before-discontinuation',
    productId: 'ana-star-alliance-rtw-award',
    sourceDistanceMiles: 15922,
    startDate: '2025-12-23',
    endDate: '2026-01-25',
    legs: [
      { from: 'IAD', to: 'BRU', operatingCarrier: 'UA', cabin: 'business', stopover: true },
      { from: 'BRU', to: 'IST', surface: true, stopover: false },
      { from: 'IST', to: 'HKG', operatingCarrier: 'TK', cabin: 'business', stopover: true },
      { from: 'HKG', to: 'TPE', operatingCarrier: 'BR', cabin: 'business', stopover: true },
      { from: 'TPE', to: 'KIX', operatingCarrier: 'BR', cabin: 'business', stopover: true },
      { from: 'KIX', to: 'HND', surface: true, stopover: false },
      { from: 'HND', to: 'LAX', operatingCarrier: 'NH', cabin: 'economy', stopover: false },
    ],
  },
];

function coverage(leg: Leg): 'surface' | 'operating' | 'provider-listed' | 'missing' {
  if (leg.surface === true) return 'surface';
  const row = routes.routes.find((route) => route.status === 'published'
    && route.carrier === leg.operatingCarrier
    && route.pair[0] === leg.from
    && route.pair[1] === leg.to);
  if (!row) return 'missing';
  return row.carrierIdentity === 'provider-listed' ? 'provider-listed' : 'operating';
}

describe('classic RTW itinerary benchmarks', () => {
  for (const benchmark of cases) {
    test(`${benchmark.id} validates against the current route graph`, () => {
      const product = products.products.find((candidate) => candidate.id === benchmark.productId);
      expect(product, `missing ${benchmark.productId}`).toBeDefined();
      if (!product) return;

      const result = validateRtwRoute(product, benchmark.legs, {
        airports,
        allianceCatalog: alliances,
        countryContinents,
        airportContinentOverrides,
      }, {
        ...(benchmark.startDate ? { startDate: benchmark.startDate } : {}),
        ...(benchmark.endDate ? { endDate: benchmark.endDate } : {}),
      });

      expect(result.valid).toBe(true);
      expect(result.findings.filter((finding) => finding.severity === 'fail')).toEqual([]);
      expect(benchmark.legs.map(coverage)).not.toContain('missing');

      if (benchmark.sourceDistanceMiles !== undefined) {
        expect(Math.abs(result.summary.totalDistanceMiles - benchmark.sourceDistanceMiles)).toBeLessThan(250);
      }

      if (benchmark.id === 'eva-official-example') {
        expect(result.summary.flightSegments).toBe(8);
        expect(result.summary.knownStopovers).toBe(7);
        expect(result.summary.tripDays).toBe(21);
        expect(result.summary.direction).toBe('eastbound');
        expect(result.summary.oceansCrossed).toEqual(['atlantic', 'pacific']);
        expect(benchmark.legs.map(coverage).filter((state) => state !== 'surface')).toEqual(
          Array(8).fill('operating'),
        );
      }

      if (benchmark.id === 'qantas-ticketed-2025') {
        expect(result.summary.flightSegments).toBe(9);
        expect(result.summary.surfaceSectors).toBe(1);
        expect(result.summary.knownStopovers).toBe(5);
        expect(benchmark.legs.filter((leg) => leg.surface !== true).map((leg) => leg.flightNumber)).toEqual(
          ['11', '6424', '4891', '27', '727', '142', '1339', '2', '2'],
        );
        const providerListed = benchmark.legs
          .filter((leg) => coverage(leg) === 'provider-listed')
          .map((leg) => `${leg.from}-${leg.to}`);
        expect(providerListed).toEqual(['LAX-PDX', 'PDX-LAX']);
      }

      if (benchmark.id === 'cathay-issued-2017-multicarrier') {
        expect(result.summary.flightSegments).toBe(5);
        expect(result.summary.surfaceSectors).toBe(1);
        expect(benchmark.legs.map(coverage).filter((state) => state !== 'surface')).toEqual(
          Array(5).fill('operating'),
        );
      }

      if (benchmark.id === 'ana-ticketed-before-discontinuation') {
        expect(result.summary.flightSegments).toBe(5);
        expect(result.summary.surfaceSectors).toBe(2);
        expect(result.summary.direction).toBe('eastbound');
        expect(result.summary.oceansCrossed).toEqual(['atlantic', 'pacific']);
        expect(result.findings).toEqual(expect.arrayContaining([
          expect.objectContaining({ ruleId: 'product-status', severity: 'warning' }),
        ]));
      }
    });
  }
});
