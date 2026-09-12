import allianceRaw from '../public/data/alliances/current.json' with { type: 'json' };
import airportRaw from '../public/data/airports.json' with { type: 'json' };
import networkRaw from '../public/data/route-network/runtime-current.json' with { type: 'json' };
import { summarizeFlightNumberCoverage } from '../src/lib/rtw/flight-number-coverage.ts';
import { AllianceCatalogSchema } from '../src/lib/schemas/alliance.ts';
import { parseRouteNetworkCatalog } from '../src/lib/schemas/route-network.ts';

const args = process.argv.slice(2);
const summaryOnly = args.includes('--summary');
const asOf = args.find((arg) => !arg.startsWith('--')) ?? new Date().toISOString().slice(0, 10);

const report = summarizeFlightNumberCoverage(
  parseRouteNetworkCatalog(networkRaw),
  AllianceCatalogSchema.parse(allianceRaw),
  airportRaw,
  asOf,
);

console.log(JSON.stringify(summaryOnly ? { ...report, ledger: undefined } : report, null, 2));
