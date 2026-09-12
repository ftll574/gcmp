import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { parseRouteNetworkCatalog, type RouteNetworkCatalog } from '../src/lib/schemas/route-network.ts';
import { resolveRouteBuildDate } from '../src/lib/rtw/route-build-date.ts';
import { mergeRouteNetworkCatalogs, mergeRouteNumberEvidence } from '../src/lib/rtw/route-network-merge.ts';

const INPUTS = [
  'current.json',
  'recent-current.json',
  'observed-current.json',
  'affiliate-current.json',
  'bts-marketing-current.json',
  'standing-current.json',
] as const;
const OPTIONAL_INPUTS = [
  'aviation-edge-global-current.json',
  'validated-static-current.json',
] as const;
const NUMBER_INPUT = 'flight-numbers-current.json';
const CORRECTIONS_INPUT = 'current-corrections.json';

const root = 'public/data/route-network';
const buildDate = resolveRouteBuildDate(process.argv[2]);
const airportCodes = new Set<string>(
  (JSON.parse(readFileSync('public/data/airports.json', 'utf8')) as Array<{ iata: string }>).map((row) => row.iata),
);

function sha256(text: string): string {
  return createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
}

function normalizedBytes(text: string): number {
  return Buffer.byteLength(text.replace(/\r\n/g, '\n'));
}

const rawByFile = new Map<string, string>();
const catalogs = INPUTS.map((file) => {
  const raw = readFileSync(`${root}/${file}`, 'utf8');
  rawByFile.set(file, raw);
  return parseRouteNetworkCatalog(JSON.parse(raw), airportCodes);
});
const optionalCatalogs = OPTIONAL_INPUTS.flatMap((file) => {
  const path = `${root}/${file}`;
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, 'utf8');
  rawByFile.set(file, raw);
  return [parseRouteNetworkCatalog(JSON.parse(raw), airportCodes)];
});

const baseRuntime = catalogs.slice(1).reduce<RouteNetworkCatalog>(
  (network, layer) => mergeRouteNetworkCatalogs(network, layer),
  catalogs[0]!,
);
const discoveredRuntime = optionalCatalogs.reduce<RouteNetworkCatalog>(
  (network, layer) => mergeRouteNetworkCatalogs(network, layer),
  baseRuntime,
);
const correctionsRaw = readFileSync(`${root}/${CORRECTIONS_INPUT}`, 'utf8');
rawByFile.set(CORRECTIONS_INPUT, correctionsRaw);
const correctedRuntime = mergeRouteNetworkCatalogs(
  parseRouteNetworkCatalog(JSON.parse(correctionsRaw), airportCodes),
  discoveredRuntime,
);
const numberRaw = readFileSync(`${root}/${NUMBER_INPUT}`, 'utf8');
rawByFile.set(NUMBER_INPUT, numberRaw);
const numberedRuntime = mergeRouteNumberEvidence(
  correctedRuntime,
  parseRouteNetworkCatalog(JSON.parse(numberRaw), airportCodes),
);
// Provider-listed route relationships are useful discovery evidence, but a
// current planner edge must at least carry a source-backed commercial flight
// identity. Keep unresolved relationships in the audit graph without
// presenting them as current selectable routes.
const runtime = parseRouteNetworkCatalog({
  ...numberedRuntime,
  routes: numberedRuntime.routes.map((route) =>
    route.status === 'published'
      && route.carrierIdentity === 'provider-listed'
      && (route.flightNumbers?.length ?? 0) === 0
      && (route.flightNumberCandidates?.length ?? 0) === 0
      ? { ...route, status: 'identity-unresolved' as const }
      : route),
}, airportCodes);

// This artifact is fetched on every app startup. Keep it compact; the source
// layers remain human-reviewable and the tiny meta file carries diagnostics.
const runtimeText = `${JSON.stringify(runtime)}\n`;
writeFileSync(`${root}/runtime-current.json`, runtimeText);

const publishedRoutes = runtime.routes.filter((route) => route.status === 'published');
const unnumberedPublishedRoutes = publishedRoutes.filter((route) =>
  (route.flightNumbers?.length ?? 0) === 0 && (route.flightNumberCandidates?.length ?? 0) === 0,
);
if (unnumberedPublishedRoutes.length > 0) {
  throw new Error(`Published routes without flight identity: ${unnumberedPublishedRoutes
    .slice(0, 20)
    .map((route) => `${route.carrier}:${route.pair[0]}-${route.pair[1]}`)
    .join(', ')}${unnumberedPublishedRoutes.length > 20 ? ` (+${unnumberedPublishedRoutes.length - 20} more)` : ''}`);
}
const confirmedOperatingRoutes = publishedRoutes.filter((route) => route.carrierIdentity !== 'provider-listed').length;
const providerListedRoutes = publishedRoutes.length - confirmedOperatingRoutes;
const confirmedFlightNumberRoutes = publishedRoutes.filter((route) => (route.flightNumbers?.length ?? 0) > 0).length;
const candidateFlightNumberRoutes = publishedRoutes.filter((route) => (route.flightNumberCandidates?.length ?? 0) > 0).length;
const anyFlightNumberRoutes = publishedRoutes.filter((route) =>
  (route.flightNumbers?.length ?? 0) > 0 || (route.flightNumberCandidates?.length ?? 0) > 0,
).length;
const routeCountByCarrier = new Map<string, number>();
const confirmedOperatingCountByCarrier = new Map<string, number>();
const providerListedCountByCarrier = new Map<string, number>();
for (const route of runtime.routes) {
  if (route.status !== 'published') continue;
  routeCountByCarrier.set(route.carrier, (routeCountByCarrier.get(route.carrier) ?? 0) + 1);
  const identityCounts = route.carrierIdentity === 'provider-listed'
    ? providerListedCountByCarrier
    : confirmedOperatingCountByCarrier;
  identityCounts.set(route.carrier, (identityCounts.get(route.carrier) ?? 0) + 1);
}

const shardRoot = `${root}/runtime-origins`;
mkdirSync(shardRoot, { recursive: true });
const originShards: Record<string, { routes: number; bytes: number; sha256: string }> = {};
for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
  const routes = runtime.routes.filter((route) => route.pair[0].startsWith(letter));
  const path = `${shardRoot}/${letter}.json`;
  if (routes.length === 0) {
    try { unlinkSync(path); } catch { /* no stale shard */ }
    continue;
  }
  const sourceIds = new Set(routes.flatMap((route) => [
    ...route.sourceIds,
    ...(route.flightNumberSourceIds ?? []),
    ...(route.flightNumberCandidateSourceIds ?? []),
  ]));
  const shard: RouteNetworkCatalog = {
    version: runtime.version,
    coverage: runtime.coverage,
    sources: runtime.sources.filter((source) => sourceIds.has(source.id)),
    carrierUniverses: [],
    routes,
  };
  parseRouteNetworkCatalog(shard, airportCodes);
  const text = `${JSON.stringify(shard)}\n`;
  writeFileSync(path, text);
  originShards[letter] = { routes: routes.length, bytes: normalizedBytes(text), sha256: sha256(text) };
}

const meta = {
  version: 1,
  builtOn: buildDate,
  inputs: Object.fromEntries([...INPUTS, ...OPTIONAL_INPUTS.filter((file) => rawByFile.has(file)), CORRECTIONS_INPUT, NUMBER_INPUT]
    .map((file) => [file, sha256(rawByFile.get(file)!)])),
  outputSha256: sha256(runtimeText),
  routes: runtime.routes.length,
  publishedRoutes: publishedRoutes.length,
  carriers: new Set(runtime.routes.map((route) => route.carrier)).size,
  confirmedOperatingRoutes,
  providerListedRoutes,
  confirmedFlightNumberRoutes,
  candidateFlightNumberRoutes,
  anyFlightNumberRoutes,
  routeCountByCarrier: Object.fromEntries([...routeCountByCarrier.entries()].sort(([a], [b]) => a.localeCompare(b))),
  confirmedOperatingCountByCarrier: Object.fromEntries(
    [...confirmedOperatingCountByCarrier.entries()].sort(([a], [b]) => a.localeCompare(b)),
  ),
  providerListedCountByCarrier: Object.fromEntries(
    [...providerListedCountByCarrier.entries()].sort(([a], [b]) => a.localeCompare(b)),
  ),
  originShards,
};
writeFileSync(`${root}/runtime-current.meta.json`, `${JSON.stringify(meta, null, 2)}\n`);

console.log(JSON.stringify(meta, null, 2));
