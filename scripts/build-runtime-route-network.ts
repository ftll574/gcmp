import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { parseRouteNetworkCatalog, type RouteNetworkCatalog } from '../src/lib/schemas/route-network.ts';
import { parseAvinorXmlPublicSnapshot } from '../src/lib/schemas/avinor-xml-public.ts';
import { parseAvinorXmlPublicBatch } from '../src/lib/schemas/avinor-xml-public-batch.ts';
import { CaaWeeklyScheduleTierSchema } from '../src/lib/schemas/caa-weekly-schedule-tier.ts';
import { carrierRouteKey } from '../src/lib/carrier-identity.ts';
import { mergeRouteNetworkCatalogs, mergeRouteNumberEvidence, preserveRuntimeRoutesThenQuarantine } from '../src/lib/rtw/route-network-merge.ts';

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
const QUARANTINES_INPUT = 'flight-number-quarantines.json';
const PRESERVATION_INPUT = 'scripts/data/accepted-runtime-preservation.json';
const AVINOR_SNAPSHOT_INPUT = 'avinor-osl-public-20261006.json';
const AVINOR_XML_INPUT = 'avinor-osl-public-20261006.xml';
const AVINOR_BATCH_INPUT = 'avinor-public-airport-batch-20261006.json';
const BASELINE_RUNTIME_SHA256 = '2bd353350db6d871099a2c2aa2aee23b63b0a7e65cccbbc502d9234eeb017c8a';

const root = 'public/data/route-network';
const airportCodes = new Set<string>(
  (JSON.parse(readFileSync('public/data/airports.json', 'utf8')) as Array<{ iata: string }>).map((row) => row.iata),
);

function sha256(text: string): string {
  return createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
}

function sha256Bytes(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
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
const gatedRuntime = parseRouteNetworkCatalog({
  ...numberedRuntime,
  routes: numberedRuntime.routes.map((route) =>
    route.status === 'published'
      && route.carrierIdentity === 'provider-listed'
      && (route.flightNumbers?.length ?? 0) === 0
      && (route.flightNumberCandidates?.length ?? 0) === 0
      ? { ...route, status: 'identity-unresolved' as const }
      : route),
}, airportCodes);
const preservationRaw = readFileSync(PRESERVATION_INPUT, 'utf8');
rawByFile.set(PRESERVATION_INPUT, preservationRaw);
const quarantineRaw = readFileSync(`${root}/${QUARANTINES_INPUT}`, 'utf8');
rawByFile.set(QUARANTINES_INPUT, quarantineRaw);
const baseAcceptedRuntime = preserveRuntimeRoutesThenQuarantine(
  gatedRuntime,
  JSON.parse(preservationRaw),
  JSON.parse(quarantineRaw),
);
const avinorRaw = readFileSync(`${root}/${AVINOR_SNAPSHOT_INPUT}`, 'utf8');
rawByFile.set(AVINOR_SNAPSHOT_INPUT, avinorRaw);
const avinor = parseAvinorXmlPublicSnapshot(JSON.parse(avinorRaw));
const avinorXmlBytes = readFileSync(`${root}/${AVINOR_XML_INPUT}`);
if (avinorXmlBytes.byteLength !== avinor.snapshot.responseBytes || sha256Bytes(avinorXmlBytes) !== avinor.snapshot.responseSHA256) {
  throw new Error('Avinor original XML bytes do not match pinned size/hash in its provenance asset');
}
if (sha256(`${JSON.stringify(baseAcceptedRuntime)}\n`) !== BASELINE_RUNTIME_SHA256) {
  throw new Error('The runtime base changed since the reviewed Avinor keys were accepted; refusing to apply this release packet');
}

const avinorSource = {
  id: avinor.sourceId,
  url: avinor.snapshot.requestUrl,
  checkedOn: avinor.snapshot.retrievedAtUTC.slice(0, 10),
  freshUntilUTC: avinor.snapshot.validUntilUTC,
  note: `Avinor XML Public OSL snapshot retrieved ${avinor.snapshot.retrievedAtUTC}; exact matches to its OperatingAirlineIata, full FlightId and direction fields for upcoming schedule rows inside the one-request TimeFrom=1, TimeTo=144 hour window only. Blank via_airport means no intermediate airport was reported by this source; it does not prove physical nonstop service. Schedule rows do not prove actual operation, recurrence, award-seat or bookability; stale after ${avinor.snapshot.validUntilUTC}.`,
};
if (baseAcceptedRuntime.sources.some((source) => source.id === avinorSource.id)) throw new Error('Avinor source ID already exists in baseline runtime');

const avinorByRoute = new Map<string, typeof avinor.associations>();
for (const association of avinor.associations) {
  const [carrier, identityKey, pairText, flightNumber] = association.candidateKey.split('|');
  const [from, to] = pairText?.split('>') ?? [];
  if (!carrier || !identityKey || !from || !to || !flightNumber) throw new Error(`Malformed reviewed key: ${association.candidateKey}`);
  const routeKey = carrierRouteKey({ carrier, ...(identityKey !== carrier ? { carrierEntityKey: identityKey } : {}) }, from, to);
  const matches = baseAcceptedRuntime.routes.filter((route) => carrierRouteKey(route, ...route.pair) === routeKey);
  if (matches.length !== 1) throw new Error(`Expected exactly one runtime route for ${association.candidateKey}; found ${matches.length}`);
  const route = matches[0]!;
  if ((route.flightNumbers ?? []).includes(flightNumber)) throw new Error(`Reviewed candidate overlaps baseline confirmed data: ${association.candidateKey}`);
  if (!(route.flightNumberCandidates ?? []).includes(flightNumber)) throw new Error(`Reviewed key is no longer a runtime candidate: ${association.candidateKey}`);
  if (!association.candidateSourceIds.every((sourceId) => (route.flightNumberCandidateSourceIds ?? []).includes(sourceId))) {
    throw new Error(`Reviewed candidate source provenance changed for ${association.candidateKey}`);
  }
  const routeKeyBucket = avinorByRoute.get(routeKey) ?? [];
  routeKeyBucket.push(association);
  avinorByRoute.set(routeKey, routeKeyBucket);
}

const acceptedRuntime = parseRouteNetworkCatalog({
  ...baseAcceptedRuntime,
  sources: [...baseAcceptedRuntime.sources, avinorSource],
  routes: baseAcceptedRuntime.routes.map((route) => {
    const routeKey = carrierRouteKey(route, ...route.pair);
    const additions = avinorByRoute.get(routeKey);
    if (!additions) return route;
    const newNumbers = additions.map((association) => association.candidateKey.split('|')[3]!);
    const candidateNumbers = (route.flightNumberCandidates ?? []).filter((number) => !newNumbers.includes(number));
    const datedEvidence = additions.map((association) => ({
      flightNumber: association.candidateKey.split('|')[3]!,
      sourceId: avinor.sourceId,
      candidateSourceIds: association.candidateSourceIds,
      occurrencesUTC: [...new Set(association.supportingSourceRows
        .filter((row) => row.observationClass === 'upcoming-scheduled-row')
        .map((row) => row.scheduleTimeUTC)
        .filter((time) => Date.parse(time) > Date.parse(avinor.snapshot.retrievedAtUTC)
          && Date.parse(time) <= Date.parse(avinor.snapshot.validUntilUTC)))].sort(),
    }));
    return {
      ...route,
      flightNumbers: [...new Set([...(route.flightNumbers ?? []), ...newNumbers])].sort(),
      ...(candidateNumbers.length ? { flightNumberCandidates: candidateNumbers } : { flightNumberCandidates: undefined }),
      ...(candidateNumbers.length ? {} : { flightNumberCandidateSourceIds: undefined }),
      timeBoundFlightNumbers: [...(route.timeBoundFlightNumbers ?? []), ...datedEvidence],
    };
  }),
}, airportCodes);

const batchRaw = readFileSync(`${root}/${AVINOR_BATCH_INPUT}`, 'utf8');
rawByFile.set(AVINOR_BATCH_INPUT, batchRaw);
const avinorBatch = parseAvinorXmlPublicBatch(JSON.parse(batchRaw));
const batchXmlBytes = new Map<string, Buffer>();
for (const snapshot of avinorBatch.snapshots) {
  const path = `${root}/${snapshot.rawResponsePath.split('/').at(-1)}`;
  const bytes = readFileSync(path);
  if (bytes.byteLength !== snapshot.responseBytes || sha256Bytes(bytes) !== snapshot.responseSHA256) {
    throw new Error(`Avinor original XML bytes differ from pinned size/hash for ${snapshot.airport}`);
  }
  batchXmlBytes.set(snapshot.rawResponsePath, bytes);
}
const integrationBaseRuntimeSHA256 = sha256(`${JSON.stringify(acceptedRuntime)}\n`);
if (integrationBaseRuntimeSHA256 !== avinorBatch.integrationRuntimeSHA256) {
  throw new Error('Runtime after the frozen OSL release changed since this Avinor airport batch was accepted');
}

const oslAcceptedKeys = new Set(avinor.associations.map((association) => association.candidateKey));
const batchCaa = CaaWeeklyScheduleTierSchema.parse(JSON.parse(readFileSync(`${root}/caa-weekly-schedule-tier-20261006.json`, 'utf8')));
const batchCaaKeys = new Set(batchCaa.associations.map((association) => association.key));
for (const association of avinorBatch.associations) {
  if (oslAcceptedKeys.has(association.candidateKey)) throw new Error(`Follow-on association overlaps frozen OSL: ${association.candidateKey}`);
  if (batchCaaKeys.has(association.candidateKey)) throw new Error(`Follow-on association overlaps the actual CAA asset: ${association.candidateKey}`);
}

const snapshotByAirport = new Map(avinorBatch.snapshots.map((snapshot) => [snapshot.airport, snapshot] as const));
const batchByRoute = new Map<string, typeof avinorBatch.associations>();
for (const association of avinorBatch.associations) {
  const candidate = association.candidate;
  const routeKey = carrierRouteKey({ carrier: candidate.carrierCode, ...(candidate.carrierEntityKey !== candidate.carrierCode ? { carrierEntityKey: candidate.carrierEntityKey } : {}) }, candidate.origin, candidate.destination);
  const matches = acceptedRuntime.routes.filter((route) => carrierRouteKey(route, ...route.pair) === routeKey);
  if (matches.length !== 1) throw new Error(`Expected exactly one runtime route for ${association.candidateKey}; found ${matches.length}`);
  const route = matches[0]!;
  if ((route.flightNumbers ?? []).includes(candidate.flightDesignator)) throw new Error(`Follow-on key overlaps current confirmed data: ${association.candidateKey}`);
  if (!(route.flightNumberCandidates ?? []).includes(candidate.flightDesignator)) throw new Error(`Follow-on key is no longer a current runtime candidate: ${association.candidateKey}`);
  if (!candidate.candidateSourceIds.every((sourceId) => (route.flightNumberCandidateSourceIds ?? []).includes(sourceId))) {
    throw new Error(`Follow-on candidate source provenance changed for ${association.candidateKey}`);
  }
  const bucket = batchByRoute.get(routeKey) ?? [];
  bucket.push(association);
  batchByRoute.set(routeKey, bucket);
}

const batchSources = avinorBatch.snapshots.map((snapshot) => ({
  id: snapshot.sourceId,
  url: snapshot.requestUrl,
  checkedOn: snapshot.retrievedAtUTC.slice(0, 10),
  freshUntilUTC: snapshot.validUntilUTC,
  note: `Avinor XML Public ${snapshot.airport} snapshot retrieved ${snapshot.retrievedAtUTC}; exact OperatingAirlineIata, full FlightId and direction matches are retained with source-listed UTC schedules only. TimeFrom=1 and TimeTo=144 hours; stale after ${snapshot.validUntilUTC}. Existing route-candidate dates are preserved and not extended.`,
}));
if (batchSources.some((source) => acceptedRuntime.sources.some((existing) => existing.id === source.id))) {
  throw new Error('An Avinor airport-batch source ID already exists in the integration runtime');
}

const batchRuntime = parseRouteNetworkCatalog({
  ...acceptedRuntime,
  sources: [...acceptedRuntime.sources, ...batchSources],
  routes: acceptedRuntime.routes.map((route) => {
    const routeKey = carrierRouteKey(route, ...route.pair);
    const additions = batchByRoute.get(routeKey);
    if (!additions) return route;
    const datedEvidence = additions.map((association) => {
      const candidate = association.candidate;
      const eligibleSnapshots = association.supportingRows
        .filter((row) => row.observationClass === 'upcoming-scheduled-row')
        .map((row) => snapshotByAirport.get(row.sourceAirport))
        .filter((snapshot): snapshot is NonNullable<typeof snapshot> => snapshot !== undefined)
        .sort((a, b) => b.retrievedAtUTC.localeCompare(a.retrievedAtUTC));
      const snapshot = eligibleSnapshots[0];
      if (!snapshot) throw new Error(`No upcoming Avinor snapshot row remains for ${association.candidateKey}`);
      const occurrencesUTC = [...new Set(association.supportingRows
        .filter((row) => row.sourceAirport === snapshot.airport && row.observationClass === 'upcoming-scheduled-row')
        .map((row) => row.scheduleTimeUTC)
        .filter((time) => Date.parse(time) > Date.parse(snapshot.retrievedAtUTC)
          && Date.parse(time) <= Date.parse(snapshot.validUntilUTC)))].sort();
      if (occurrencesUTC.length === 0) throw new Error(`Selected airport snapshot has no in-window upcoming row for ${association.candidateKey}`);
      return {
        flightNumber: candidate.flightDesignator,
        sourceId: snapshot.sourceId,
        candidateSourceIds: candidate.candidateSourceIds,
        occurrencesUTC,
        candidateWindow: {
          ...(candidate.effectiveFrom ? { effectiveFrom: candidate.effectiveFrom } : {}),
          ...(candidate.effectiveUntil ? { effectiveUntil: candidate.effectiveUntil } : {}),
          runtimeValidityAtCaptureDate: candidate.runtimeValidityAtCaptureDate,
          hasOccurrenceAfterEffectiveUntil: Boolean(candidate.effectiveUntil && occurrencesUTC.some((time) => time.slice(0, 10) > candidate.effectiveUntil!)),
        },
        plannerUse: 'display-only' as const,
      };
    });
    const newNumbers = additions.map((association) => association.candidate.flightDesignator);
    const candidateNumbers = (route.flightNumberCandidates ?? []).filter((number) => !newNumbers.includes(number));
    return {
      ...route,
      flightNumbers: [...new Set([...(route.flightNumbers ?? []), ...newNumbers])].sort(),
      ...(candidateNumbers.length ? { flightNumberCandidates: candidateNumbers } : { flightNumberCandidates: undefined }),
      ...(candidateNumbers.length ? {} : { flightNumberCandidateSourceIds: undefined }),
      timeBoundFlightNumbers: [...(route.timeBoundFlightNumbers ?? []), ...datedEvidence],
    };
  }),
}, airportCodes);

rawByFile.set(AVINOR_XML_INPUT, '');

// This artifact is fetched on every app startup. Keep it compact; the source
// layers remain human-reviewable and the tiny meta file carries diagnostics.
const runtimeText = `${JSON.stringify(batchRuntime)}\n`;
writeFileSync(`${root}/runtime-current.json`, runtimeText);

const runtime = batchRuntime;
const acceptedRouteKeys = new Set(JSON.parse(preservationRaw).routes.map((route: RouteNetworkCatalog['routes'][number]) => carrierRouteKey(route, ...route.pair)));
const publishedRoutes = runtime.routes.filter((route) => route.status === 'published');
const unnumberedPublishedRoutes = publishedRoutes.filter((route) =>
  !acceptedRouteKeys.has(carrierRouteKey(route, ...route.pair))
    && (route.flightNumbers?.length ?? 0) === 0 && (route.flightNumberCandidates?.length ?? 0) === 0,
);
if (unnumberedPublishedRoutes.length > 0) {
  throw new Error(`Published routes without flight identity: ${unnumberedPublishedRoutes
    .slice(0, 20)
    .map((route) => `${route.carrier}:${route.pair[0]}-${route.pair[1]}`)
    .join(', ')}${unnumberedPublishedRoutes.length > 20 ? ` (+${unnumberedPublishedRoutes.length - 20} more)` : ''}`);
}
const confirmedOperatingRoutes = publishedRoutes.filter((route) => route.carrierIdentity === 'operating').length;
const providerListedRoutes = publishedRoutes.filter((route) => route.carrierIdentity === 'provider-listed').length;
const unknownIdentityRoutes = publishedRoutes.filter((route) => !route.carrierIdentity || route.carrierIdentity === 'unknown').length;
const confirmedFlightNumberRoutes = publishedRoutes.filter((route) => (route.flightNumbers?.length ?? 0) > 0).length;
const candidateFlightNumberRoutes = publishedRoutes.filter((route) => (route.flightNumberCandidates?.length ?? 0) > 0).length;
const anyFlightNumberRoutes = publishedRoutes.filter((route) =>
  (route.flightNumbers?.length ?? 0) > 0 || (route.flightNumberCandidates?.length ?? 0) > 0,
).length;
const routeCountByCarrier = new Map<string, number>();
const confirmedOperatingCountByCarrier = new Map<string, number>();
const providerListedCountByCarrier = new Map<string, number>();
const unknownIdentityCountByCarrier = new Map<string, number>();
for (const route of runtime.routes) {
  if (route.status !== 'published') continue;
  routeCountByCarrier.set(route.carrier, (routeCountByCarrier.get(route.carrier) ?? 0) + 1);
  const identityCounts = route.carrierIdentity === 'provider-listed'
    ? providerListedCountByCarrier
    : route.carrierIdentity === 'operating' ? confirmedOperatingCountByCarrier : unknownIdentityCountByCarrier;
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
    ...(route.timeBoundFlightNumbers ?? []).flatMap((evidence) => [evidence.sourceId, ...evidence.candidateSourceIds]),
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

// Deterministic build date: the newest input file's mtime (UTC date only),
// never "today". Re-running the build against unchanged inputs therefore
// produces byte-identical output, which keeps generated artifacts diffable.
const builtOn = new Date(
  Math.max(
    ...[...INPUTS, ...OPTIONAL_INPUTS, CORRECTIONS_INPUT, NUMBER_INPUT, QUARANTINES_INPUT, PRESERVATION_INPUT, AVINOR_SNAPSHOT_INPUT, AVINOR_XML_INPUT, AVINOR_BATCH_INPUT, ...[...batchXmlBytes.keys()].map((path) => path.split('/').at(-1)!)]
      .map((file) => `${root}/${file}`)
      .filter((path) => existsSync(path))
      .map((path) => statSync(path).mtimeMs),
  ),
).toISOString().slice(0, 10);

const meta = {
  version: 1,
  builtOn,
  // Data-license provenance. The route-network layers aggregate ODbL
  // sources (MrAirspace, ADSBiq) whose share-alike terms govern the
  // derived database; see DATA_LICENSE and THIRD_PARTY_NOTICES.md.
  source: 'curated + provider-listed route-network layers, including six-day Avinor XML Public snapshots (see THIRD_PARTY_NOTICES.md and exact freshness metadata)',
  license: 'ODbL-1.0',
  licenseNote: 'Derived database of ODbL-licensed ADS-B route sources; share-alike applies. Avinor snapshot evidence carries separate attribution terms and is stale after its recorded UTC deadline.',
  mergeStrategy: 'curated + generated',
  inputs: Object.fromEntries([...INPUTS, ...OPTIONAL_INPUTS.filter((file) => rawByFile.has(file)), CORRECTIONS_INPUT, NUMBER_INPUT, QUARANTINES_INPUT, PRESERVATION_INPUT, AVINOR_SNAPSHOT_INPUT, AVINOR_XML_INPUT, AVINOR_BATCH_INPUT, ...[...batchXmlBytes.keys()].map((path) => path.split('/').at(-1)!)]
    .map((file) => [file, file === AVINOR_XML_INPUT ? sha256Bytes(avinorXmlBytes) : batchXmlBytes.has(`route-network/${file}`) ? sha256Bytes(batchXmlBytes.get(`route-network/${file}`)!) : sha256(rawByFile.get(file)!)])),
  outputSha256: sha256(runtimeText),
  routes: runtime.routes.length,
  publishedRoutes: publishedRoutes.length,
  carriers: new Set(runtime.routes.map((route) => route.carrier)).size,
  confirmedOperatingRoutes,
  providerListedRoutes,
  unknownIdentityRoutes,
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
  unknownIdentityCountByCarrier: Object.fromEntries(
    [...unknownIdentityCountByCarrier.entries()].sort(([a], [b]) => a.localeCompare(b)),
  ),
  originShards,
};
writeFileSync(`${root}/runtime-current.meta.json`, `${JSON.stringify(meta, null, 2)}\n`);

console.log(JSON.stringify(meta, null, 2));
