/**
 * computeRouting tests using the real AA + AS program JSON files. The
 * earning numbers are chart-verified; tests assert the engine's math and
 * carrier × cabin resolution work end-to-end with real data.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { computeRouting } from '../../../src/lib/calc/index.ts';
import { ProgramSchema, type Program } from '../../../src/lib/schemas/program.ts';
import type { Airport, ProgramId, RoutingRequest } from '../../../src/lib/types.ts';

function loadProgram(file: string): Program {
  const raw = JSON.parse(readFileSync(resolve(file), 'utf8'));
  return ProgramSchema.parse(raw);
}

const aa = loadProgram('public/data/programs/aa/v2026.4.json');
const as = loadProgram('public/data/programs/as/v2026.4.json');

const AIRPORTS: ReadonlyArray<Airport> = [
  { iata: 'SFO', name: 'San Francisco', city: 'SF', country: 'US', lat: 37.619806, lon: -122.374821 },
  { iata: 'NRT', name: 'Tokyo Narita', city: 'Tokyo', country: 'JP', lat: 35.76858, lon: 140.388714 },
  { iata: 'BKK', name: 'Bangkok', city: 'Bangkok', country: 'TH', lat: 13.6811, lon: 100.747002 },
  { iata: 'HKG', name: 'Hong Kong', city: 'HK', country: 'HK', lat: 22.308901, lon: 113.915001 },
];

const airportMap = new Map(AIRPORTS.map((a) => [a.iata, a]));
const programMap = new Map<ProgramId, Program>([
  ['aa-aadvantage', aa],
  ['as-mileage-plan', as],
]);

describe('computeRouting', () => {
  test('empty legs → zero totals and per-program earning of 0', () => {
    const req: RoutingRequest = { legs: [], cabin: 'business', programs: ['aa-aadvantage'] };
    const r = computeRouting(req, { airports: airportMap, programs: programMap });
    expect(r.totalDistanceNm).toBe(0);
    expect(r.byLeg.length).toBe(0);
    expect(r.programs['aa-aadvantage']?.pqm).toBe(0);
  });

  test('SFO→NRT on AA J → AA gives 150% PQM × ~4470nm distance', () => {
    const req: RoutingRequest = {
      legs: [{ from: 'SFO', to: 'NRT', operatingCarrier: 'AA' }],
      cabin: 'business',
      programs: ['aa-aadvantage'],
    };
    const r = computeRouting(req, { airports: airportMap, programs: programMap });
    expect(r.totalDistanceNm).toBeGreaterThan(4435);
    expect(r.totalDistanceNm).toBeLessThan(4450);
    const aaProgram = r.programs['aa-aadvantage'];
    expect(aaProgram).toBeDefined();
    // AA on AA metal, J fare = 150% (1.5x) PQM/RDM in our chart.
    const expectedPqm = Math.round(r.totalDistanceNm * 1.5);
    expect(aaProgram?.pqm).toBe(expectedPqm);
    expect(aaProgram?.rdm).toBe(expectedPqm);
  });

  test('SFO→NRT on JL J → AA gives 125% PQM (JL partner J)', () => {
    const req: RoutingRequest = {
      legs: [{ from: 'SFO', to: 'NRT', operatingCarrier: 'JL' }],
      cabin: 'business',
      programs: ['aa-aadvantage'],
    };
    const r = computeRouting(req, { airports: airportMap, programs: programMap });
    const aaProgram = r.programs['aa-aadvantage'];
    expect(aaProgram?.pqm).toBe(Math.round(r.totalDistanceNm * 1.25));
  });

  test('SFO→NRT on JL J → Alaska also gives 125% (chart-verified)', () => {
    const req: RoutingRequest = {
      legs: [{ from: 'SFO', to: 'NRT', operatingCarrier: 'JL' }],
      cabin: 'business',
      programs: ['as-mileage-plan'],
    };
    const r = computeRouting(req, { airports: airportMap, programs: programMap });
    const asProgram = r.programs['as-mileage-plan'];
    expect(asProgram?.pqm).toBe(Math.round(r.totalDistanceNm * 1.25));
  });

  test('multi-leg adds up per-leg earnings', () => {
    const req: RoutingRequest = {
      legs: [
        { from: 'SFO', to: 'NRT', operatingCarrier: 'AA' },
        { from: 'NRT', to: 'BKK', operatingCarrier: 'JL' },
      ],
      cabin: 'business',
      programs: ['aa-aadvantage'],
    };
    const r = computeRouting(req, { airports: airportMap, programs: programMap });
    expect(r.byLeg.length).toBe(2);
    const expectedAA = (r.byLeg[0]?.distanceNm ?? 0) * 1.5 + (r.byLeg[1]?.distanceNm ?? 0) * 1.25;
    expect(r.programs['aa-aadvantage']?.pqm).toBe(
      Math.round((r.byLeg[0]?.distanceNm ?? 0) * 1.5) + Math.round((r.byLeg[1]?.distanceNm ?? 0) * 1.25),
    );
    // Sanity check: same magnitude.
    expect(Math.abs(r.programs['aa-aadvantage']!.pqm - expectedAA)).toBeLessThan(2);
  });

  test('multi-program comparison: J on AA, both programs queried', () => {
    const req: RoutingRequest = {
      legs: [{ from: 'SFO', to: 'NRT', operatingCarrier: 'AA' }],
      cabin: 'business',
      programs: ['aa-aadvantage', 'as-mileage-plan'],
    };
    const r = computeRouting(req, { airports: airportMap, programs: programMap });
    expect(r.programs['aa-aadvantage']).toBeDefined();
    expect(r.programs['as-mileage-plan']).toBeDefined();
    // AS on AA partner gives 125% for J in our chart.
    expect(r.programs['as-mileage-plan']?.pqm).toBe(Math.round(r.totalDistanceNm * 1.25));
  });

  test('unknown carrier → missing rule + note, not crash', () => {
    const req: RoutingRequest = {
      legs: [{ from: 'SFO', to: 'NRT', operatingCarrier: 'XX' }],
      cabin: 'business',
      programs: ['aa-aadvantage'],
    };
    const r = computeRouting(req, { airports: airportMap, programs: programMap });
    expect(r.programs['aa-aadvantage']?.pqm).toBe(0);
    expect(r.programs['aa-aadvantage']?.byLeg[0]?.missingRule).toBe(true);
    expect(r.programs['aa-aadvantage']?.byLeg[0]?.notes[0]).toContain('XX');
  });

  test('minimum-per-segment applies for AA short-haul', () => {
    // Use a short-haul leg < 500 nm — minPerSegment should kick in for AA.
    const airports = new Map([
      ['SAN', { iata: 'SAN', name: '', city: '', country: 'US', lat: 32.7335, lon: -117.1897 }],
      ['LAX', { iata: 'LAX', name: '', city: '', country: 'US', lat: 33.94250107, lon: -118.4079971 }],
    ]);
    const req: RoutingRequest = {
      legs: [{ from: 'SAN', to: 'LAX', operatingCarrier: 'AA' }],
      cabin: 'economy',
      programs: ['aa-aadvantage'],
    };
    const r = computeRouting(req, { airports, programs: programMap });
    // Real distance SAN→LAX ≈ 95 nm; AA economy Y is 1x, but min 500 → PQM = 500.
    expect(r.programs['aa-aadvantage']?.pqm).toBe(500);
  });

  test('polar route detection — LAX→DXB warns', () => {
    const airports = new Map(AIRPORTS.map((a) => [a.iata, a]));
    airports.set('LAX', { iata: 'LAX', name: '', city: '', country: 'US', lat: 33.94250107, lon: -118.4079971 });
    airports.set('DXB', { iata: 'DXB', name: '', city: '', country: 'AE', lat: 25.25279999, lon: 55.36439896 });
    const req: RoutingRequest = {
      legs: [{ from: 'LAX', to: 'DXB', operatingCarrier: 'AA' }],
      cabin: 'business',
      programs: ['aa-aadvantage'],
    };
    const r = computeRouting(req, { airports, programs: programMap });
    expect(r.warnings.some((w) => w.toLowerCase().includes('polar'))).toBe(true);
  });
});
