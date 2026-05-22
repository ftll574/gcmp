import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { AllianceCatalogSchema } from '../../../src/lib/schemas/alliance.ts';
import { RtwRuleCatalogSchema } from '../../../src/lib/schemas/rtw-rule.ts';
import { validateRtwRoute } from '../../../src/lib/rtw/validate.ts';
import type { Airport, Leg } from '../../../src/lib/types.ts';

const allianceCatalog = AllianceCatalogSchema.parse(
  JSON.parse(readFileSync('public/data/alliances/current.json', 'utf8')),
);

const products = RtwRuleCatalogSchema.parse(
  JSON.parse(readFileSync('public/data/rtw-products/current.json', 'utf8')),
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
