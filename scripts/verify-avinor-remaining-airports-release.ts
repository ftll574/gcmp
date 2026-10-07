import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseRouteNetworkCatalog } from '../src/lib/schemas/route-network.ts';
import { CaaWeeklyScheduleTierSchema } from '../src/lib/schemas/caa-weekly-schedule-tier.ts';
import {
  parseAvinorRemainingAirportsLedgerJsonl,
  parseAvinorRemainingAirportsRelease,
} from '../src/lib/schemas/avinor-remaining-airports.ts';
import { carrierRouteKey } from '../src/lib/carrier-identity.ts';

const ROOT = 'public/data/route-network';
const RELEASE_PATH = `${ROOT}/avinor-remaining-airports-release-20261007.json`;
const LEDGER_PATH = `${ROOT}/avinor-remaining-airports-accepted-20261007.jsonl`;
const RUNTIME_PATH = `${ROOT}/runtime-current.json`;
const META_PATH = `${ROOT}/runtime-current.meta.json`;
const CAA_PATH = `${ROOT}/caa-weekly-schedule-tier-20261006.json`;

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function directedIdentityKey(carrier: string, identity: string, from: string, to: string, number: string): string {
  return `${carrier}|${identity}|${from}>${to}|${number}`;
}

function routeIdentityKey(carrier: string, identity: string, from: string, to: string): string {
  return `${carrier}|${identity}|${from}>${to}`;
}

const release = parseAvinorRemainingAirportsRelease(JSON.parse(readFileSync(RELEASE_PATH, 'utf8')));
const ledgerText = readFileSync(LEDGER_PATH, 'utf8');
const ledgerBytes = Buffer.from(ledgerText, 'utf8');
assert(ledgerBytes.byteLength === release.acceptedInput.bytes && sha256(ledgerBytes) === release.acceptedInput.sha256,
  'Accepted ledger size/hash differs from the independently reviewed release pin');
const rows = parseAvinorRemainingAirportsLedgerJsonl(ledgerText);
assert(rows.length === release.accepted.identityGroups, 'Accepted ledger identity count changed');

const runtime = parseRouteNetworkCatalog(JSON.parse(readFileSync(RUNTIME_PATH, 'utf8')));
const meta = JSON.parse(readFileSync(META_PATH, 'utf8')) as {
  avinorRemainingAirports?: { acceptedIdentityGroups: number; retainedOccurrences: number; newCarrierDirectedRoutes: number; existingCarrierDirectedRoutes: number; sourceSnapshots: number };
  routes: number;
  publishedRoutes: number;
};
const releaseMeta = meta.avinorRemainingAirports;
assert(releaseMeta?.acceptedIdentityGroups === 143 && releaseMeta.retainedOccurrences === 517
  && releaseMeta.newCarrierDirectedRoutes === 45 && releaseMeta.existingCarrierDirectedRoutes === 31
  && releaseMeta.sourceSnapshots === 24, 'Runtime metadata does not report the exact accepted remaining-airports batch');
assert(meta.routes === release.runtimeBaseline.routeRecords + 45
  && meta.publishedRoutes === release.runtimeBaseline.publishedRouteRecords + 45,
'Runtime route projection does not match the independently reviewed +45 route-record projection');
assert(runtime.routes.length === meta.routes && runtime.routes.filter((route) => route.status === 'published').length === meta.publishedRoutes,
  'Runtime catalog route totals do not match its generated metadata');

const snapshotByAirport = new Map(release.sourceSnapshots.map((snapshot) => [snapshot.airport, snapshot] as const));
const routeByIdentity = new Map(runtime.routes.map((route) => [carrierRouteKey(route, ...route.pair), route] as const));
const airportPairs = new Set<string>();
const carrierRoutes = new Set<string>();
const acceptedKeys = new Set<string>();
const currentOccurrences: Array<{ key: string; routeKey: string; pair: string }> = [];
let retainedOccurrences = 0;
const now = Date.now();
for (const row of rows) {
  assert(!acceptedKeys.has(row.candidateKey), `Duplicate accepted identity: ${row.candidateKey}`);
  acceptedKeys.add(row.candidateKey);
  const { carrierCode, carrierEntityKey, origin, destination, flightDesignator } = row.candidate;
  assert(carrierCode !== 'LTR', `Held carrier identity appeared in accepted release: ${row.candidateKey}`);
  const routeKey = routeIdentityKey(carrierCode, carrierEntityKey, origin, destination);
  const route = routeByIdentity.get(carrierRouteKey({ carrier: carrierCode, ...(carrierEntityKey !== carrierCode ? { carrierEntityKey } : {}) }, origin, destination));
  assert(route?.status === 'published' && (route.flightNumbers ?? []).includes(flightDesignator),
    `Accepted identity is not discoverable from runtime route records: ${row.candidateKey}`);
  assert(route.carrierIdentity === 'provider-listed' || route.carrierIdentity === 'operating',
    `Accepted route lacks a bounded carrier-identity classification: ${row.candidateKey}`);
  const matchingEvidence = (route.timeBoundFlightNumbers ?? []).filter((evidence) => evidence.flightNumber === flightDesignator);
  const details = matchingEvidence.flatMap((evidence) => (evidence.occurrenceDetails ?? [])
    .filter((detail) => detail.candidateKey === row.candidateKey)
    .map((detail) => ({ evidence, detail })));
  assert(details.length === row.occurrenceEvidence.length, `Occurrence detail count changed for ${row.candidateKey}`);
  airportPairs.add(`${origin}>${destination}`);
  carrierRoutes.add(routeKey);

  for (const occurrence of row.occurrenceEvidence) {
    const snapshot = snapshotByAirport.get(occurrence.sourceAirport);
    assert(snapshot, `Missing source snapshot for ${occurrence.sourceAirport}`);
    assert(occurrence.snapshotSHA256 === snapshot.responseSHA256 && occurrence.requestUrl === snapshot.requestUrl
      && occurrence.retrievedAtUTC === snapshot.retrievedAtUTC,
    `Occurrence source lineage differs from its pinned snapshot for ${row.candidateKey}`);
    const sourceId = `avinor-remaining-airports-${occurrence.sourceAirport.toLowerCase()}-20261007`;
    const runtimeSource = runtime.sources.find((source) => source.id === sourceId);
    assert(runtimeSource?.rawAssetPath === snapshot.rawAssetPath && runtimeSource.freshUntilUTC === snapshot.freshUntilUTC,
      `Runtime source freshness/raw asset differs from the release for ${occurrence.sourceAirport}`);
    const match = details.find(({ evidence, detail }) => evidence.sourceId === sourceId
      && detail.scheduleTimeUTC === occurrence.scheduleTimeUTC
      && detail.expiresAtUTC === occurrence.expiresAtUTC
      && detail.sourceAirport === occurrence.sourceAirport
      && detail.sourceRow === occurrence.sourceRow
      && detail.sourceUniqueID === occurrence.sourceUniqueID);
    assert(match, `Exact occurrence row/unique ID/schedule expiry is missing: ${row.candidateKey} at ${occurrence.scheduleTimeUTC}`);
    assert(match.detail.sourceOperatingCarrierIATA === occurrence.operatingCarrierIATA
      && match.detail.statusCode === occurrence.statusCode
      && match.detail.arrDepRaw === occurrence.arrDepRaw
      && match.detail.viaAirportRaw === occurrence.viaAirportRaw
      && JSON.stringify(match.detail.viaAirports) === JSON.stringify(occurrence.viaAirports)
      && match.detail.oldCandidateWindowConflict === occurrence.oldCandidateWindowConflict
      && match.detail.oldCandidateWindowRelationship === occurrence.oldCandidateWindowRelationship,
    `Raw occurrence fields or reviewed candidate-window context changed: ${row.candidateKey} at ${occurrence.scheduleTimeUTC}`);
    retainedOccurrences += 1;
    if (now < Date.parse(occurrence.scheduleTimeUTC) && now < Date.parse(snapshot.freshUntilUTC)) {
      currentOccurrences.push({ key: row.candidateKey, routeKey, pair: `${origin}>${destination}` });
    }
  }
}
assert(acceptedKeys.size === 143 && retainedOccurrences === 517, 'Runtime does not retain all 143 identities and 517 occurrences');
assert(airportPairs.size === 76 && carrierRoutes.size === 76, 'Accepted directed-pair or carrier-route totals changed');

const confirmedKeys = new Set(runtime.routes.flatMap((route) => (route.flightNumbers ?? []).map((flightNumber) =>
  directedIdentityKey(route.carrier, route.carrierEntityKey ?? route.carrier, route.pair[0], route.pair[1], flightNumber),
)));
assert([...acceptedKeys].every((key) => confirmedKeys.has(key)), 'A new accepted identity is missing from the runtime confirmed identity set');
const priorKeys = new Set([...confirmedKeys].filter((key) => !acceptedKeys.has(key)));
assert(priorKeys.size === release.runtimeBaseline.confirmedFlightIdentityKeys,
  `Preexisting confirmed identities changed after subtracting this release: ${priorKeys.size}`);

const heldKeys = new Set([
  'LTR|LTR|BOO>VRY|LTR001',
  'LTR|LTR|BOO>VRY|LTR003',
  'LTR|LTR|VRY>BOO|LTR002',
  'LTR|LTR|VRY>BOO|LTR004',
]);
for (const key of heldKeys) {
  assert(!confirmedKeys.has(key), `Reviewer-held LTR identity entered runtime: ${key}`);
  assert(!runtime.routes.some((route) => (route.timeBoundFlightNumbers ?? []).some((evidence) => (evidence.occurrenceDetails ?? []).some((detail) => detail.candidateKey === key))),
    `Reviewer-held LTR occurrence evidence entered runtime: ${key}`);
}

for (const snapshot of release.sourceSnapshots) {
  const bytes = readFileSync(`public/data/${snapshot.rawAssetPath}`);
  assert(bytes.byteLength === snapshot.responseBytes && sha256(bytes) === snapshot.responseSHA256,
    `Original Avinor XML response bytes differ from the independent pin for ${snapshot.airport}`);
}

const caa = CaaWeeklyScheduleTierSchema.parse(JSON.parse(readFileSync(CAA_PATH, 'utf8')));
const caaKeys = new Set(caa.associations.map((row) => row.key));
const caaOverlap = [...acceptedKeys].filter((key) => caaKeys.has(key));
assert(caa.associationCount === 488 && caaOverlap.length === 0,
  `CAA 488 reference set changed or overlaps remaining Avinor identities (${caa.associationCount}, ${caaOverlap.length})`);

console.log(JSON.stringify({
  verified: true,
  asOfUTC: new Date(now).toISOString(),
  releaseId: release.releaseId,
  accepted: {
    identityGroups: acceptedKeys.size,
    occurrenceEvidence: retainedOccurrences,
    directedEndpointPairs: airportPairs.size,
    carrierDirectedRoutes: carrierRoutes.size,
    newCarrierDirectedRouteRecords: releaseMeta.newCarrierDirectedRoutes,
    existingCarrierDirectedRouteRecords: releaseMeta.existingCarrierDirectedRoutes,
    sources: release.sourceSnapshots.length,
  },
  currentEligibility: {
    occurrences: currentOccurrences.length,
    identities: new Set(currentOccurrences.map((row) => row.key)).size,
    carrierDirectedRoutes: new Set(currentOccurrences.map((row) => row.routeKey)).size,
    directedEndpointPairs: new Set(currentOccurrences.map((row) => row.pair)).size,
  },
  held: { identityGroupsNotPromoted: heldKeys.size, routes: ['BOO>VRY', 'VRY>BOO'], code: 'LTR' },
  runtime: { routes: meta.routes, publishedRoutes: meta.publishedRoutes, confirmedFlightIdentityKeys: confirmedKeys.size, preservedPriorIdentityKeys: priorKeys.size },
  caa: { associations: caa.associationCount, overlap: caaOverlap.length },
  acceptedInputSHA256: release.acceptedInput.sha256,
  runtimeSHA256: sha256(readFileSync(RUNTIME_PATH)),
  sourceSnapshots: release.sourceSnapshots.map((snapshot) => ({ airport: snapshot.airport, responseBytes: snapshot.responseBytes, responseSHA256: snapshot.responseSHA256, freshUntilUTC: snapshot.freshUntilUTC })),
}, null, 2));
