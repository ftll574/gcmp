import { readFileSync } from 'node:fs';
import allianceRaw from '../public/data/alliances/current.json' with { type: 'json' };
import networkRaw from '../public/data/route-network/runtime-current.json' with { type: 'json' };
import schedulesRaw from '../public/data/schedules/current.json' with { type: 'json' };
import officialSchedulesRaw from '../public/data/official-schedules.json' with { type: 'json' };
import { collectAllianceRouteEvidence, type CoverageAlliance } from '../src/lib/rtw/alliance-coverage.ts';
import { compareFlightConnectionsBenchmark, FlightConnectionsBenchmarkSchema } from '../src/lib/rtw/flightconnections-parity.ts';
import { AllianceCatalogSchema } from '../src/lib/schemas/alliance.ts';
import { parseScheduleCatalog } from '../src/lib/schemas/flight-schedules.ts';
import { OfficialScheduleCatalogSchema } from '../src/lib/schemas/published-schedules.ts';
import { parseRouteNetworkCatalog } from '../src/lib/schemas/route-network.ts';

const asOf = process.argv[2] ?? new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error('Usage: tsx scripts/report-flightconnections-parity.ts YYYY-MM-DD');

const benchmark = FlightConnectionsBenchmarkSchema.parse(JSON.parse(readFileSync('docs/benchmarks/flightconnections-2026-09-08.json', 'utf8')));
const alliances = AllianceCatalogSchema.parse(allianceRaw);
const network = parseRouteNetworkCatalog(networkRaw);
const schedules = parseScheduleCatalog(schedulesRaw);
const officialSchedules = OfficialScheduleCatalogSchema.parse(officialSchedulesRaw);
const keys: CoverageAlliance[] = ['oneworld', 'star', 'skyteam'];
const evidence = Object.fromEntries(keys.map((alliance) => [
  alliance,
  collectAllianceRouteEvidence(alliances, network, schedules, alliance, asOf, officialSchedules),
])) as Record<CoverageAlliance, ReturnType<typeof collectAllianceRouteEvidence>>;

console.log(JSON.stringify({
  asOf,
  benchmarkCheckedOn: benchmark.checkedOn,
  captureMethod: benchmark.captureMethod,
  automatedFlightConnectionsAccess: false,
  runtimeDiscovery: {
    mode: 'on-demand-current-origin',
    endpoint: '/api/schedules/routes?origin=IATA',
    staticCatalogRole: 'confirmed-evidence-and-fallback',
    providerListedCarrierIsOperatingProof: false,
    datedScheduleVerificationRequiredBeforePersistingLiveOnlyCarrier: true,
  },
  benchmarkSemantics: 'FlightConnections airline pages are used only as a listed-destination QA benchmark. Their airline listings can include marketing/codeshare service and are not an operating-carrier denominator.',
  alliances: compareFlightConnectionsBenchmark(benchmark, alliances, evidence, asOf),
}, null, 2));
