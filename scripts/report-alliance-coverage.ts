import allianceRaw from '../public/data/alliances/current.json' with { type: 'json' };
import networkRaw from '../public/data/route-network/runtime-current.json' with { type: 'json' };
import schedulesRaw from '../public/data/schedules/current.json' with { type: 'json' };
import officialSchedulesRaw from '../src/data/official-schedules.json' with { type: 'json' };
import { summarizeTargetAllianceCoverage } from '../src/lib/rtw/alliance-coverage.ts';
import { AllianceCatalogSchema } from '../src/lib/schemas/alliance.ts';
import { parseScheduleCatalog } from '../src/lib/schemas/flight-schedules.ts';
import { OfficialScheduleCatalogSchema } from '../src/lib/schemas/published-schedules.ts';
import { parseRouteNetworkCatalog } from '../src/lib/schemas/route-network.ts';

const asOf = process.argv[2] ?? new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error('Usage: npm.cmd run coverage:alliances -- YYYY-MM-DD');

const rows = summarizeTargetAllianceCoverage(
  AllianceCatalogSchema.parse(allianceRaw),
  parseRouteNetworkCatalog(networkRaw),
  parseScheduleCatalog(schedulesRaw),
  asOf,
  OfficialScheduleCatalogSchema.parse(officialSchedulesRaw),
);

console.log(JSON.stringify({
  asOf,
  target: 'oneworld + Star Alliance + SkyTeam global directional nonstop routes',
  globalCoveragePercent: null,
  globalCoverageReason: 'Complete global operating-route denominator has not been established. confirmedOperatingDirectionalRoutes is separated from providerListedOnlyDirectionalRoutes so marketing/codeshare fallback never becomes operating proof.',
  discoveryPolicy: 'High-recall provider-listed routes remain discoverable but require dated/operator verification before itinerary persistence.',
  alliances: rows,
}, null, 2));
