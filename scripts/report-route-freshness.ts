import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseAirportCatalog } from '../src/lib/schemas/airports.ts';
import { parseRouteNetworkCatalog } from '../src/lib/schemas/route-network.ts';
import { summarizeRouteFreshness } from '../src/lib/rtw/route-freshness.ts';

const ROOT = resolve(import.meta.dirname, '..');

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(ROOT, path), 'utf8')) as unknown;
}

const asOf = process.argv[2] ?? new Date().toISOString().slice(0, 10);
const windowArg = process.argv[3];
const freshnessWindowDays = windowArg === undefined ? 30 : Number(windowArg);
const airports = parseAirportCatalog(readJson('public/data/airports.json'));
const network = parseRouteNetworkCatalog(
  readJson('public/data/route-network/runtime-current.json'),
  new Set(airports.map((airport) => airport.iata)),
);

console.log(JSON.stringify({
  ...summarizeRouteFreshness(network, airports, asOf, freshnessWindowDays),
  interpretation: {
    globalCoverageReason: 'No trustworthy complete global directional-route denominator exists, so global coverage remains unknown.',
    currentEvidenceDefinition: 'Confirmed operating identity plus at least one route source checked within the configured freshness window.',
    staleEvidenceDefinition: 'Confirmed operating identity without a route source checked within the configured freshness window.',
    unknownEvidenceDefinition: 'Provider-listed/carrier-attribution evidence only; marketing or codeshare presence is not operating proof.',
    hubBenchmarkScope: 'Bounded airports already used by GCMP shipped alliance showcase routes; not a complete list of global alliance hubs.',
  },
}, null, 2));
