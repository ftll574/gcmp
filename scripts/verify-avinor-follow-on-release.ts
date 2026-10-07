import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseAvinorXmlPublicSnapshot } from '../src/lib/schemas/avinor-xml-public.ts';
import { parseAvinorXmlPublicBatch } from '../src/lib/schemas/avinor-xml-public-batch.ts';
import { parseAvinorFollowOnLedgerJsonl, parseAvinorFollowOnRelease } from '../src/lib/schemas/avinor-follow-on.ts';
import { CaaWeeklyScheduleTierSchema } from '../src/lib/schemas/caa-weekly-schedule-tier.ts';
import { parseRouteNetworkCatalog } from '../src/lib/schemas/route-network.ts';

const DATA = 'public/data';
const NETWORK = `${DATA}/route-network`;
const RELEASE_PATH = `${NETWORK}/avinor-follow-on-release-20261006.json`;
const LEDGER_PATH = `${NETWORK}/avinor-follow-on-evidence-20261006.jsonl`;
const HELD_PATH = 'docs/avinor-follow-on-release-20261007/reviewer-held-ledger.jsonl';
const FIRST_RELEASE_PATH = `${NETWORK}/avinor-osl-public-20261006.json`;
const FIRST_XML_PATH = `${NETWORK}/avinor-osl-public-20261006.xml`;
const BATCH_PATH = `${NETWORK}/avinor-public-airport-batch-20261006.json`;
const RUNTIME_PATH = `${NETWORK}/runtime-current.json`;
const CAA_PATH = `${NETWORK}/caa-weekly-schedule-tier-20261006.json`;
const FIRST_XML_SHA256 = '78403435f3c31ae82d9b45249267cf5e843a7db76bf81bd1f39bb856a65adf7f';
const BASELINE_ASSOCIATIONS = { associations: 839, designators: 829, directedRoutes: 295 };

function sha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function directedIdentityKey(carrier: string, identity: string, from: string, to: string, number: string): string {
  return `${carrier}|${identity}|${from}>${to}|${number}`;
}

function routeIdentityKey(carrier: string, identity: string, from: string, to: string): string {
  return `${carrier}|${identity}|${from}>${to}`;
}

function sourceIdForAirport(airport: string): string {
  return airport === 'OSL'
    ? 'avinor-xml-public-osl-20261006'
    : `avinor-xml-public-batch-${airport.toLowerCase()}-20261006`;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const release = parseAvinorFollowOnRelease(JSON.parse(readFileSync(RELEASE_PATH, 'utf8')));
const ledgerRaw = readFileSync(LEDGER_PATH, 'utf8');
const ledgerBytes = Buffer.from(ledgerRaw, 'utf8');
assert(ledgerBytes.byteLength === release.assets.acceptedLedger.bytes, 'Follow-on ledger byte count changed');
assert(sha256(ledgerBytes) === release.assets.acceptedLedger.sha256, 'Follow-on ledger SHA-256 changed');
assert(release.assets.acceptedLedger.path === 'route-network/avinor-follow-on-evidence-20261006.jsonl', 'Follow-on ledger path changed');
const rows = parseAvinorFollowOnLedgerJsonl(ledgerRaw);
assert(rows.length === 1373, `Expected 1,373 accepted follow-on identities, found ${rows.length}`);
assert(rows.reduce((sum, row) => sum + row.occurrences.length, 0) === 5421, 'Accepted follow-on occurrence count changed');
assert(new Set(rows.map((row) => row.candidateKey)).size === rows.length, 'Follow-on accepted keys are not unique');

const heldRaw = readFileSync(HELD_PATH, 'utf8');
assert(sha256(heldRaw) === release.held.ledgerSHA256, 'Reviewer-held ledger SHA-256 changed');
const heldRows = heldRaw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as { candidateKey: string; occurrences: unknown[] });
const heldKeys = new Set(heldRows.map((row) => row.candidateKey));
assert(heldRows.length === 8 && heldRows.reduce((sum, row) => sum + row.occurrences.length, 0) === 28, 'Held partition counts changed');
assert(!rows.some((row) => heldKeys.has(row.candidateKey)), 'A reviewer-held identity entered the accepted ledger');

for (const [path, digest] of [
  [release.assets.validationReportPath, release.assets.validationReportSHA256],
  [release.assets.cachedTermsSnapshotPath, release.assets.cachedTermsSnapshotSHA256],
] as const) {
  assert(sha256(readFileSync(path)) === digest, `Pinned Avinor packet document hash changed: ${path}`);
}

const first = parseAvinorXmlPublicSnapshot(JSON.parse(readFileSync(FIRST_RELEASE_PATH, 'utf8')));
const firstXml = readFileSync(FIRST_XML_PATH);
assert(sha256(firstXml) === first.snapshot.responseSHA256 && sha256(firstXml) === FIRST_XML_SHA256, 'First 412 release XML bytes changed');
assert(firstXml.byteLength === first.snapshot.responseBytes, 'First 412 release XML byte count changed');
const firstKeys = new Set(first.associations.map((row) => row.candidateKey));
const followOnKeys = new Set(rows.map((row) => row.candidateKey));
assert(firstKeys.size === release.firstReleaseDisjointnessReference.identityGroups, 'First release identity count changed');
assert(!rows.some((row) => firstKeys.has(row.candidateKey)), 'Follow-on identities overlap the first 412 release');

const batch = parseAvinorXmlPublicBatch(JSON.parse(readFileSync(BATCH_PATH, 'utf8')));
const batchKeys = new Set(batch.associations.map((row) => row.candidateKey));
const priorCandidateRows = rows.filter((row) => row.runtimeBaseline.exactIdentityWasCandidateBeforeHandoff);
const newRows = rows.filter((row) => !row.runtimeBaseline.exactIdentityWasCandidateBeforeHandoff);
assert(priorCandidateRows.length === 201 && newRows.length === 1172, 'Expected 201 prior candidate and 1,172 net-new identities');
assert(priorCandidateRows.every((row) => batchKeys.has(row.candidateKey)), 'Prior candidate identities no longer match the already-published 201 identity set');
assert(newRows.every((row) => !batchKeys.has(row.candidateKey)), 'A net-new follow-on identity overlaps the previously published batch');
assert(priorCandidateRows.reduce((sum, row) => sum + row.occurrences.length, 0) === 726, 'Prior candidate occurrence count changed');
const uniqueAcceptedKeys = new Set([...firstKeys, ...batchKeys, ...followOnKeys]);
assert(uniqueAcceptedKeys.size === 1785, `First, batch and follow-on identity union changed: ${uniqueAcceptedKeys.size}`);

const airports = JSON.parse(readFileSync(`${DATA}/airports.json`, 'utf8')) as Array<{ iata: string; lat?: number; lon?: number }>;
const airportCodes = new Set(airports.map((airport) => airport.iata));
const runtime = parseRouteNetworkCatalog(JSON.parse(readFileSync(RUNTIME_PATH, 'utf8')), airportCodes);
const sourceById = new Map(runtime.sources.map((source) => [source.id, source] as const));
const routeByIdentity = new Map(runtime.routes.map((route) => [
  routeIdentityKey(route.carrier, route.carrierEntityKey ?? route.carrier, route.pair[0], route.pair[1]), route,
] as const));
const snapshotsByAirport = new Map(release.sourceSnapshots.map((snapshot) => [snapshot.airport, snapshot] as const));
assert(snapshotsByAirport.size === 11, 'Expected all 11 reviewed Avinor snapshots');

for (const snapshot of release.sourceSnapshots) {
  assert(snapshot.rawAssetPath.startsWith('route-network/') && !snapshot.rawAssetPath.split('/').includes('..'), `Unsafe packet raw asset path for ${snapshot.airport}`);
  const sourceId = sourceIdForAirport(snapshot.airport);
  const source = sourceById.get(sourceId);
  assert(source?.url === snapshot.requestUrl && source.freshUntilUTC === snapshot.freshUntilUTC, `Runtime source provenance changed for ${snapshot.airport}`);
  assert(source.rawAssetPath?.startsWith('route-network/') && !source.rawAssetPath.split('/').includes('..'), `Runtime raw XML path escapes /gcmp/data for ${snapshot.airport}`);
  const rawXml = readFileSync(`${DATA}/${source.rawAssetPath}`);
  assert(rawXml.byteLength === snapshot.responseBytes && sha256(rawXml) === snapshot.responseSHA256, `Raw XML byte hash changed for ${snapshot.airport}`);
  assert(airportCodes.has(snapshot.airport), `Airport registry is missing source airport ${snapshot.airport}`);
}

const followOnDetailKeys = new Set<string>();
let retainedOccurrences = 0;
const carrierCodes = new Set<string>();
const airportPairs = new Set<string>();
const carrierDirectedRoutes = new Set<string>();
const allOccurrences = rows.flatMap((row) => row.occurrences.map((occurrence) => ({ row, occurrence })));
for (const row of rows) {
  const { carrierCode, carrierEntityKey, origin, destination, flightDesignator } = row.identity;
  carrierCodes.add(carrierCode);
  airportPairs.add(`${origin}>${destination}`);
  carrierDirectedRoutes.add(routeIdentityKey(carrierCode, carrierEntityKey, origin, destination));
  assert(airportCodes.has(origin) && airportCodes.has(destination), `Airport registry is missing a route endpoint: ${row.candidateKey}`);
  const route = routeByIdentity.get(routeIdentityKey(carrierCode, carrierEntityKey, origin, destination));
  assert(route?.status === 'published' && (route.flightNumbers ?? []).includes(flightDesignator), `Accepted follow-on identity is not discoverable in runtime: ${row.candidateKey}`);
  const matchingEvidence = (route.timeBoundFlightNumbers ?? []).filter((evidence) => evidence.flightNumber === flightDesignator);
  assert(matchingEvidence.length > 0, `Accepted follow-on identity lacks date-bound evidence: ${row.candidateKey}`);
  const details = matchingEvidence.flatMap((evidence) => (evidence.occurrenceDetails ?? [])
    .filter((detail) => detail.candidateKey === row.candidateKey)
    .map((detail) => ({ evidence, detail })));
  assert(details.length === row.occurrences.length, `Follow-on occurrence detail count changed for ${row.candidateKey}`);
  retainedOccurrences += details.length;
  followOnDetailKeys.add(row.candidateKey);

  for (const occurrence of row.occurrences) {
    assert(airportCodes.has(occurrence.sourceAirport), `Airport registry is missing source airport ${occurrence.sourceAirport}`);
    const expectedSourceId = sourceIdForAirport(occurrence.sourceAirport);
    const match = details.find(({ evidence, detail }) => detail.scheduleTimeUTC === occurrence.scheduleTimeUTC
      && detail.expiresAtUTC === occurrence.expiresAtUTC
      && detail.sourceAirport === occurrence.sourceAirport
      && detail.sourceRow === occurrence.sourceRow
      && detail.sourceUniqueID === occurrence.sourceUniqueID
      && evidence.sourceId === expectedSourceId);
    assert(match, `Exact source occurrence lineage is missing: ${row.candidateKey} at ${occurrence.scheduleTimeUTC}`);
    assert(match.detail.sourceOperatingCarrierIATA === occurrence.sourceOperatingCarrierIATA
      && match.detail.statusCode === occurrence.statusCode
      && match.detail.arrDepRaw === occurrence.arrDepRaw
      && match.detail.viaAirportRaw === occurrence.viaAirportRaw
      && JSON.stringify(match.detail.viaAirports) === JSON.stringify(occurrence.viaAirports)
      && match.detail.oldCandidateWindowConflict === occurrence.oldCandidateWindowConflict
      && match.detail.oldCandidateWindowRelationship === occurrence.oldCandidateWindowRelationship,
    `Raw occurrence fields or historical window conflict changed: ${row.candidateKey} at ${occurrence.scheduleTimeUTC}`);
  }
}
assert(followOnDetailKeys.size === 1373 && retainedOccurrences === 5421, 'Not all 1,373 identities and 5,421 occurrences are retained');
assert(airportPairs.size === release.accepted.directedAirportPairs && carrierDirectedRoutes.size === release.accepted.carrierDirectedRoutes,
  'Accepted directed airport pair or carrier-route totals changed');

const runtimeTimedKeys = new Set<string>();
for (const route of runtime.routes) {
  for (const evidence of route.timeBoundFlightNumbers ?? []) {
    runtimeTimedKeys.add(directedIdentityKey(route.carrier, route.carrierEntityKey ?? route.carrier, route.pair[0], route.pair[1], evidence.flightNumber));
    for (const detail of evidence.occurrenceDetails ?? []) {
      assert(!heldKeys.has(detail.candidateKey), `Reviewer-held identity was promoted: ${detail.candidateKey}`);
    }
  }
}
assert(runtimeTimedKeys.size === uniqueAcceptedKeys.size && [...runtimeTimedKeys].every((key) => uniqueAcceptedKeys.has(key)),
  'Runtime date-bound identity set differs from first, batch and follow-on accepted sources');

const caa = CaaWeeklyScheduleTierSchema.parse(JSON.parse(readFileSync(CAA_PATH, 'utf8')));
const caaKeys = new Set(caa.associations.map((row) => row.key));
const caaOverlap = [...uniqueAcceptedKeys].filter((key) => caaKeys.has(key));
assert(caa.associationCount === 488 && caaOverlap.length === 0, `CAA 488 reference set changed or overlaps Avinor (${caa.associationCount}, ${caaOverlap.length})`);

const baselineUnDatedRows = runtime.routes.flatMap((route) => (route.flightNumbers ?? [])
  .filter((number) => !(route.timeBoundFlightNumbers ?? []).some((evidence) => evidence.flightNumber === number))
  .map((number) => ({ carrier: route.carrier, identity: route.carrierEntityKey ?? route.carrier, from: route.pair[0], to: route.pair[1], number })));
const baselineDesignators = new Set(baselineUnDatedRows.map((row) => row.number));
const baselineRoutes = new Set(baselineUnDatedRows.map((row) => `${row.identity}:${row.from}-${row.to}`));
assert(baselineUnDatedRows.length === BASELINE_ASSOCIATIONS.associations
  && baselineDesignators.size === BASELINE_ASSOCIATIONS.designators
  && baselineRoutes.size === BASELINE_ASSOCIATIONS.directedRoutes,
'The 839 baseline associations, 829 designators and 295 directed routes changed');

const packetAsOf = Date.parse(release.packetAsOfUTC);
const expiredAtPacketAsOf = allOccurrences.filter(({ occurrence }) => packetAsOf >= Date.parse(occurrence.expiresAtUTC)).length;
const windowConflictOccurrences = allOccurrences.filter(({ occurrence }) => occurrence.oldCandidateWindowConflict).length;
assert(expiredAtPacketAsOf === release.accepted.expiredAtPacketAsOf && expiredAtPacketAsOf === 44, 'Packet-as-of expired occurrence count changed');
assert(windowConflictOccurrences === 600, `Historical candidate-window conflicts changed: ${windowConflictOccurrences}`);

const now = Date.now();
const sourceFreshUntil = new Map(release.sourceSnapshots.map((snapshot) => [snapshot.airport, Date.parse(snapshot.freshUntilUTC)] as const));
const currentOccurrences = allOccurrences.filter(({ occurrence }) => now < Date.parse(occurrence.expiresAtUTC)
  && now < (sourceFreshUntil.get(occurrence.sourceAirport) ?? 0));
const currentIdentityGroups = new Set(currentOccurrences.map(({ row }) => row.candidateKey));
const currentPairs = new Set(currentOccurrences.map(({ occurrence }) => `${occurrence.origin}>${occurrence.destination}`));
const currentCarrierRoutes = new Set(currentOccurrences.map(({ row }) => routeIdentityKey(row.identity.carrierCode, row.identity.carrierEntityKey, row.identity.origin, row.identity.destination)));
const currentScheduleDates = currentOccurrences.map(({ occurrence }) => occurrence.scheduleDateUTC).sort();
const storedFlightNumberAssociations = runtime.routes.reduce((sum, route) => sum + (route.flightNumbers?.length ?? 0), 0);
const storedDesignators = new Set(runtime.routes.flatMap((route) => route.flightNumbers ?? []));
const storedCarrierRoutes = new Set(runtime.routes.filter((route) => (route.flightNumbers?.length ?? 0) > 0).map((route) => routeIdentityKey(
  route.carrier, route.carrierEntityKey ?? route.carrier, route.pair[0], route.pair[1],
)));
const activeRouteCodes = new Set(runtime.routes.filter((route) => route.status === 'published').map((route) => route.carrier));

console.log(JSON.stringify({
  verified: true,
  asOfUTC: new Date(now).toISOString(),
  baselineBeforeDatedAvinor: {
    storedUndatedFlightNumberAssociations: baselineUnDatedRows.length,
    distinctDesignators: baselineDesignators.size,
    carrierDirectedRoutes: baselineRoutes.size,
  },
  firstReleasePreserved: { datedIdentityGroups: firstKeys.size, originalXMLSHA256: sha256(firstXml) },
  followOn: {
    packetIdentityGroups: rows.length,
    packetOccurrences: allOccurrences.length,
    directedAirportPairs: airportPairs.size,
    carrierDirectedRoutes: carrierDirectedRoutes.size,
    carrierCodes: carrierCodes.size,
    alreadyExistingCandidateIdentities: priorCandidateRows.length,
    alreadyExistingOccurrences: priorCandidateRows.reduce((sum, row) => sum + row.occurrences.length, 0),
    netNewIdentities: newRows.length,
    netNewOccurrences: newRows.reduce((sum, row) => sum + row.occurrences.length, 0),
    currentEligibleOccurrences: currentOccurrences.length,
    currentEligibleIdentityGroups: currentIdentityGroups.size,
    currentEligibleDirectedAirportPairs: currentPairs.size,
    currentEligibleCarrierDirectedRoutes: currentCarrierRoutes.size,
    currentScheduleDateRangeUTC: currentScheduleDates.length ? [currentScheduleDates[0], currentScheduleDates.at(-1)] : [],
    packetExpiredOccurrences: expiredAtPacketAsOf,
    historicalCandidateWindowConflictOccurrences: windowConflictOccurrences,
    retainedRuntimeOccurrences: retainedOccurrences,
    heldIdentityGroupsNotPromoted: heldRows.length,
  },
  runtimeAfter: {
    storedFlightNumberAssociations,
    distinctStoredDesignators: storedDesignators.size,
    carrierDirectedRoutes: storedCarrierRoutes.size,
    distinctPublishedCarrierCodes: activeRouteCodes.size,
    datedIdentityGroups: runtimeTimedKeys.size,
  },
  caa: { associationCount: caa.associationCount, overlapWithAvinor: caaOverlap.length },
  rawSnapshots: release.sourceSnapshots.map((snapshot) => ({
    airport: snapshot.airport,
    bytes: snapshot.responseBytes,
    sha256: snapshot.responseSHA256,
    sourceId: sourceIdForAirport(snapshot.airport),
    freshUntilUTC: snapshot.freshUntilUTC,
  })),
}, null, 2));
