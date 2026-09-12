import { describe, expect, test } from 'vitest';
import allianceRaw from '../../../public/data/alliances/current.json';
import airportRaw from '../../../public/data/airports.json';
import networkRaw from '../../../public/data/route-network/runtime-current.json';
import { summarizeFlightNumberCoverage } from '../../../src/lib/rtw/flight-number-coverage.ts';
import { AllianceCatalogSchema } from '../../../src/lib/schemas/alliance.ts';
import { parseRouteNetworkCatalog } from '../../../src/lib/schemas/route-network.ts';

const productionEvidenceRecords = [
  {
    carrier: 'CI', pair: ['TPE', 'AMS'] as const, flightNumber: 'CI73',
    sourceId: 'ci-amsterdam-summer-20260912', effectiveFrom: '2026-09-01', effectiveUntil: '2026-10-23',
  },
  {
    carrier: 'CI', pair: ['AMS', 'TPE'] as const, flightNumber: 'CI74',
    sourceId: 'ci-amsterdam-summer-20260912', effectiveFrom: '2026-09-02', effectiveUntil: '2026-10-24',
  },
];

const syntheticNetwork = parseRouteNetworkCatalog({
  version: '2026.3',
  coverage: 'curated-not-complete',
  sources: [
    { id: 'route-source', url: 'https://example.com/routes', checkedOn: '2026-09-01', note: 'Route relationship only.' },
    { id: 'confirmed-source', url: 'https://example.com/confirmed', checkedOn: '2026-09-02', note: 'Confirmed flight number.' },
    { id: 'candidate-source', url: 'https://example.com/candidate', checkedOn: '2026-09-03', note: 'Candidate flight number.' },
  ],
  carrierUniverses: [],
  routes: [
    {
      carrier: 'AA', pair: ['TPE', 'HKG'], service: 'nonstop', status: 'published',
      flightNumbers: ['AA1'], flightNumberSourceIds: ['confirmed-source'], sourceIds: ['route-source'],
      effectiveFrom: '2026-09-01', effectiveUntil: '2026-09-12',
    },
    {
      carrier: 'AA', pair: ['HKG', 'NRT'], service: 'nonstop', status: 'published', carrierIdentity: 'provider-listed',
      flightNumberCandidates: ['AA2'], flightNumberCandidateSourceIds: ['candidate-source'], sourceIds: ['route-source'],
    },
    {
      carrier: 'AA', pair: ['HKG', 'LAX'], service: 'nonstop', status: 'published', sourceIds: ['route-source'],
      flightNumbers: ['AA3'], flightNumberSourceIds: ['confirmed-source'],
    },
    { carrier: 'AA', pair: ['HKG', 'SFO'], service: 'nonstop', status: 'published', sourceIds: ['route-source'] },
    { carrier: 'BA', pair: ['LHR', 'JFK'], service: 'nonstop', status: 'published', sourceIds: ['route-source'] },
    { carrier: 'JL', pair: ['NRT', 'JFK'], service: 'nonstop', status: 'published', sourceIds: ['route-source'] },
    { carrier: 'CX', pair: ['HKG', 'JFK'], service: 'nonstop', status: 'published', sourceIds: ['route-source'] },
  ],
});

const syntheticAlliances = {
  memberships: [
    { airline: 'AA', alliance: 'oneworld' as const, status: 'member', effectiveFrom: '2020-01-01' },
    { airline: 'BA', alliance: 'oneworld' as const, status: 'member', effectiveFrom: '2026-10-01' },
    { airline: 'JL', alliance: 'oneworld' as const, status: 'member', effectiveTo: '2026-08-31' },
    { airline: 'CX', alliance: 'oneworld' as const, status: 'former' },
  ],
};

const syntheticAirports = [
  { iata: 'TPE', country: 'TW' }, { iata: 'HKG', country: 'HK' }, { iata: 'NRT', country: 'JP' },
  { iata: 'LAX', country: 'US' }, { iata: 'SFO', country: 'US' }, { iata: 'LHR', country: 'GB' },
  { iata: 'JFK', country: 'US' },
];

const syntheticEvidenceRecords = [
  {
    carrier: 'AA', pair: ['TPE', 'HKG'] as const, flightNumber: 'AA1', sourceId: 'confirmed-source',
    effectiveFrom: '2026-09-01', effectiveUntil: '2026-09-12',
  },
  {
    carrier: 'AA', pair: ['HKG', 'LAX'] as const, flightNumber: 'AA3', sourceId: 'confirmed-source',
    effectiveFrom: '2026-09-01', effectiveUntil: '2026-09-10',
  },
];

describe('flight-number coverage audit', () => {
  test('classifies every active published alliance route without claiming a global denominator', () => {
    const report = summarizeFlightNumberCoverage(
      parseRouteNetworkCatalog(networkRaw),
      AllianceCatalogSchema.parse(allianceRaw),
      airportRaw,
      '2026-09-12',
      { evidenceRecords: productionEvidenceRecords },
    );

    expect(report.globalCoverage).toBe('unknown');
    expect(report.allianceMemberCount).toBe(60);
    expect(report.carriers).toHaveLength(60);
    expect(report.ledger).toHaveLength(report.total.trackedDirectionalRoutes);
    expect(report.total.confirmed + report.total.candidateOnly + report.total.unknown)
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
      { evidenceRecords: productionEvidenceRecords },
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
      flightNumberEvidence: [{
        flightNumber: 'CI73',
        id: 'ci-amsterdam-summer-20260912',
        url: 'https://2026ste.china-airlines.com/',
        checkedOn: '2026-09-12',
        effectiveFrom: '2026-09-01',
        effectiveUntil: '2026-10-23',
      }],
    });
    expect(find('AMS', 'TPE')).toMatchObject({
      carrierIdentity: 'operating',
      numberStatus: 'confirmed',
      flightNumbers: expect.arrayContaining(['CI74']),
      flightNumberSourceIds: expect.arrayContaining(['ci-amsterdam-summer-20260912']),
      effectiveFrom: '2026-09-02',
      effectiveUntil: '2026-10-24',
      flightNumberEvidence: [{
        flightNumber: 'CI74',
        id: 'ci-amsterdam-summer-20260912',
        url: 'https://2026ste.china-airlines.com/',
        checkedOn: '2026-09-12',
        effectiveFrom: '2026-09-02',
        effectiveUntil: '2026-10-24',
      }],
    });
  });

  test('rejects malformed and impossible audit dates', () => {
    expect(() => summarizeFlightNumberCoverage(syntheticNetwork, syntheticAlliances, syntheticAirports, 'not-a-date'))
      .toThrow('Invalid asOf date: not-a-date');
    expect(() => summarizeFlightNumberCoverage(syntheticNetwork, syntheticAlliances, syntheticAirports, '2026-02-30'))
      .toThrow('Invalid asOf date: 2026-02-30');
  });

  test('applies route and membership effective windows inclusively and excludes out-of-window rows', () => {
    const atStart = summarizeFlightNumberCoverage(syntheticNetwork, syntheticAlliances, syntheticAirports, '2026-09-01');
    const atEnd = summarizeFlightNumberCoverage(syntheticNetwork, syntheticAlliances, syntheticAirports, '2026-09-12');
    const before = summarizeFlightNumberCoverage(syntheticNetwork, syntheticAlliances, syntheticAirports, '2026-08-31');
    const after = summarizeFlightNumberCoverage(syntheticNetwork, syntheticAlliances, syntheticAirports, '2026-09-13');

    expect(atStart.ledger.some((row) => row.from === 'TPE' && row.to === 'HKG')).toBe(true);
    expect(atEnd.ledger.some((row) => row.from === 'TPE' && row.to === 'HKG')).toBe(true);
    expect(before.ledger.some((row) => row.from === 'TPE' && row.to === 'HKG')).toBe(false);
    expect(after.ledger.some((row) => row.from === 'TPE' && row.to === 'HKG')).toBe(false);
    expect(atEnd.carriers.map((row) => row.carrier)).toEqual(['AA']);
    expect(atEnd.ledger.some((row) => ['BA', 'JL', 'CX'].includes(row.carrier))).toBe(false);
  });

  test('classifies all number and identity states and derives Taiwan and bounded-hub slices from synthetic rows', () => {
    const report = summarizeFlightNumberCoverage(
      syntheticNetwork, syntheticAlliances, syntheticAirports, '2026-09-12',
      { evidenceRecords: syntheticEvidenceRecords },
    );

    expect(report.total).toMatchObject({
      trackedDirectionalRoutes: 4,
      confirmed: 1,
      candidateOnly: 2,
      unknown: 1,
      operating: 3,
      providerListed: 1,
      operatingCandidateOnly: 1,
      providerListedCandidateOnly: 1,
    });
    expect(report.taiwan).toMatchObject({ trackedDirectionalRoutes: 1, confirmed: 1 });
    expect(report.boundedHubs.find((row) => row.alliance === 'oneworld')?.coverage.trackedDirectionalRoutes).toBe(4);
  });

  test('resolves only flight-number source IDs into standalone evidence metadata', () => {
    const report = summarizeFlightNumberCoverage(
      syntheticNetwork, syntheticAlliances, syntheticAirports, '2026-09-12',
      { evidenceRecords: syntheticEvidenceRecords },
    );
    const confirmed = report.ledger.find((row) => row.from === 'TPE' && row.to === 'HKG');
    const candidate = report.ledger.find((row) => row.from === 'HKG' && row.to === 'NRT');

    expect(confirmed?.sourceIds).toEqual(['route-source']);
    expect(confirmed?.flightNumberEvidence).toEqual([
      {
        flightNumber: 'AA1', id: 'confirmed-source', url: 'https://example.com/confirmed', checkedOn: '2026-09-02',
        effectiveFrom: '2026-09-01', effectiveUntil: '2026-09-12',
      },
    ]);
    expect(confirmed?.flightNumberEvidence.some((source) => source.id === 'route-source')).toBe(false);
    expect(candidate?.flightNumberCandidateSourceIds).toEqual(['candidate-source']);
    expect(candidate?.flightNumberCandidateEvidence).toEqual([
      { id: 'candidate-source', url: 'https://example.com/candidate', checkedOn: '2026-09-03' },
    ]);
  });

  test('does not borrow a route window to keep expired flight-number evidence confirmed', () => {
    const report = summarizeFlightNumberCoverage(
      syntheticNetwork, syntheticAlliances, syntheticAirports, '2026-09-12',
      { evidenceRecords: syntheticEvidenceRecords },
    );
    const expired = report.ledger.find((row) => row.from === 'HKG' && row.to === 'LAX');

    expect(expired).toMatchObject({ numberStatus: 'candidate-only', flightNumbers: [] });
    expect(expired?.flightNumberCandidates).toContain('AA3');
    expect(expired?.flightNumberEvidence).toEqual([]);
  });

  test('keeps bounded targets that are absent from the runtime as explicit unknown rows', () => {
    const runtimeWithoutUnknown = parseRouteNetworkCatalog({
      ...syntheticNetwork,
      routes: syntheticNetwork.routes.filter((route) => !(route.carrier === 'AA' && route.pair[0] === 'HKG' && route.pair[1] === 'SFO')),
    });
    const report = summarizeFlightNumberCoverage(
      runtimeWithoutUnknown, syntheticAlliances, syntheticAirports, '2026-09-12',
      { targetNetwork: syntheticNetwork, evidenceRecords: syntheticEvidenceRecords },
    );
    const absent = report.ledger.find((row) => row.from === 'HKG' && row.to === 'SFO');

    expect(absent).toMatchObject({ numberStatus: 'unknown', runtimePresent: false, flightNumbers: [], flightNumberCandidates: [] });
    expect(report.total.unknown).toBe(1);
  });

  test('rejects impossible or inverted independent flight-number evidence windows', () => {
    expect(() => summarizeFlightNumberCoverage(
      syntheticNetwork, syntheticAlliances, syntheticAirports, '2026-09-12',
      { evidenceRecords: [{ ...syntheticEvidenceRecords[0]!, effectiveUntil: '2026-02-30' }] },
    )).toThrow(/Invalid flight-number evidence window/);
    expect(() => summarizeFlightNumberCoverage(
      syntheticNetwork, syntheticAlliances, syntheticAirports, '2026-09-12',
      { evidenceRecords: [{ ...syntheticEvidenceRecords[0]!, effectiveFrom: '2026-09-13', effectiveUntil: '2026-09-12' }] },
    )).toThrow(/Invalid flight-number evidence window/);
  });

  test('real historical ADSB numbers and unaccepted CX identities are not confirmed on 2026-09-12', () => {
    const report = summarizeFlightNumberCoverage(
      parseRouteNetworkCatalog(networkRaw), AllianceCatalogSchema.parse(allianceRaw), airportRaw, '2026-09-12',
      { evidenceRecords: productionEvidenceRecords },
    );
    const find = (carrier: string, from: string, to: string) => report.ledger.find(
      (row) => row.carrier === carrier && row.from === from && row.to === to,
    );
    const ciLax = find('CI', 'TPE', 'LAX');
    const cxOutbound = find('CX', 'TPE', 'HKG');
    const cxInbound = find('CX', 'HKG', 'TPE');

    expect(ciLax).toMatchObject({ numberStatus: 'candidate-only', flightNumbers: [] });
    expect(ciLax?.flightNumberCandidates).toContain('CI5116');
    expect(cxOutbound).toMatchObject({ numberStatus: 'candidate-only', flightNumbers: [] });
    expect(cxOutbound?.flightNumberCandidates).toEqual(expect.arrayContaining(['CX2015', 'CX407']));
    expect(cxInbound).toMatchObject({ numberStatus: 'candidate-only', flightNumbers: [] });
    expect(cxInbound?.flightNumberCandidates).toEqual(expect.arrayContaining(['CX2026', 'CX400']));
  });
});
