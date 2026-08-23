import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { AllianceCatalogSchema } from '../../../src/lib/schemas/alliance.ts';
import { RtwRuleCatalogSchema } from '../../../src/lib/schemas/rtw-rule.ts';
import {
  CountryContinentCatalogSchema,
  type ContinentId,
} from '../../../src/lib/schemas/country-continent.ts';
import { continentsVisited } from '../../../src/lib/rtw/continents.ts';
import { NetworkGapCatalogSchema, type NetworkGapEntry } from '../../../src/lib/schemas/network-gaps.ts';
import { validateRtwRoute } from '../../../src/lib/rtw/validate.ts';
import type { Airport, Leg } from '../../../src/lib/types.ts';

const allianceCatalog = AllianceCatalogSchema.parse(
  JSON.parse(readFileSync('public/data/alliances/current.json', 'utf8')),
);

const products = RtwRuleCatalogSchema.parse(
  JSON.parse(readFileSync('public/data/rtw-products/current.json', 'utf8')),
);

const countryContinentsCatalog = CountryContinentCatalogSchema.parse(
  JSON.parse(readFileSync('public/data/geo/current.json', 'utf8')),
);

const countryContinents = new Map<string, ContinentId>(
  countryContinentsCatalog.mappings.map((mapping) => [mapping.country, mapping.continent]),
);

const networkGaps = NetworkGapCatalogSchema.parse(
  JSON.parse(readFileSync('public/data/network-gaps/current.json', 'utf8')),
);

const airports = new Map<string, Airport>(
  [
    { iata: 'TPE', name: 'Taipei Taoyuan', city: 'Taipei', country: 'TW', lat: 25.0797, lon: 121.2342 },
    { iata: 'NRT', name: 'Narita', city: 'Tokyo', country: 'JP', lat: 35.772, lon: 140.3929 },
    { iata: 'LAX', name: 'Los Angeles', city: 'Los Angeles', country: 'US', lat: 33.9425, lon: -118.4081 },
    { iata: 'JFK', name: 'John F. Kennedy', city: 'New York', country: 'US', lat: 40.6413, lon: -73.7781 },
    { iata: 'LHR', name: 'Heathrow', city: 'London', country: 'GB', lat: 51.47, lon: -0.4543 },
    { iata: 'LGW', name: 'Gatwick', city: 'London', country: 'GB', lat: 51.1537, lon: -0.1821 },
    { iata: 'HKG', name: 'Hong Kong', city: 'Hong Kong', country: 'HK', lat: 22.308, lon: 113.9185 },
    { iata: 'SIN', name: 'Changi', city: 'Singapore', country: 'SG', lat: 1.3644, lon: 103.9915 },
    { iata: 'BKK', name: 'Suvarnabhumi', city: 'Bangkok', country: 'TH', lat: 13.69, lon: 100.7501 },
    { iata: 'SYD', name: 'Sydney', city: 'Sydney', country: 'AU', lat: -33.9399, lon: 151.1753 },
    // Calibration Case 1 chain (docs/calibration-set.md) — continentsVisited fixture
    { iata: 'ADL', name: 'Adelaide', city: 'Adelaide', country: 'AU', lat: -34.945, lon: 138.5306 },
    { iata: 'PER', name: 'Perth', city: 'Perth', country: 'AU', lat: -31.9403, lon: 115.9669 },
    { iata: 'MEL', name: 'Melbourne', city: 'Melbourne', country: 'AU', lat: -37.669, lon: 144.841 },
    { iata: 'KUL', name: 'Kuala Lumpur', city: 'Kuala Lumpur', country: 'MY', lat: 2.7456, lon: 101.7099 },
    { iata: 'CDG', name: 'Charles de Gaulle', city: 'Paris', country: 'FR', lat: 49.0097, lon: 2.5479 },
    { iata: 'MXP', name: 'Malpensa', city: 'Milan', country: 'IT', lat: 45.6301, lon: 8.7255 },
    { iata: 'HEL', name: 'Helsinki-Vantaa', city: 'Helsinki', country: 'FI', lat: 60.3172, lon: 24.9633 },
    { iata: 'HND', name: 'Haneda', city: 'Tokyo', country: 'JP', lat: 35.5533, lon: 139.7811 },
    // Network-gap watchlist tests (calibration Case 5 root cause)
    { iata: 'GUM', name: 'Antonio B. Won Pat Intl', city: 'Tamuning', country: 'US', lat: 13.4843, lon: 144.7977 },
  ].map((airport) => [airport.iata, airport]),
);

function product(id: string) {
  const found = products.products.find((p) => p.id === id);
  if (!found) throw new Error(`Missing product ${id}`);
  return found;
}

function validate(id: string, legs: ReadonlyArray<Leg>) {
  return validateRtwRoute(product(id), legs, { airports, allianceCatalog });
}

function validateWithDates(
  id: string,
  legs: ReadonlyArray<Leg>,
  startDate: string,
  endDate: string,
) {
  return validateRtwRoute(
    product(id),
    legs,
    { airports, allianceCatalog },
    { startDate, endDate },
  );
}

describe('validateRtwRoute', () => {
  test('passes a structurally basic oneworld Explorer route using oneworld carriers', () => {
    const legs: Leg[] = [
      { from: 'TPE', to: 'NRT', operatingCarrier: 'JL' },
      { from: 'NRT', to: 'LAX', operatingCarrier: 'JL' },
      { from: 'LAX', to: 'JFK', operatingCarrier: 'AA' },
      { from: 'JFK', to: 'LHR', operatingCarrier: 'BA' },
      { from: 'LHR', to: 'HKG', operatingCarrier: 'CX' },
      { from: 'HKG', to: 'TPE', operatingCarrier: 'CX' },
    ];

    const result = validate('oneworld-explorer', legs);

    expect(result.valid).toBe(true);
    expect(result.summary.oceansCrossed).toEqual(['atlantic', 'pacific']);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'airline-eligibility', severity: 'pass' }),
        expect.objectContaining({ ruleId: 'ocean-crossings', severity: 'pass' }),
        expect.objectContaining({ ruleId: 'start-end', severity: 'pass' }),
      ]),
    );
  });

  test('fails oneworld Explorer when a non-oneworld carrier is used', () => {
    const legs: Leg[] = [
      { from: 'TPE', to: 'NRT', operatingCarrier: 'JL' },
      { from: 'NRT', to: 'LAX', operatingCarrier: 'NH' },
      { from: 'LAX', to: 'TPE', operatingCarrier: 'AA' },
    ];

    const result = validate('oneworld-explorer', legs);

    expect(result.valid).toBe(false);
    expect(result.summary.ineligibleLegIndexes).toEqual([1]);
  });

  test('fails RTW product when required Atlantic crossing is missing', () => {
    const legs: Leg[] = [
      { from: 'TPE', to: 'NRT', operatingCarrier: 'JL' },
      { from: 'NRT', to: 'LAX', operatingCarrier: 'JL' },
      { from: 'LAX', to: 'HKG', operatingCarrier: 'CX' },
      { from: 'HKG', to: 'TPE', operatingCarrier: 'CX' },
    ];

    const result = validate('oneworld-explorer', legs);

    expect(result.valid).toBe(false);
    expect(result.summary.oceansCrossed).toEqual(['pacific']);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'ocean-crossings', severity: 'fail' }),
      ]),
    );
  });

  test('fails one-direction RTW product when route mixes eastbound and westbound travel', () => {
    const legs: Leg[] = [
      { from: 'TPE', to: 'NRT', operatingCarrier: 'JL' },
      { from: 'NRT', to: 'LAX', operatingCarrier: 'JL' },
      { from: 'LAX', to: 'JFK', operatingCarrier: 'AA' },
      { from: 'JFK', to: 'LAX', operatingCarrier: 'AA' },
      { from: 'LAX', to: 'HKG', operatingCarrier: 'CX' },
      { from: 'HKG', to: 'TPE', operatingCarrier: 'CX' },
    ];

    const result = validate('oneworld-explorer', legs);

    expect(result.summary.direction).toBe('mixed');
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'direction', severity: 'fail' }),
      ]),
    );
  });

  test('passes Star Alliance RTW same-country rule for Taiwan open-jaw airports', () => {
    const legs: Leg[] = [
      { from: 'TPE', to: 'SIN', operatingCarrier: 'SQ' },
      { from: 'SIN', to: 'LHR', operatingCarrier: 'SQ' },
      { from: 'LHR', to: 'JFK', operatingCarrier: 'UA' },
      { from: 'JFK', to: 'TPE', operatingCarrier: 'UA' },
    ];

    const result = validate('star-alliance-rtw-fare', legs);

    expect(result.valid).toBe(true);
    expect(result.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ ruleId: 'start-end', severity: 'pass' })]),
    );
  });

  test('fails Qantas oneworld Classic Flight Reward when over 35,000 miles', () => {
    const legs: Leg[] = [
      { from: 'TPE', to: 'NRT', operatingCarrier: 'JL' },
      { from: 'NRT', to: 'LAX', operatingCarrier: 'JL' },
      { from: 'LAX', to: 'JFK', operatingCarrier: 'AA' },
      { from: 'JFK', to: 'LHR', operatingCarrier: 'BA' },
      { from: 'LHR', to: 'HKG', operatingCarrier: 'CX' },
      { from: 'HKG', to: 'SYD', operatingCarrier: 'QF' },
      { from: 'SYD', to: 'LAX', operatingCarrier: 'QF' },
      { from: 'LAX', to: 'JFK', operatingCarrier: 'AA' },
      { from: 'JFK', to: 'LHR', operatingCarrier: 'BA' },
      { from: 'LHR', to: 'HKG', operatingCarrier: 'CX' },
      { from: 'HKG', to: 'TPE', operatingCarrier: 'CX' },
    ];

    const result = validate('qantas-oneworld-classic-flight-reward', legs);

    expect(result.valid).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ ruleId: 'max-distance', severity: 'fail' })]),
    );
  });

  test('warns for discontinued ANA RTW award even if route is otherwise eligible', () => {
    const legs: Leg[] = [
      { from: 'TPE', to: 'SIN', operatingCarrier: 'SQ' },
      { from: 'SIN', to: 'LHR', operatingCarrier: 'SQ' },
      { from: 'LHR', to: 'JFK', operatingCarrier: 'UA' },
      { from: 'JFK', to: 'TPE', operatingCarrier: 'UA' },
    ];

    const result = validate('ana-star-alliance-rtw-award', legs);

    expect(result.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ ruleId: 'product-status', severity: 'warning' })]),
    );
  });

  test('uses stopover metadata for Star Alliance RTW stopover minimum', () => {
    const legs: Leg[] = [
      { from: 'TPE', to: 'SIN', operatingCarrier: 'SQ', stopover: true },
      { from: 'SIN', to: 'LHR', operatingCarrier: 'SQ', stopover: true },
      { from: 'LHR', to: 'JFK', operatingCarrier: 'UA', stopover: false },
      { from: 'JFK', to: 'TPE', operatingCarrier: 'UA', stopover: false },
    ];

    const result = validate('star-alliance-rtw-fare', legs);

    expect(result.summary.knownStopovers).toBe(2);
    expect(result.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ ruleId: 'stopovers', severity: 'pass' })]),
    );
  });

  test('reports unknown stopover rule when timing metadata is missing', () => {
    const legs: Leg[] = [
      { from: 'TPE', to: 'SIN', operatingCarrier: 'SQ' },
      { from: 'SIN', to: 'LHR', operatingCarrier: 'SQ' },
      { from: 'LHR', to: 'JFK', operatingCarrier: 'UA' },
      { from: 'JFK', to: 'TPE', operatingCarrier: 'UA' },
    ];

    const result = validate('star-alliance-rtw-fare', legs);

    expect(result.summary.unknownStopovers).toBe(4);
    expect(result.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ ruleId: 'stopovers', severity: 'unknown' })]),
    );
  });

  test('surface sectors do not count as flight segments or carrier eligibility failures', () => {
    const legs: Leg[] = [
      { from: 'TPE', to: 'SIN', operatingCarrier: 'SQ', stopover: true },
      { from: 'SIN', to: 'LHR', operatingCarrier: 'SQ', stopover: true },
      { from: 'LHR', to: 'JFK', operatingCarrier: 'UA', stopover: false },
      { from: 'JFK', to: 'LAX', operatingCarrier: 'ZZ', surface: true, stopover: false },
      { from: 'LAX', to: 'TPE', operatingCarrier: 'UA', stopover: false },
    ];

    const result = validate('star-alliance-rtw-fare', legs);

    expect(result.summary.flightSegments).toBe(4);
    expect(result.summary.surfaceSectors).toBe(1);
    expect(result.summary.ineligibleLegIndexes).toEqual([]);
  });

  test('passes EVA Star Alliance World Travel Award basic Taiwan-origin route', () => {
    const legs: Leg[] = [
      { from: 'TPE', to: 'SIN', operatingCarrier: 'SQ', stopover: true },
      { from: 'SIN', to: 'LHR', operatingCarrier: 'SQ', stopover: true },
      { from: 'LHR', to: 'JFK', operatingCarrier: 'UA', stopover: true },
      { from: 'JFK', to: 'TPE', operatingCarrier: 'UA', stopover: false },
    ];

    const result = validate('br-infinity-star-alliance-world-travel-award', legs);

    expect(result.valid).toBe(true);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'flight-segments', severity: 'pass' }),
        expect.objectContaining({ ruleId: 'stopovers', severity: 'pass' }),
      ]),
    );
  });

  test('fails Cathay Asia Miles multi-carrier award with CX plus only one other carrier', () => {
    const legs: Leg[] = [
      { from: 'TPE', to: 'HKG', operatingCarrier: 'CX', stopover: true },
      { from: 'HKG', to: 'LHR', operatingCarrier: 'BA', stopover: true },
      { from: 'LHR', to: 'TPE', operatingCarrier: 'CX', stopover: false },
    ];

    const result = validate('cx-asia-miles-oneworld-multi-carrier-award', legs);

    expect(result.valid).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'carrier-combination', severity: 'fail' }),
      ]),
    );
  });

  test('passes Cathay Asia Miles multi-carrier award with CX plus two other oneworld carriers', () => {
    const legs: Leg[] = [
      { from: 'TPE', to: 'HKG', operatingCarrier: 'CX', stopover: true },
      { from: 'HKG', to: 'LHR', operatingCarrier: 'BA', stopover: true },
      { from: 'LHR', to: 'NRT', operatingCarrier: 'JL', stopover: false },
      { from: 'NRT', to: 'TPE', operatingCarrier: 'CX', stopover: false },
    ];

    const result = validate('cx-asia-miles-oneworld-multi-carrier-award', legs);

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'carrier-combination', severity: 'pass' }),
      ]),
    );
  });

  test('fails China Airlines SkyTeam partner award when route crosses both oceans', () => {
    const legs: Leg[] = [
      { from: 'TPE', to: 'LAX', operatingCarrier: 'CI', stopover: true },
      { from: 'LAX', to: 'JFK', operatingCarrier: 'DL', stopover: false },
      { from: 'JFK', to: 'LHR', operatingCarrier: 'DL', stopover: false },
      { from: 'LHR', to: 'TPE', operatingCarrier: 'AF', stopover: false },
    ];

    const result = validate('china-airlines-skyteam-partner-award', legs);

    expect(result.valid).toBe(false);
    expect(result.summary.oceansCrossed).toEqual(['atlantic', 'pacific']);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'prohibited-ocean-combination', severity: 'fail' }),
      ]),
    );
  });

  test('fails Cathay Asia Miles when the same city is used for multiple stopovers', () => {
    const legs: Leg[] = [
      { from: 'TPE', to: 'HKG', operatingCarrier: 'CX', stopover: true },
      { from: 'HKG', to: 'LHR', operatingCarrier: 'BA', stopover: true },
      { from: 'LHR', to: 'JFK', operatingCarrier: 'BA', stopover: true },
      { from: 'JFK', to: 'LGW', operatingCarrier: 'AA', stopover: true },
      { from: 'LGW', to: 'TPE', operatingCarrier: 'CX', stopover: false },
    ];

    const result = validate('cx-asia-miles-oneworld-multi-carrier-award', legs);

    expect(result.summary.repeatedStopoverCities).toContain('London, GB');
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'stopovers-per-city', severity: 'fail' }),
      ]),
    );
  });

  test('fails Cathay Asia Miles when a surface endpoint city repeats', () => {
    const legs: Leg[] = [
      { from: 'TPE', to: 'HKG', operatingCarrier: 'CX', stopover: true },
      { from: 'HKG', to: 'LHR', operatingCarrier: 'BA', stopover: true },
      { from: 'LHR', to: 'LGW', operatingCarrier: 'BA', surface: true, stopover: false },
      { from: 'LGW', to: 'JFK', operatingCarrier: 'BA', stopover: true },
      { from: 'JFK', to: 'LHR', operatingCarrier: 'AA', stopover: false },
      { from: 'LHR', to: 'TPE', operatingCarrier: 'CX', stopover: false },
    ];

    const result = validate('cx-asia-miles-oneworld-multi-carrier-award', legs);

    expect(result.summary.repeatedSurfaceCities).toContain('London, GB');
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'surface-cities', severity: 'fail' }),
      ]),
    );
  });

  test('passes Qantas Classic Flight Reward when one city call hits exactly two transfers', () => {
    // docs/rtw-pivot-plan.md:147 "Only two transfers in any one city" —
    // boundary: two arrivals into Tokyo inside ONE call (flight + surface)
    // sit exactly AT the cap and must stay green.
    const legs: Leg[] = [
      { from: 'TPE', to: 'NRT', operatingCarrier: 'JL', stopover: false },
      { from: 'NRT', to: 'HND', operatingCarrier: 'ZZ', surface: true, stopover: false },
      { from: 'HND', to: 'LAX', operatingCarrier: 'AA', stopover: true },
      { from: 'LAX', to: 'TPE', operatingCarrier: 'CX', stopover: false },
    ];

    const result = validate('qantas-oneworld-classic-flight-reward', legs);

    expect(result.summary.repeatedTransferCities).toEqual([]);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'transfers-per-city',
          severity: 'pass',
          messageParams: { max: 2, cities: '' },
        }),
      ]),
    );
    expect(result.valid).toBe(true);
  });

  test('fails Qantas Classic Flight Reward when one city call exceeds two transfers', () => {
    const legs: Leg[] = [
      { from: 'TPE', to: 'NRT', operatingCarrier: 'JL', stopover: false },
      { from: 'NRT', to: 'HND', operatingCarrier: 'ZZ', surface: true, stopover: false },
      { from: 'HND', to: 'NRT', operatingCarrier: 'ZZ', surface: true, stopover: false },
      { from: 'NRT', to: 'HKG', operatingCarrier: 'CX', stopover: false },
      { from: 'HKG', to: 'TPE', operatingCarrier: 'CX', stopover: false },
    ];

    const result = validate('qantas-oneworld-classic-flight-reward', legs);

    expect(result.summary.repeatedTransferCities).toEqual(['Tokyo, JP']);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'transfers-per-city',
          severity: 'fail',
          messageKey: 'rtw.findings.transfersPerCityFail',
        }),
      ]),
    );
    expect(result.valid).toBe(false);
  });

  test('stopover-marked arrivals do not count toward transfers-per-city', () => {
    const legs: Leg[] = [
      { from: 'TPE', to: 'HND', operatingCarrier: 'JL', stopover: true },
      { from: 'HND', to: 'NRT', operatingCarrier: 'ZZ', surface: true, stopover: false },
      { from: 'NRT', to: 'HKG', operatingCarrier: 'CX', stopover: false },
      { from: 'HKG', to: 'TPE', operatingCarrier: 'CX', stopover: false },
    ];

    const result = validate('qantas-oneworld-classic-flight-reward', legs);

    expect(result.summary.knownStopovers).toBe(1);
    expect(result.summary.repeatedTransferCities).toEqual([]);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'transfers-per-city', severity: 'pass' }),
      ]),
    );
  });

  test('separate city calls restart the transfer count instead of accumulating', () => {
    // Tokyo sees three unmarked arrivals across TWO calls (NRT+HND, later
    // NRT alone); per-call semantics keep every call at or below the cap,
    // whereas whole-itinerary accumulation would wrongly fail at three.
    const legs: Leg[] = [
      { from: 'TPE', to: 'NRT', operatingCarrier: 'JL', stopover: false },
      { from: 'NRT', to: 'HND', operatingCarrier: 'ZZ', surface: true, stopover: false },
      { from: 'HND', to: 'SIN', operatingCarrier: 'CX', stopover: false },
      { from: 'SIN', to: 'NRT', operatingCarrier: 'CX', stopover: false },
      { from: 'NRT', to: 'TPE', operatingCarrier: 'CX', stopover: false },
    ];

    const result = validate('qantas-oneworld-classic-flight-reward', legs);

    expect(result.summary.repeatedTransferCities).toEqual([]);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'transfers-per-city', severity: 'pass' }),
      ]),
    );
    expect(result.valid).toBe(true);
  });

  test('unmarked arrivals count toward transfers-per-city even on surface sectors', () => {
    // Consistent with stopover counting: every resolved arrival without
    // stopover=true is a potential transfer, including surface sectors and
    // legs whose timing metadata is still unknown.
    const legs: Leg[] = [
      { from: 'TPE', to: 'NRT', operatingCarrier: 'JL' },
      { from: 'NRT', to: 'HND', operatingCarrier: 'ZZ', surface: true },
      { from: 'HND', to: 'NRT', operatingCarrier: 'ZZ', surface: true },
      { from: 'NRT', to: 'HKG', operatingCarrier: 'CX' },
      { from: 'HKG', to: 'TPE', operatingCarrier: 'CX' },
    ];

    const result = validate('qantas-oneworld-classic-flight-reward', legs);

    expect(result.summary.unknownStopovers).toBe(3); // non-surface legs only
    expect(result.summary.repeatedTransferCities).toEqual(['Tokyo, JP']);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'transfers-per-city', severity: 'fail' }),
      ]),
    );
    expect(result.valid).toBe(false);
  });

  test('fails EVA Star Alliance World Travel Award when trip is shorter than 10 days', () => {
    const legs: Leg[] = [
      { from: 'TPE', to: 'SIN', operatingCarrier: 'SQ', stopover: true },
      { from: 'SIN', to: 'LHR', operatingCarrier: 'SQ', stopover: true },
      { from: 'LHR', to: 'JFK', operatingCarrier: 'UA', stopover: true },
      { from: 'JFK', to: 'TPE', operatingCarrier: 'UA', stopover: false },
    ];

    const result = validateWithDates(
      'br-infinity-star-alliance-world-travel-award',
      legs,
      '2026-09-01',
      '2026-09-05',
    );

    expect(result.summary.tripDays).toBe(5);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'trip-duration', severity: 'fail' }),
      ]),
    );
  });

  test('passes EVA Star Alliance World Travel Award duration at 10 days', () => {
    const legs: Leg[] = [
      { from: 'TPE', to: 'SIN', operatingCarrier: 'SQ', stopover: true },
      { from: 'SIN', to: 'LHR', operatingCarrier: 'SQ', stopover: true },
      { from: 'LHR', to: 'JFK', operatingCarrier: 'UA', stopover: true },
      { from: 'JFK', to: 'TPE', operatingCarrier: 'UA', stopover: false },
    ];

    const result = validateWithDates(
      'br-infinity-star-alliance-world-travel-award',
      legs,
      '2026-09-01',
      '2026-09-10',
    );

    expect(result.summary.tripDays).toBe(10);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'trip-duration', severity: 'pass' }),
      ]),
    );
  });
});

describe('validateRtwRoute · summary.continentsVisited', () => {
  const worldLegs: Leg[] = [
    { from: 'TPE', to: 'NRT', operatingCarrier: 'JL' },
    { from: 'NRT', to: 'LAX', operatingCarrier: 'JL' },
    { from: 'LAX', to: 'JFK', operatingCarrier: 'AA' },
    { from: 'JFK', to: 'LHR', operatingCarrier: 'BA' },
    { from: 'LHR', to: 'HKG', operatingCarrier: 'CX' },
    { from: 'HKG', to: 'TPE', operatingCarrier: 'CX' },
  ];

  function validateWithGeo(id: string, legs: ReadonlyArray<Leg>) {
    return validateRtwRoute(product(id), legs, { airports, allianceCatalog, countryContinents });
  }

  test('summary carries first-visit-order continents equal to the helper output', () => {
    const result = validateWithGeo('oneworld-explorer', worldLegs);

    // TPE/NRT/HKG asia → LAX/JFK north-america → LHR europe; closing via HKG/TPE adds nothing.
    expect(result.summary.continentsVisited).toEqual(['asia', 'north-america', 'europe']);
    expect(result.summary.continentsVisited).toEqual(
      continentsVisited(worldLegs, { airports, countryContinents }),
    );

    // Field order mirrors docs/rtw-pivot-plan.md: continentsVisited precedes oceansCrossed.
    const keys = Object.keys(result.summary);
    expect(keys.indexOf('continentsVisited')).toBeLessThan(keys.indexOf('oceansCrossed'));
  });

  test('absent countryContinents falls back to [] and changes nothing else (backward compat)', () => {
    const withoutGeo = validateRtwRoute(product('oneworld-explorer'), worldLegs, { airports, allianceCatalog });
    const withGeo = validateWithGeo('oneworld-explorer', worldLegs);

    expect(withoutGeo.summary.continentsVisited).toEqual([]);
    const merged = { ...withoutGeo.summary, continentsVisited: withGeo.summary.continentsVisited };
    expect(merged).toEqual(withGeo.summary);
    expect(withoutGeo.valid).toBe(withGeo.valid);
    expect(withoutGeo.findings).toEqual(withGeo.findings);
  });

  test('surface sector endpoints count as visited while contributing no ocean crossing', () => {
    const legs: Leg[] = [{ from: 'LHR', to: 'JFK', operatingCarrier: 'BA', surface: true }];
    const result = validateWithGeo('oneworld-explorer', legs);

    expect(result.summary.continentsVisited).toEqual(['europe', 'north-america']);
    expect(result.summary.oceansCrossed).toEqual([]);
  });

  test('airportContinentOverrides flow through validateRtwRoute (spec §8 Q5)', () => {
    // Overriding JFK to oceania flips north-america without touching data files.
    const legs: Leg[] = [{ from: 'TPE', to: 'JFK', operatingCarrier: 'BR' }];
    const result = validateRtwRoute(product('oneworld-explorer'), legs, {
      airports,
      allianceCatalog,
      countryContinents,
      airportContinentOverrides: new Map<string, ContinentId>([['JFK', 'oceania']]),
    });

    expect(result.summary.continentsVisited).toEqual(['asia', 'oceania']);
  });

  test('calibration Case 1 routing yields oceania → asia → europe in first-visit order', () => {
    // Verbatim chain from tests/calibration/flyertalk-routings.test.ts CASE1_FLOWN
    // (Point Hacks thread): two open jaws CDG⇢MXP and HND⇢NRT modeled as surface.
    const case1Legs: Leg[] = [
      { from: 'ADL', to: 'PER', operatingCarrier: 'QF', stopover: false },
      { from: 'PER', to: 'KUL', operatingCarrier: 'MH', stopover: false },
      { from: 'KUL', to: 'CDG', operatingCarrier: 'MH', stopover: false },
      { from: 'CDG', to: 'MXP', operatingCarrier: 'ZZ', surface: true, stopover: false },
      { from: 'MXP', to: 'HEL', operatingCarrier: 'AY', stopover: false },
      { from: 'HEL', to: 'HND', operatingCarrier: 'AY', stopover: false },
      { from: 'HND', to: 'NRT', operatingCarrier: 'ZZ', surface: true, stopover: false },
      { from: 'NRT', to: 'HKG', operatingCarrier: 'JL', stopover: false },
      { from: 'HKG', to: 'KUL', operatingCarrier: 'MH', stopover: false },
      { from: 'KUL', to: 'PER', operatingCarrier: 'MH', stopover: false },
      { from: 'PER', to: 'MEL', operatingCarrier: 'QF', stopover: false },
    ];
    const result = validateWithGeo('qantas-oneworld-classic-flight-reward', case1Legs);

    expect(result.summary.continentsVisited).toEqual(['oceania', 'asia', 'europe']);
    expect(result.summary.continentsVisited).toEqual(
      continentsVisited(case1Legs, { airports, countryContinents }),
    );
  });
});

describe('validateRtwRoute — network-gap watchlist warnings', () => {
  // Local fixtures mirroring public/data/network-gaps/current.json shapes;
  // the real catalog is pinned by the integration anchor at the bottom.
  const openGap: NetworkGapEntry = {
    carrier: 'BR',
    pair: ['TPE', 'GUM'],
    status: 'not-flown',
    since: '2017-06',
    until: null,
    action: 'warn',
    confidence: 'chart-verified',
    evidence: ['https://example.com/br-gum-ceased'],
  };
  const closedGap: NetworkGapEntry = { ...openGap, carrier: 'UA', since: '2005', until: '2025-04' };

  function validateWithGaps(
    legs: ReadonlyArray<Leg>,
    gaps: ReadonlyArray<NetworkGapEntry>,
    request?: { startDate?: string; endDate?: string },
  ) {
    return validateRtwRoute(
      product('br-infinity-star-alliance-world-travel-award'),
      legs,
      { airports, allianceCatalog, networkGaps: gaps },
      request?.startDate !== undefined && request?.endDate !== undefined
        ? { startDate: request.startDate, endDate: request.endDate }
        : undefined,
    );
  }

  function gapFindings(result: ReturnType<typeof validateRtwRoute>) {
    return result.findings.filter((f) => f.ruleId === 'network-gap');
  }

  test('open gap warns with evidence and the affected leg index', () => {
    const result = validateWithGaps(
      [{ from: 'TPE', to: 'GUM', operatingCarrier: 'BR', stopover: false }],
      [openGap],
      { startDate: '2026-09-01', endDate: '2026-09-11' },
    );

    // NOTE: a bare one-leg fixture trips unrelated BR structural rules
    // (required ocean crossings / direction) — validity is asserted on the
    // full compliant loop in the integration anchor below. Here we pin the
    // network-gap finding itself.
    const gaps = gapFindings(result);
    expect(gaps.length).toBe(1);
    expect(gaps[0]?.severity).toBe('warning');
    expect(gaps[0]?.messageKey).toBe('rtw.findings.networkGapOpen');
    expect(gaps[0]?.affectedLegIndexes).toEqual([0]);
    expect(gaps[0]?.sourceUrl).toBe('https://example.com/br-gum-ceased');
    expect(gaps[0]?.message).toContain('does not operate TPE-GUM');
    expect(gaps[0]?.messageParams?.carrier).toBe('BR');
  });

  test('closed gap is silent once until < trip start (resumption honored)', () => {
    // UA resumed TPE–GUM in 2025-04; a 2026 trip must not warn.
    const result = validateWithGaps(
      [{ from: 'TPE', to: 'GUM', operatingCarrier: 'UA', stopover: false }],
      [closedGap],
      { startDate: '2026-09-01', endDate: '2026-09-11' },
    );
    expect(gapFindings(result)).toEqual([]);
  });

  test('closed gap warns inside its window with until params', () => {
    const result = validateWithGaps(
      [{ from: 'TPE', to: 'GUM', operatingCarrier: 'UA', stopover: false }],
      [closedGap],
      { startDate: '2024-03-01', endDate: '2024-03-10' },
    );

    const gaps = gapFindings(result);
    expect(gaps.length).toBe(1);
    expect(gaps[0]?.messageKey).toBe('rtw.findings.networkGapUntil');
    expect(gaps[0]?.messageParams?.until).toBe('2025-04');
    expect(gaps[0]?.message).toContain('between 2005 and 2025-04');
  });

  test('window edges are inclusive on both ends (YYYY entries normalize to YYYY-MM)', () => {
    // since='2017-06' → a June 2017 departure warns, May does not.
    const june = validateWithGaps(
      [{ from: 'TPE', to: 'GUM', operatingCarrier: 'BR', stopover: false }],
      [openGap],
      { startDate: '2017-06-01', endDate: '2017-06-30' },
    );
    expect(gapFindings(june).length).toBe(1);

    const may = validateWithGaps(
      [{ from: 'TPE', to: 'GUM', operatingCarrier: 'BR', stopover: false }],
      [openGap],
      { startDate: '2017-05-01', endDate: '2017-05-31' },
    );
    expect(gapFindings(may)).toEqual([]);
  });

  test('trips without dates conservatively see every entry — even closed gaps', () => {
    const result = validateWithGaps(
      [{ from: 'TPE', to: 'GUM', operatingCarrier: 'UA', stopover: false }],
      [closedGap],
    );
    const gaps = gapFindings(result);
    expect(gaps.length).toBe(1);
    expect(gaps[0]?.messageKey).toBe('rtw.findings.networkGapUntil');
  });

  test('pair matching is direction-agnostic (declared pair either way)', () => {
    const result = validateWithGaps(
      [{ from: 'GUM', to: 'TPE', operatingCarrier: 'BR', stopover: false }],
      [openGap],
      { startDate: '2026-09-01', endDate: '2026-09-11' },
    );
    expect(gapFindings(result).length).toBe(1);
  });

  test('other carriers flying the same pair are not flagged', () => {
    const result = validateWithGaps(
      [
        { from: 'TPE', to: 'GUM', operatingCarrier: 'CI', stopover: false },
        { from: 'GUM', to: 'TPE', operatingCarrier: 'CI', stopover: false },
      ],
      [openGap, closedGap],
      { startDate: '2026-09-01', endDate: '2026-09-11' },
    );
    expect(gapFindings(result)).toEqual([]);
  });

  test('multiple matching legs dedupe into ONE finding listing every leg index', () => {
    const result = validateWithGaps(
      [
        { from: 'TPE', to: 'GUM', operatingCarrier: 'BR', stopover: true },
        { from: 'GUM', to: 'TPE', operatingCarrier: 'BR', stopover: false },
      ],
      [openGap],
      { startDate: '2026-09-01', endDate: '2026-09-11' },
    );

    const gaps = gapFindings(result);
    expect(gaps.length).toBe(1);
    expect(gaps[0]?.affectedLegIndexes).toEqual([0, 1]);
  });

  test('surface sectors never match the watchlist', () => {
    const result = validateWithGaps(
      [{ from: 'TPE', to: 'GUM', operatingCarrier: 'BR', surface: true, stopover: false }],
      [openGap],
      { startDate: '2026-09-01', endDate: '2026-09-11' },
    );
    expect(gapFindings(result)).toEqual([]);
  });

  test('integration anchor: real watchlist flags BR but suppresses resumed UA on a mixed-carrier loop', () => {
    // Mirrors calibration calib.sta-eligibility.br-gum-network-gap-warns:
    // UA's JFK-GUM leg does not match UA's TPE-GUM entry at all, and UA's
    // gap closed 2025-04 anyway; only the BR GUM-TPE sector warns.
    const legs: Leg[] = [
      { from: 'TPE', to: 'BKK', operatingCarrier: 'BR', stopover: false },
      { from: 'BKK', to: 'LHR', operatingCarrier: 'BR', stopover: true },
      { from: 'LHR', to: 'JFK', operatingCarrier: 'UA', stopover: true },
      { from: 'JFK', to: 'GUM', operatingCarrier: 'UA', stopover: false },
      { from: 'GUM', to: 'TPE', operatingCarrier: 'BR', stopover: false },
    ];
    const result = validateRtwRoute(
      product('br-infinity-star-alliance-world-travel-award'),
      legs,
      { airports, allianceCatalog, networkGaps: networkGaps.gaps },
      { startDate: '2026-09-01', endDate: '2026-09-11' },
    );

    const gaps = gapFindings(result);
    expect(gaps.length).toBe(1);
    expect(gaps[0]?.messageKey).toBe('rtw.findings.networkGapOpen');
    expect(gaps[0]?.affectedLegIndexes).toEqual([4]);
  });
});
