import { expect, test } from 'vitest';
import allianceRaw from '../../../public/data/alliances/current.json' with { type: 'json' };
import networkRaw from '../../../public/data/route-network/current.json' with { type: 'json' };
import schedulesRaw from '../../../public/data/schedules/current.json' with { type: 'json' };
import officialSchedulesRaw from '../../../public/data/official-schedules.json' with { type: 'json' };
import { summarizeAllianceCoverage, summarizeTargetAllianceCoverage } from '../../../src/lib/rtw/alliance-coverage.ts';
import { AllianceCatalogSchema } from '../../../src/lib/schemas/alliance.ts';
import { parseScheduleCatalog } from '../../../src/lib/schemas/flight-schedules.ts';
import { OfficialScheduleCatalogSchema } from '../../../src/lib/schemas/published-schedules.ts';
import { parseRouteNetworkCatalog } from '../../../src/lib/schemas/route-network.ts';

const alliances = AllianceCatalogSchema.parse(allianceRaw);
const network = parseRouteNetworkCatalog(networkRaw);
const schedules = parseScheduleCatalog(schedulesRaw);
const officialSchedules = OfficialScheduleCatalogSchema.parse(officialSchedulesRaw);

test('global route percentage stays unknown while the denominator is curated-not-complete', () => {
  const summaries = summarizeTargetAllianceCoverage(alliances, network, schedules, '2026-09-06', officialSchedules);
  expect(summaries.map((summary) => summary.alliance)).toEqual(['oneworld', 'star', 'skyteam']);
  for (const summary of summaries) {
    expect(summary.globalRouteUniverseKnown).toBe(false);
    expect(summary.globalRouteCoveragePercent).toBeNull();
    expect(summary.memberAirlinesWithRouteEvidence).toBeLessThanOrEqual(summary.memberAirlines);
    expect(summary.carriersWithoutRouteEvidence.length).toBe(summary.memberAirlines - summary.memberAirlinesWithRouteEvidence);
    expect(summary.memberCarriersWithCompleteRouteUniverse).toBe(0);
    expect(summary.carriersWithCompleteRouteUniverse).toEqual([]);
  }
});

test('known-route schedule coverage requires exact carrier + direction + active chart evidence', () => {
  const star = summarizeAllianceCoverage(alliances, network, schedules, 'star', '2026-09-06', officialSchedules);
  expect(star.knownDirectionalRoutes).toBe(452);
  expect(star.knownDirectionalRoutesWithScheduleEvidence).toBeGreaterThan(0);
  expect(star.knownDirectionalRoutesWithScheduleEvidence).toBeLessThanOrEqual(star.knownDirectionalRoutes);
  expect(star.memberAirlinesWithRouteEvidence).toBeGreaterThanOrEqual(3);
  expect(star.carriersWithoutRouteEvidence).not.toContain('BR');
  expect(star.memberCarriersWithPartialRouteUniverse).toBeGreaterThanOrEqual(1);
  expect(star.carriers).toHaveLength(star.memberAirlines);
  expect(star.carriers.map((carrier) => carrier.knownDirectionalRoutes)).toEqual(
    [...star.carriers.map((carrier) => carrier.knownDirectionalRoutes)].sort((a, b) => a - b),
  );
  expect(star.carriers.find((carrier) => carrier.carrier === 'BR')).toMatchObject({
    carrier: 'BR',
    routeUniverseScope: 'untracked',
    directionalRouteDenominator: null,
  });
  expect(star.carriers.find((carrier) => carrier.carrier === 'NZ')).toMatchObject({
    carrier: 'NZ',
    routeUniverseScope: 'partial',
    directionalRouteDenominator: null,
  });
  expect(star.carriers.find((carrier) => carrier.carrier === 'SQ')).toMatchObject({
    carrier: 'SQ',
    routeUniverseScope: 'partial',
    directionalRouteDenominator: null,
    knownDirectionalRoutes: 36,
    knownDirectionalRoutesWithScheduleEvidence: 0,
  });
  expect(star.carriers.find((carrier) => carrier.carrier === 'OU')).toMatchObject({
    carrier: 'OU',
    routeUniverseScope: 'partial',
    directionalRouteDenominator: null,
    knownDirectionalRoutes: 22,
    knownDirectionalRoutesWithScheduleEvidence: 0,
  });
  expect(star.carriers.find((carrier) => carrier.carrier === 'LX')).toMatchObject({
    carrier: 'LX',
    routeUniverseScope: 'partial',
    directionalRouteDenominator: null,
    knownDirectionalRoutes: 18,
  });
  expect(star.carriers.find((carrier) => carrier.carrier === 'OS')).toMatchObject({
    carrier: 'OS', routeUniverseScope: 'partial', directionalRouteDenominator: null, knownDirectionalRoutes: 14,
  });
  expect(star.carriers.find((carrier) => carrier.carrier === 'LO')).toMatchObject({
    carrier: 'LO', routeUniverseScope: 'partial', directionalRouteDenominator: null, knownDirectionalRoutes: 18,
  });

  const oneworld = summarizeAllianceCoverage(alliances, network, schedules, 'oneworld', '2026-09-06', officialSchedules);
  expect(oneworld.knownDirectionalRoutes).toBe(293);
  expect(oneworld.carriersWithoutRouteEvidence).not.toContain('JL');
  expect(oneworld.carriers.find((carrier) => carrier.carrier === 'WY')).toMatchObject({
    carrier: 'WY', routeUniverseScope: 'partial', directionalRouteDenominator: null, knownDirectionalRoutes: 10,
  });
  expect(oneworld.carriers.find((carrier) => carrier.carrier === 'FJ')).toMatchObject({
    carrier: 'FJ', routeUniverseScope: 'partial', directionalRouteDenominator: null, knownDirectionalRoutes: 2,
  });
  expect(oneworld.carriers.find((carrier) => carrier.carrier === 'RJ')).toMatchObject({
    carrier: 'RJ',
    routeUniverseScope: 'partial',
    directionalRouteDenominator: null,
    knownDirectionalRoutes: 121,
  });

  const skyteam = summarizeAllianceCoverage(alliances, network, schedules, 'skyteam', '2026-09-06', officialSchedules);
  expect(skyteam.memberAirlines).toBe(18);
  expect(skyteam.carriers).toHaveLength(18);
  expect(skyteam.globalRouteCoveragePercent).toBeNull();
  expect(skyteam.carriers.find((carrier) => carrier.carrier === 'CI')).toBeDefined();
});

test('per-carrier visibility reconciles to alliance totals', () => {
  for (const summary of summarizeTargetAllianceCoverage(alliances, network, schedules, '2026-09-06', officialSchedules)) {
    expect(summary.carriers.reduce((sum, carrier) => sum + carrier.knownDirectionalRoutes, 0)).toBe(summary.knownDirectionalRoutes);
    expect(summary.carriers.reduce((sum, carrier) => sum + carrier.knownDirectionalRoutesWithScheduleEvidence, 0))
      .toBe(summary.knownDirectionalRoutesWithScheduleEvidence);
    expect(summary.carriers.filter((carrier) => carrier.knownDirectionalRoutes === 0).map((carrier) => carrier.carrier).sort())
      .toEqual(summary.carriersWithoutRouteEvidence);
  }
});

test('airline-publication schedule catalog is unioned into the ledger without reviving suspended routes', () => {
  const star = summarizeAllianceCoverage(alliances, network, schedules, 'star', '2026-09-06', officialSchedules);
  const withoutOfficial = summarizeAllianceCoverage(alliances, network, schedules, 'star', '2026-09-06');

  expect(star.knownDirectionalRoutesWithScheduleEvidence).toBeGreaterThan(withoutOfficial.knownDirectionalRoutesWithScheduleEvidence);
  expect(star.knownDirectionalRoutes).toBeGreaterThan(withoutOfficial.knownDirectionalRoutes);

  const activeNhRouteKeys = new Set(network.routes
    .filter((route) => route.carrier === 'NH' && route.status === 'published')
    .map((route) => route.pair.join('-')));
  expect(activeNhRouteKeys).not.toContain('NRT-TPE');
  expect(activeNhRouteKeys).not.toContain('TPE-NRT');
  expect(network.routes.find((route) => route.carrier === 'NH' && route.pair.join('-') === 'NRT-TPE')?.status).toBe('suspended');
});

test('future memberships are not counted before their effective date', () => {
  const before = summarizeAllianceCoverage(alliances, network, schedules, 'oneworld', '2026-01-01', officialSchedules);
  const current = summarizeAllianceCoverage(alliances, network, schedules, 'oneworld', '2026-09-06', officialSchedules);
  expect(current.memberAirlines).toBeGreaterThan(before.memberAirlines);
});

test('provider-listed discovery never inflates confirmed operating coverage', () => {
  const listedOnly = parseRouteNetworkCatalog({
    version: '2026.3',
    coverage: 'curated-not-complete',
    sources: [{ id: 'listed', url: 'https://example.com/listed', checkedOn: '2026-09-08', note: 'Fixture.' }],
    carrierUniverses: [],
    routes: [{
      carrier: 'BR', pair: ['TPE', 'BKK'], service: 'nonstop', status: 'published',
      carrierIdentity: 'provider-listed', sourceIds: ['listed'], effectiveFrom: '2026-09-08',
    }],
  });
  const star = summarizeAllianceCoverage(
    alliances,
    listedOnly,
    parseScheduleCatalog({
      version: '2026.3',
      lastVerified: '2026-09-08',
      entries: [{
        carrier: 'JX', pair: ['TPE', 'SFO'], daysOfWeek: [2], status: 'operating',
        confidence: 'chart-verified', sourceUrls: ['https://example.com/unrelated'], effectiveFrom: '2026-09-08',
      }],
    }),
    'star',
    '2026-09-08',
  );
  const br = star.carriers.find((carrier) => carrier.carrier === 'BR');
  expect(br).toMatchObject({
    knownDirectionalRoutes: 1,
    confirmedOperatingDirectionalRoutes: 0,
    providerListedOnlyDirectionalRoutes: 1,
  });
  expect(star.memberAirlinesWithRouteEvidence).toBe(1);
  expect(star.memberAirlinesWithConfirmedOperatingEvidence).toBe(0);
  expect(star.confirmedOperatingDirectionalRoutes).toBe(0);
  expect(star.providerListedOnlyDirectionalRoutes).toBe(1);
});

test('chart-verified evidence promotes the same listed route to confirmed operating', () => {
  const listedOnly = parseRouteNetworkCatalog({
    version: '2026.3',
    coverage: 'curated-not-complete',
    sources: [{ id: 'listed', url: 'https://example.com/listed', checkedOn: '2026-09-08', note: 'Fixture.' }],
    carrierUniverses: [],
    routes: [{
      carrier: 'BR', pair: ['TPE', 'BKK'], service: 'nonstop', status: 'published',
      carrierIdentity: 'provider-listed', sourceIds: ['listed'], effectiveFrom: '2026-09-08',
    }],
  });
  const star = summarizeAllianceCoverage(
    alliances,
    listedOnly,
    parseScheduleCatalog({
      version: '2026.3', lastVerified: '2026-09-08', entries: [{
        carrier: 'BR', pair: ['TPE', 'BKK'], daysOfWeek: [2], status: 'operating',
        confidence: 'chart-verified', sourceUrls: ['https://example.com/chart'], effectiveFrom: '2026-09-08',
      }],
    }),
    'star',
    '2026-09-08',
  );
  expect(star.carriers.find((carrier) => carrier.carrier === 'BR')).toMatchObject({
    knownDirectionalRoutes: 1,
    confirmedOperatingDirectionalRoutes: 1,
    providerListedOnlyDirectionalRoutes: 0,
    knownDirectionalRoutesWithScheduleEvidence: 1,
  });
});
