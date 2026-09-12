import { readFileSync } from 'node:fs';
import { parseFlightNumberCoverageArgs } from '../src/lib/rtw/flight-number-coverage-cli.ts';
import { type FlightNumberEvidenceRecord, summarizeFlightNumberCoverage } from '../src/lib/rtw/flight-number-coverage.ts';
import { mergeRouteNetworkCatalogs, mergeRouteNumberEvidence } from '../src/lib/rtw/route-network-merge.ts';
import { AllianceCatalogSchema } from '../src/lib/schemas/alliance.ts';
import { parseRouteNetworkCatalog } from '../src/lib/schemas/route-network.ts';

const { asOf, summaryOnly } = parseFlightNumberCoverageArgs(process.argv.slice(2));

const readJson = (relativePath: string): unknown => JSON.parse(
  readFileSync(new URL(relativePath, import.meta.url), 'utf8'),
);
const allianceRaw = readJson('../public/data/alliances/current.json');
const airportRaw = readJson('../public/data/airports.json') as ReadonlyArray<{ iata: string; country: string }>;
const currentRaw = readJson('../public/data/route-network/current.json');
const recentRaw = readJson('../public/data/route-network/recent-current.json');
const observedRaw = readJson('../public/data/route-network/observed-current.json');
const affiliateRaw = readJson('../public/data/route-network/affiliate-current.json');
const btsRaw = readJson('../public/data/route-network/bts-marketing-current.json');
const standingRaw = readJson('../public/data/route-network/standing-current.json');
const validatedStaticRaw = readJson('../public/data/route-network/validated-static-current.json');
const correctionsRaw = readJson('../public/data/route-network/current-corrections.json');
const numberRaw = readJson('../public/data/route-network/flight-numbers-current.json');
const networkRaw = readJson('../public/data/route-network/runtime-current.json');
const auditEvidenceRaw = readJson('../public/data/route-network/flight-number-audit-evidence.json');

const routeLayers = [currentRaw, recentRaw, observedRaw, affiliateRaw, btsRaw, standingRaw, validatedStaticRaw]
  .map((raw) => parseRouteNetworkCatalog(raw));
const baseTargetNetwork = routeLayers.slice(1).reduce(
  (network, layer) => mergeRouteNetworkCatalogs(network, layer),
  routeLayers[0]!,
);
const correctedTargetNetwork = mergeRouteNetworkCatalogs(
  parseRouteNetworkCatalog(correctionsRaw),
  baseTargetNetwork,
);
const targetNetwork = mergeRouteNumberEvidence(correctedTargetNetwork, parseRouteNetworkCatalog(numberRaw));
const auditEvidence = parseRouteNetworkCatalog(auditEvidenceRaw);
const evidenceRecords: FlightNumberEvidenceRecord[] = [];
for (const route of auditEvidence.routes) {
  if (!route.effectiveFrom || !route.effectiveUntil) {
    throw new Error(`Audit evidence requires an independent window: ${route.carrier}:${route.pair.join('-')}`);
  }
  const sourceId = route.flightNumberSourceIds?.[0];
  if (!sourceId) throw new Error(`Audit evidence requires a flight-number source: ${route.carrier}:${route.pair.join('-')}`);
  for (const flightNumber of route.flightNumbers ?? []) {
    evidenceRecords.push({
      carrier: route.carrier,
      pair: route.pair,
      flightNumber,
      sourceId,
      effectiveFrom: route.effectiveFrom,
      effectiveUntil: route.effectiveUntil,
    });
  }
}

const report = summarizeFlightNumberCoverage(
  parseRouteNetworkCatalog(networkRaw),
  AllianceCatalogSchema.parse(allianceRaw),
  airportRaw,
  asOf,
  { targetNetwork, evidenceRecords },
);

console.log(JSON.stringify(summaryOnly ? { ...report, ledger: undefined } : report, null, 2));
