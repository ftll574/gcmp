import { describe, expect, test } from 'vitest';
import allianceRaw from '../../../public/data/alliances/current.json';
import airportRaw from '../../../public/data/airports.json';
import networkRaw from '../../../public/data/route-network/runtime-current.json';
import { summarizeFlightNumberCoverage } from '../../../src/lib/rtw/flight-number-coverage.ts';
import { AllianceCatalogSchema } from '../../../src/lib/schemas/alliance.ts';
import { parseRouteNetworkCatalog } from '../../../src/lib/schemas/route-network.ts';

describe('flight-number coverage audit', () => {
  test('classifies every active published alliance route without claiming a global denominator', () => {
    const report = summarizeFlightNumberCoverage(
      parseRouteNetworkCatalog(networkRaw),
      AllianceCatalogSchema.parse(allianceRaw),
      airportRaw,
      '2026-09-12',
    );

    expect(report.globalCoverage).toBe('unknown');
    expect(report.allianceMemberCount).toBe(60);
    expect(report.carriers).toHaveLength(60);
    expect(report.ledger).toHaveLength(report.total.trackedDirectionalRoutes);
    expect(report.total.confirmed + report.total.candidateOnly + report.total.missing)
      .toBe(report.total.trackedDirectionalRoutes);
    expect(report.total.operating + report.total.providerListed).toBe(report.total.trackedDirectionalRoutes);
    expect(report.taiwan.trackedDirectionalRoutes).toBeGreaterThan(0);
    expect(report.boundedHubs.map((row) => row.alliance)).toEqual(['oneworld', 'star', 'skyteam']);
  });

  test('records the official China Airlines Amsterdam tranche as confirmed operating routes', () => {
    const report = summarizeFlightNumberCoverage(
      parseRouteNetworkCatalog(networkRaw),
      AllianceCatalogSchema.parse(allianceRaw),
      airportRaw,
      '2026-09-12',
    );
    const find = (from: string, to: string) => report.ledger.find(
      (row) => row.carrier === 'CI' && row.from === from && row.to === to,
    );

    expect(find('TPE', 'AMS')).toMatchObject({
      carrierIdentity: 'operating',
      numberStatus: 'confirmed',
      flightNumbers: expect.arrayContaining(['CI73']),
      flightNumberSourceIds: expect.arrayContaining(['ci-amsterdam-summer-20260912']),
      effectiveFrom: '2026-09-01',
      effectiveUntil: '2026-10-23',
    });
    expect(find('AMS', 'TPE')).toMatchObject({
      carrierIdentity: 'operating',
      numberStatus: 'confirmed',
      flightNumbers: expect.arrayContaining(['CI74']),
      flightNumberSourceIds: expect.arrayContaining(['ci-amsterdam-summer-20260912']),
      effectiveFrom: '2026-09-02',
      effectiveUntil: '2026-10-24',
    });
  });
});
