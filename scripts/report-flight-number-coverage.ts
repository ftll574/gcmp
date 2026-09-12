import allianceRaw from '../public/data/alliances/current.json' with { type: 'json' };
import airportRaw from '../public/data/airports.json' with { type: 'json' };
import networkRaw from '../public/data/route-network/runtime-current.json' with { type: 'json' };
import { parseFlightNumberCoverageArgs } from '../src/lib/rtw/flight-number-coverage-cli.ts';
import { summarizeFlightNumberCoverage } from '../src/lib/rtw/flight-number-coverage.ts';
import { AllianceCatalogSchema } from '../src/lib/schemas/alliance.ts';
import { parseRouteNetworkCatalog } from '../src/lib/schemas/route-network.ts';

const { asOf, summaryOnly } = parseFlightNumberCoverageArgs(process.argv.slice(2));

const report = summarizeFlightNumberCoverage(
  parseRouteNetworkCatalog(networkRaw),
  AllianceCatalogSchema.parse(allianceRaw),
  airportRaw,
  asOf,
);

console.log(JSON.stringify(summaryOnly ? { ...report, ledger: undefined } : report, null, 2));
