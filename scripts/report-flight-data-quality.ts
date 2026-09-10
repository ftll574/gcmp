import networkRaw from '../public/data/route-network/runtime-current.json' with { type: 'json' };
import schedulesRaw from '../public/data/schedules/current.json' with { type: 'json' };
import officialRaw from '../public/data/official-schedules.json' with { type: 'json' };
import { DEFAULT_SCHEDULE_PROVIDER } from '../server/hybrid-schedules.ts';
import { summarizeFlightDataQuality } from '../src/lib/rtw/flight-data-quality.ts';
import { parseScheduleCatalog } from '../src/lib/schemas/flight-schedules.ts';
import { OfficialScheduleCatalogSchema } from '../src/lib/schemas/published-schedules.ts';
import { parseRouteNetworkCatalog } from '../src/lib/schemas/route-network.ts';

const asOf = process.argv[2] ?? new Date().toISOString().slice(0, 10);
const report = summarizeFlightDataQuality(
  parseRouteNetworkCatalog(networkRaw),
  parseScheduleCatalog(schedulesRaw),
  OfficialScheduleCatalogSchema.parse(officialRaw),
  asOf,
);

console.log(JSON.stringify({
  ...report,
  interpretation: {
    denominatorScope: 'GCMP active published runtime routes only; this is not a claim of complete global airline-route coverage.',
    routeEvidenceIsNotDatedEvidence: true,
    providerListedCarrierIsNotOperatingProof: true,
    negativeFlightClaimRequiresCompleteFreshDatedProviderResponse: true,
  },
  gatewayArchitecture: {
    defaultProvider: DEFAULT_SCHEDULE_PROVIDER,
    defaultProviderScope: 'TDX International GeneralSchedule: queries require at least one Taiwan airport endpoint.',
    globalDatedProviderAdapter: 'cirium',
    globalDatedProviderRequiresExplicitServerSelection: true,
    officialPublicationsMergedAsFallback: true,
  },
  highestPriorityCarrierGaps: report.carriers.slice(0, 20),
}, null, 2));
