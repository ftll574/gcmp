import { describe, expect, it } from 'vitest';
import type { Airport } from '../../../src/lib/types.ts';
import type { RouteNetworkCatalog } from '../../../src/lib/schemas/route-network.ts';
import { classifyRouteFreshness, summarizeRouteFreshness } from '../../../src/lib/rtw/route-freshness.ts';

const airports: Airport[] = [
  { iata: 'TPE', icao: 'RCTP', name: 'Taoyuan', city: 'Taipei', country: 'TW', lat: 25, lon: 121 },
  { iata: 'KHH', icao: 'RCKH', name: 'Kaohsiung', city: 'Kaohsiung', country: 'TW', lat: 22, lon: 120 },
  { iata: 'HKG', icao: 'VHHH', name: 'Hong Kong', city: 'Hong Kong', country: 'HK', lat: 22, lon: 114 },
  { iata: 'LHR', icao: 'EGLL', name: 'Heathrow', city: 'London', country: 'GB', lat: 51, lon: -0.4 },
];

const network: RouteNetworkCatalog = {
  version: 'test',
  coverage: 'curated-not-complete',
  sources: [
    { id: 'fresh', url: 'https://example.com/fresh', checkedOn: '2026-09-10', note: 'fresh' },
    { id: 'stale', url: 'https://example.com/stale', checkedOn: '2026-07-01', note: 'stale' },
  ],
  carrierUniverses: [],
  routes: [
    { carrier: 'CX', pair: ['TPE', 'HKG'], service: 'nonstop', status: 'published', carrierIdentity: 'operating', sourceIds: ['fresh'] },
    { carrier: 'BA', pair: ['LHR', 'HKG'], service: 'nonstop', status: 'published', carrierIdentity: 'operating', sourceIds: ['stale'] },
    { carrier: 'AA', pair: ['HKG', 'LHR'], service: 'nonstop', status: 'published', carrierIdentity: 'provider-listed', sourceIds: ['fresh'] },
    { carrier: 'CX', pair: ['HKG', 'TPE'], service: 'nonstop', status: 'suspended', carrierIdentity: 'operating', sourceIds: ['fresh'] },
    { carrier: 'CX', pair: ['TPE', 'KHH'], service: 'nonstop', status: 'identity-unresolved', sourceIds: ['fresh'] },
    { carrier: 'CX', pair: ['KHH', 'HKG'], service: 'nonstop', status: 'published', carrierIdentity: 'operating', sourceIds: ['fresh'], effectiveFrom: '2026-10-01' },
  ],
};

describe('route freshness audit', () => {
  it('keeps provider-listed evidence unknown even when freshly checked', () => {
    expect(classifyRouteFreshness(network.routes[2], new Map([['fresh', '2026-09-10']]), '2026-09-12')).toBe('unknown');
  });

  it('classifies confirmed operating evidence as current or stale by source check age', () => {
    const sources = new Map([['fresh', '2026-09-10'], ['stale', '2026-07-01']]);
    expect(classifyRouteFreshness(network.routes[0], sources, '2026-09-12', 30)).toBe('current');
    expect(classifyRouteFreshness(network.routes[1], sources, '2026-09-12', 30)).toBe('stale');
  });

  it('rejects invalid dates and invalid freshness windows', () => {
    expect(() => classifyRouteFreshness(network.routes[0], new Map(), 'not-a-date')).toThrow(/asOf/);
    expect(() => classifyRouteFreshness(network.routes[0], new Map(), '2026-09-12', 0)).toThrow(/freshnessWindowDays/);
  });

  it('summarizes active routes, Taiwan coverage, hub benchmark, and non-active flags without claiming global coverage', () => {
    const report = summarizeRouteFreshness(network, airports, '2026-09-12', 30, [
      { id: 'oneworld-showcase-hubs', airports: ['HKG', 'LHR'] },
    ]);
    expect(report.globalCoverage).toBe('unknown');
    expect(report.routes).toEqual({
      trackedDirectionalRoutes: 3,
      currentEvidenceRoutes: 1,
      staleEvidenceRoutes: 1,
      unknownEvidenceRoutes: 1,
    });
    expect(report.taiwan.trackedDirectionalRoutes).toBe(1);
    expect(report.taiwan.airportCodes).toEqual(['KHH', 'TPE']);
    expect(report.taiwan.representedAirportCodes).toEqual(['TPE']);
    expect(report.hubBenchmarks[0].trackedDirectionalRoutes).toBe(3);
    expect(report.hubAirports).toEqual([
      { airport: 'HKG', trackedDirectionalRoutes: 3, currentEvidenceRoutes: 1, staleEvidenceRoutes: 1, unknownEvidenceRoutes: 1 },
      { airport: 'LHR', trackedDirectionalRoutes: 2, currentEvidenceRoutes: 0, staleEvidenceRoutes: 1, unknownEvidenceRoutes: 1 },
    ]);
    expect(report.qualityFlags.crossLayerConflicts).toBe('unknown-after-merge');
    expect(report.priorityUnknownRoutes.taiwan).toEqual([]);
    expect(report.priorityUnknownRoutes.hubs).toEqual([{ carrier: 'AA', from: 'HKG', to: 'LHR' }]);
    expect(report.qualityFlags.suspendedRoutes).toBe(1);
    expect(report.qualityFlags.identityUnresolvedRoutes).toBe(1);
    expect(report.qualityFlags.duplicateDirectionalRoutes).toBe(0);
  });
});
