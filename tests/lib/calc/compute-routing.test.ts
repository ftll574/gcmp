/**
 * computeRouting tests using the real AA + AS program JSON. v0.4: tests
 * the multi-group result shape.
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
  { iata: 'JFK', name: 'New York JFK', city: 'NYC', country: 'US', lat: 40.6, lon: -73.8 },
  { iata: 'LHR', name: 'London Heathrow', city: 'London', country: 'GB', lat: 51.5, lon: -0.5 },
];

const airportMap = new Map(AIRPORTS.map((a) => [a.iata, a]));
const programMap = new Map<ProgramId, Program>([
  ['aa-aadvantage', aa],
  ['as-mileage-plan', as],
]);

describe('computeRouting (single-group)', () => {
  test('empty groups → grand totals all zero', () => {
    const req: RoutingRequest = {
      groups: [{ legs: [] }],
      cabin: 'business',
      programs: ['aa-aadvantage'],
    };
    const r = computeRouting(req, { airports: airportMap, programs: programMap });
    expect(r.grandTotalDistanceNm).toBe(0);
    expect(r.groups[0]?.byLeg.length).toBe(0);
    expect(r.grandTotals['aa-aadvantage']?.pqm).toBe(0);
  });

  test('SFO→NRT on AA J gives ~150% PQM × distance', () => {
    const req: RoutingRequest = {
      groups: [{ legs: [{ from: 'SFO', to: 'NRT', operatingCarrier: 'AA' }] }],
      cabin: 'business',
      programs: ['aa-aadvantage'],
    };
    const r = computeRouting(req, { airports: airportMap, programs: programMap });
    expect(r.grandTotalDistanceNm).toBeGreaterThan(4435);
    expect(r.grandTotalDistanceNm).toBeLessThan(4450);
    const aaProgram = r.groups[0]?.programs['aa-aadvantage'];
    const expectedPqm = Math.round(r.grandTotalDistanceNm * 1.5);
    expect(aaProgram?.pqm).toBe(expectedPqm);
    expect(r.grandTotals['aa-aadvantage']?.pqm).toBe(expectedPqm);
  });

  test('SFO→NRT on JL → AA AAdvantage gives 125% PQM (JL partner J)', () => {
    const req: RoutingRequest = {
      groups: [{ legs: [{ from: 'SFO', to: 'NRT', operatingCarrier: 'JL' }] }],
      cabin: 'business',
      programs: ['aa-aadvantage'],
    };
    const r = computeRouting(req, { airports: airportMap, programs: programMap });
    expect(r.groups[0]?.programs['aa-aadvantage']?.pqm).toBe(
      Math.round(r.grandTotalDistanceNm * 1.25),
    );
  });

  test('SFO→NRT on JL → Alaska also 125%', () => {
    const req: RoutingRequest = {
      groups: [{ legs: [{ from: 'SFO', to: 'NRT', operatingCarrier: 'JL' }] }],
      cabin: 'business',
      programs: ['as-mileage-plan'],
    };
    const r = computeRouting(req, { airports: airportMap, programs: programMap });
    expect(r.groups[0]?.programs['as-mileage-plan']?.pqm).toBe(
      Math.round(r.grandTotalDistanceNm * 1.25),
    );
  });

  test('multi-leg sums per-leg earnings', () => {
    const req: RoutingRequest = {
      groups: [
        {
          legs: [
            { from: 'SFO', to: 'NRT', operatingCarrier: 'AA' },
            { from: 'NRT', to: 'BKK', operatingCarrier: 'JL' },
          ],
        },
      ],
      cabin: 'business',
      programs: ['aa-aadvantage'],
    };
    const r = computeRouting(req, { airports: airportMap, programs: programMap });
    expect(r.groups[0]?.byLeg.length).toBe(2);
    const leg1Dist = r.groups[0]!.byLeg[0]?.distanceNm ?? 0;
    const leg2Dist = r.groups[0]!.byLeg[1]?.distanceNm ?? 0;
    expect(r.groups[0]?.programs['aa-aadvantage']?.pqm).toBe(
      Math.round(leg1Dist * 1.5) + Math.round(leg2Dist * 1.25),
    );
  });

  test('unknown carrier → missing rule, doesn\'t crash', () => {
    const req: RoutingRequest = {
      groups: [{ legs: [{ from: 'SFO', to: 'NRT', operatingCarrier: 'XX' }] }],
      cabin: 'business',
      programs: ['aa-aadvantage'],
    };
    const r = computeRouting(req, { airports: airportMap, programs: programMap });
    expect(r.groups[0]?.programs['aa-aadvantage']?.pqm).toBe(0);
    expect(r.groups[0]?.programs['aa-aadvantage']?.byLeg[0]?.missingRule).toBe(true);
  });

  test('minPerSegment applies for AA short-haul', () => {
    const airports = new Map([
      ['SAN', { iata: 'SAN', name: '', city: '', country: 'US', lat: 32.7335, lon: -117.1897 }],
      ['LAX', { iata: 'LAX', name: '', city: '', country: 'US', lat: 33.94250107, lon: -118.4079971 }],
    ]);
    const req: RoutingRequest = {
      groups: [{ legs: [{ from: 'SAN', to: 'LAX', operatingCarrier: 'AA' }] }],
      cabin: 'economy',
      programs: ['aa-aadvantage'],
    };
    const r = computeRouting(req, { airports, programs: programMap });
    expect(r.groups[0]?.programs['aa-aadvantage']?.pqm).toBe(500);
  });

  test('polar route detection — LAX→DXB warns', () => {
    const airports = new Map(AIRPORTS.map((a) => [a.iata, a]));
    airports.set('LAX', { iata: 'LAX', name: '', city: '', country: 'US', lat: 33.94250107, lon: -118.4079971 });
    airports.set('DXB', { iata: 'DXB', name: '', city: '', country: 'AE', lat: 25.25279999, lon: 55.36439896 });
    const req: RoutingRequest = {
      groups: [{ legs: [{ from: 'LAX', to: 'DXB', operatingCarrier: 'AA' }] }],
      cabin: 'business',
      programs: ['aa-aadvantage'],
    };
    const r = computeRouting(req, { airports, programs: programMap });
    expect(r.groups[0]?.warnings.some((w) => w.toLowerCase().includes('polar'))).toBe(true);
  });
});

describe('computeRouting (multi-group)', () => {
  test('grand totals sum across groups', () => {
    const req: RoutingRequest = {
      groups: [
        { legs: [{ from: 'SFO', to: 'NRT', operatingCarrier: 'AA' }] },
        { legs: [{ from: 'JFK', to: 'LHR', operatingCarrier: 'BA' }] },
      ],
      cabin: 'business',
      programs: ['aa-aadvantage'],
    };
    const r = computeRouting(req, { airports: airportMap, programs: programMap });
    expect(r.groups.length).toBe(2);
    const g0pqm = r.groups[0]?.programs['aa-aadvantage']?.pqm ?? 0;
    const g1pqm = r.groups[1]?.programs['aa-aadvantage']?.pqm ?? 0;
    expect(r.grandTotals['aa-aadvantage']?.pqm).toBe(g0pqm + g1pqm);
    const g0Dist = r.groups[0]?.totalDistanceNm ?? 0;
    const g1Dist = r.groups[1]?.totalDistanceNm ?? 0;
    expect(Math.abs(r.grandTotalDistanceNm - (g0Dist + g1Dist))).toBeLessThan(0.001);
  });

  test('comparing direct vs connection: shorter direct, longer connection', () => {
    // SFO→HKG direct (~5800nm) vs SFO→NRT→HKG (longer due to detour)
    const req: RoutingRequest = {
      groups: [
        // Direct SFO-HKG
        { legs: [{ from: 'SFO', to: 'HKG', operatingCarrier: 'CX' }] },
        // Via NRT
        {
          legs: [
            { from: 'SFO', to: 'NRT', operatingCarrier: 'JL' },
            { from: 'NRT', to: 'HKG', operatingCarrier: 'CX' },
          ],
        },
      ],
      cabin: 'business',
      programs: ['aa-aadvantage'],
    };
    const r = computeRouting(req, { airports: airportMap, programs: programMap });
    const direct = r.groups[0]?.totalDistanceNm ?? 0;
    const viaNrt = r.groups[1]?.totalDistanceNm ?? 0;
    expect(direct).toBeGreaterThan(0);
    expect(viaNrt).toBeGreaterThan(direct);
  });

  test('per-group warnings stay scoped to that group', () => {
    const airports = new Map(AIRPORTS.map((a) => [a.iata, a]));
    airports.set('LAX', { iata: 'LAX', name: '', city: '', country: 'US', lat: 33.94, lon: -118.4 });
    airports.set('DXB', { iata: 'DXB', name: '', city: '', country: 'AE', lat: 25.25, lon: 55.36 });
    const req: RoutingRequest = {
      groups: [
        { legs: [{ from: 'LAX', to: 'DXB', operatingCarrier: 'AA' }] },   // polar
        { legs: [{ from: 'SFO', to: 'NRT', operatingCarrier: 'AA' }] },   // not polar
      ],
      cabin: 'business',
      programs: ['aa-aadvantage'],
    };
    const r = computeRouting(req, { airports, programs: programMap });
    expect(r.groups[0]?.warnings.some((w) => w.includes('polar'))).toBe(true);
    expect(r.groups[1]?.warnings.some((w) => w.includes('polar'))).toBe(false);
  });
});

describe('elite tier bonus (v1.9)', () => {
  const baseReq: RoutingRequest = {
    groups: [{ legs: [{ from: 'SFO', to: 'NRT', operatingCarrier: 'AA' }] }],
    cabin: 'business',
    programs: ['aa-aadvantage'],
  };

  test('no tier → rdm equals rdmBase, tierBonus = 0', () => {
    const r = computeRouting(baseReq, { airports: airportMap, programs: programMap });
    const e = r.groups[0]?.programs['aa-aadvantage'];
    expect(e?.tierBonus).toBe(0);
    expect(e?.rdm).toBe(e?.rdmBase);
  });

  test('top tier → +100% on RDM, PQM unchanged', () => {
    const baseRes = computeRouting(baseReq, { airports: airportMap, programs: programMap });
    const topRes = computeRouting({ ...baseReq, tier: 'top' }, { airports: airportMap, programs: programMap });
    const baseE = baseRes.groups[0]?.programs['aa-aadvantage'];
    const topE = topRes.groups[0]?.programs['aa-aadvantage'];
    expect(topE?.tierBonus).toBe(1.0);
    expect(topE?.pqm).toBe(baseE?.pqm);
    expect(topE?.rdm).toBeCloseTo((baseE?.rdm ?? 0) * 2, 0);
  });

  test('mid tier → +25%', () => {
    const r = computeRouting(
      { ...baseReq, tier: 'mid' },
      { airports: airportMap, programs: programMap },
    );
    const e = r.groups[0]?.programs['aa-aadvantage'];
    expect(e?.tierBonus).toBe(0.25);
    expect(e?.rdm).toBeCloseTo((e?.rdmBase ?? 0) * 1.25, 0);
  });

  test('AA is flagged revenue-based; AS is not', () => {
    const r = computeRouting(
      { ...baseReq, programs: ['aa-aadvantage', 'as-mileage-plan'] },
      { airports: airportMap, programs: programMap },
    );
    expect(r.groups[0]?.programs['aa-aadvantage']?.revenueBased).toBe(true);
    expect(r.groups[0]?.programs['as-mileage-plan']?.revenueBased).toBe(false);
  });
});
