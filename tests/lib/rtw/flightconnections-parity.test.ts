import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import allianceRaw from '../../../public/data/alliances/current.json' with { type: 'json' };
import networkRaw from '../../../public/data/route-network/current.json' with { type: 'json' };
import schedulesRaw from '../../../public/data/schedules/current.json' with { type: 'json' };
import officialSchedulesRaw from '../../../public/data/official-schedules.json' with { type: 'json' };
import { collectAllianceRouteEvidence, type CoverageAlliance } from '../../../src/lib/rtw/alliance-coverage.ts';
import { compareFlightConnectionsBenchmark, FlightConnectionsBenchmarkSchema } from '../../../src/lib/rtw/flightconnections-parity.ts';
import { AllianceCatalogSchema } from '../../../src/lib/schemas/alliance.ts';
import { parseScheduleCatalog } from '../../../src/lib/schemas/flight-schedules.ts';
import { OfficialScheduleCatalogSchema } from '../../../src/lib/schemas/published-schedules.ts';
import { parseRouteNetworkCatalog } from '../../../src/lib/schemas/route-network.ts';

const benchmark = FlightConnectionsBenchmarkSchema.parse(JSON.parse(readFileSync('docs/benchmarks/flightconnections-2026-09-08.json', 'utf8')));
const alliances = AllianceCatalogSchema.parse(allianceRaw);
const network = parseRouteNetworkCatalog(networkRaw);
const schedules = parseScheduleCatalog(schedulesRaw);
const officialSchedules = OfficialScheduleCatalogSchema.parse(officialSchedulesRaw);

function parity(asOf = '2026-09-08') {
  const keys: CoverageAlliance[] = ['oneworld', 'star', 'skyteam'];
  const evidence = Object.fromEntries(keys.map((alliance) => [
    alliance,
    collectAllianceRouteEvidence(alliances, network, schedules, alliance, asOf, officialSchedules),
  ])) as Record<CoverageAlliance, ReturnType<typeof collectAllianceRouteEvidence>>;
  return compareFlightConnectionsBenchmark(benchmark, alliances, evidence, asOf);
}

test('benchmark is static manual QA data and never claims scraper capture', () => {
  expect(benchmark.captureMethod).toBe('manual-search-index-review');
  expect(benchmark.automationPolicy).toMatch(/No automated access/i);
});

test('all three alliances produce an explicit FlightConnections parity ledger', () => {
  expect(parity().map((row) => row.alliance)).toEqual(['oneworld', 'star', 'skyteam']);
});

test('EVA and China Airlines airport-set benchmarks expose missing production coverage', () => {
  const rows = parity();
  const eva = rows.find((row) => row.alliance === 'star')?.carriers.find((row) => row.carrier === 'BR');
  const ci = rows.find((row) => row.alliance === 'skyteam')?.carriers.find((row) => row.carrier === 'CI');
  expect(eva?.listedAirportSetComplete).toBe(true);
  expect(eva?.missingListedAirports).not.toContain('BKK');
  expect(eva?.missingListedAirports.length).toBeGreaterThan(0);
  expect(ci?.listedAirportSetComplete).toBe(true);
  expect(ci?.missingListedAirports).toContain('BKK');
  expect(ci?.missingListedAirports.length).toBeGreaterThan(0);
});

test('exact route parity stays pending until a complete manually reviewed pair list exists', () => {
  for (const alliance of parity()) {
    expect(alliance.strictRoutePairParityReady).toBe(false);
    expect(alliance.strictRoutePairParityPass).toBeNull();
  }
});

test('oneworld membership mismatch is visible instead of silently rewriting either source', () => {
  const oneworld = parity().find((row) => row.alliance === 'oneworld');
  expect(oneworld?.benchmarkOnlyCarriers).toContain('NU');
  expect(oneworld?.catalogOnlyCarriers).toContain('HA');
});

test('parity reports listed discovery separately from confirmed operating airports', () => {
  const rows = parity();
  for (const alliance of rows) {
    expect(alliance.confirmedOperatingAirportCount).toBeLessThanOrEqual(alliance.knownAirportCount);
    expect(alliance.providerListedOnlyAirportCount)
      .toBe(alliance.knownAirportCount - alliance.confirmedOperatingAirportCount);
    for (const carrier of alliance.carriers) {
      expect(carrier.confirmedOperatingAirportCount).toBeLessThanOrEqual(carrier.knownAirportCount);
      expect(carrier.providerListedOnlyAirportCount)
        .toBe(carrier.knownAirportCount - carrier.confirmedOperatingAirportCount);
    }
  }
});
