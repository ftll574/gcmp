import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseAvinorXmlPublicSnapshot } from '../src/lib/schemas/avinor-xml-public.ts';
import { parseAvinorXmlPublicBatch } from '../src/lib/schemas/avinor-xml-public-batch.ts';
import { parseAvinorFollowOnLedgerJsonl } from '../src/lib/schemas/avinor-follow-on.ts';
import { parseAvinorRemainingAirportsLedgerJsonl } from '../src/lib/schemas/avinor-remaining-airports.ts';
import { CaaWeeklyScheduleTierSchema } from '../src/lib/schemas/caa-weekly-schedule-tier.ts';
import { parseRouteNetworkCatalog } from '../src/lib/schemas/route-network.ts';
import { routeFlightNumberFreshness } from '../src/lib/rtw/time-bound-flight-numbers.ts';

const ROOT = 'public/data/route-network';
const SNAPSHOT_PATH = `${ROOT}/avinor-osl-public-20261006.json`;
const XML_PATH = `${ROOT}/avinor-osl-public-20261006.xml`;
const CAA_PATH = `${ROOT}/caa-weekly-schedule-tier-20261006.json`;
const RUNTIME_PATH = `${ROOT}/runtime-current.json`;
const EXPECTED_XML_SHA256 = '78403435f3c31ae82d9b45249267cf5e843a7db76bf81bd1f39bb856a65adf7f';
const EXPECTED_ACCEPTED_SHA256 = 'a3fa00d80894a65a09baf1d7a8dc845e654b0a43200424e4ab50b3194a8468b8';
const EXPECTED = {
  baselineConfirmed: { associations: 839, designators: 829, directedRoutes: 295 },
  baselineCandidates: { associations: 132996, designators: 111053, directedRoutes: 30605 },
  publishedCandidates: { associations: 132383, designators: 110460, directedRoutes: 30543 },
};

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function totals(rows: ReadonlyArray<{ carrier: string; identity: string; from: string; to: string; number: string }>) {
  return {
    associations: rows.length,
    designators: new Set(rows.map((row) => row.number)).size,
    directedRoutes: new Set(rows.map((row) => `${row.identity}:${row.from}-${row.to}`)).size,
  };
}

function assertTotals(actual: ReturnType<typeof totals>, expected: typeof EXPECTED.baselineConfirmed, label: string): void {
  for (const field of ['associations', 'designators', 'directedRoutes'] as const) {
    if (actual[field] !== expected[field]) throw new Error(`${label} ${field}: ${actual[field]} != ${expected[field]}`);
  }
}

const snapshot = parseAvinorXmlPublicSnapshot(JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')));
const batch = parseAvinorXmlPublicBatch(JSON.parse(readFileSync(`${ROOT}/avinor-public-airport-batch-20261006.json`, 'utf8')));
const followOnRows = parseAvinorFollowOnLedgerJsonl(readFileSync(`${ROOT}/avinor-follow-on-evidence-20261006.jsonl`, 'utf8'));
const remainingRows = parseAvinorRemainingAirportsLedgerJsonl(readFileSync(`${ROOT}/avinor-remaining-airports-accepted-20261007.jsonl`, 'utf8'));
const xml = readFileSync(XML_PATH);
const actualXmlSha256 = sha256(xml);
if (xml.byteLength !== snapshot.snapshot.responseBytes || actualXmlSha256 !== snapshot.snapshot.responseSHA256 || actualXmlSha256 !== EXPECTED_XML_SHA256) {
  throw new Error('Original Avinor XML response bytes differ from the accepted size/hash');
}
if (snapshot.snapshot.acceptedAssociationsSHA256 !== EXPECTED_ACCEPTED_SHA256) throw new Error('Accepted association digest differs from the independently reviewed packet');

const airportCodes = new Set((JSON.parse(readFileSync('public/data/airports.json', 'utf8')) as Array<{ iata: string }>).map((row) => row.iata));
const runtime = parseRouteNetworkCatalog(JSON.parse(readFileSync(RUNTIME_PATH, 'utf8')), airportCodes);
const caa = CaaWeeklyScheduleTierSchema.parse(JSON.parse(readFileSync(CAA_PATH, 'utf8')));
if (batch.acceptedInputPackets[0]?.sha256 !== 'a1709224afceb12b5b0b65467c77658d9af9e4a5f31452b24e6a50d7f05212b6'
  || batch.acceptedInputPackets[1]?.sha256 !== '63430fe35c340a969b85919c31b07295659e177438145ac1233981122bc4ae85') {
  throw new Error('Accepted multi-airport input packet digests differ from the reviewed sets');
}
const avinorSource = runtime.sources.find((source) => source.id === snapshot.sourceId);
if (!avinorSource || avinorSource.freshUntilUTC !== snapshot.snapshot.validUntilUTC) throw new Error('Runtime Avinor source freshness cutoff is missing or changed');

const followOnNetNewKeys = new Set(followOnRows.filter((row) => !row.runtimeBaseline.exactIdentityWasCandidateBeforeHandoff).map((row) => row.candidateKey));
const followOnPriorCandidateRows = followOnRows.filter((row) => row.runtimeBaseline.exactIdentityWasCandidateBeforeHandoff);
if (followOnRows.length !== 1373 || followOnPriorCandidateRows.length !== 201 || followOnNetNewKeys.size !== 1172
  || followOnRows.reduce((total, row) => total + row.occurrences.length, 0) !== 5421
  || followOnPriorCandidateRows.reduce((total, row) => total + row.occurrences.length, 0) !== 726) {
  throw new Error('Follow-on packet reconciliation no longer resolves to 201 existing and 1,172 net-new identities');
}
const remainingKeys = new Set(remainingRows.map((row) => row.candidateKey));
if (remainingKeys.size !== 143 || remainingRows.reduce((total, row) => total + row.occurrenceEvidence.length, 0) !== 517) {
  throw new Error('Remaining-airports independent accepted partition changed');
}
const acceptedKeys = new Set([...snapshot.associations, ...batch.associations, ...followOnRows, ...remainingRows].map((row) => 'candidateKey' in row ? row.candidateKey : row.key));
const netNewAcceptedKeys = new Set([...followOnNetNewKeys, ...remainingKeys]);
const caaKeys = new Set(caa.associations.map((row) => row.key));
const caaOverlap = [...acceptedKeys].filter((key) => caaKeys.has(key));
if (caaOverlap.length) throw new Error(`Avinor release overlaps ${caaOverlap.length} actual CAA asset keys: ${caaOverlap.slice(0, 10).join(', ')}`);

const runtimeTimedKeys = new Set<string>();
const runtimeConfirmed: Array<{ carrier: string; identity: string; from: string; to: string; number: string }> = [];
const runtimeCandidates: Array<{ carrier: string; identity: string; from: string; to: string; number: string }> = [];
const baselineConfirmed: typeof runtimeConfirmed = [];
const baselineCandidates: typeof runtimeCandidates = [];
for (const route of runtime.routes) {
  const identity = route.carrierEntityKey ?? route.carrier;
  const pair = `${route.pair[0]}>${route.pair[1]}`;
  const timed = new Map((route.timeBoundFlightNumbers ?? []).map((row) => [row.flightNumber, row] as const));
  for (const number of route.flightNumbers ?? []) {
    runtimeConfirmed.push({ carrier: route.carrier, identity, from: route.pair[0], to: route.pair[1], number });
    if (!timed.has(number)) baselineConfirmed.push({ carrier: route.carrier, identity, from: route.pair[0], to: route.pair[1], number });
  }
  for (const number of route.flightNumberCandidates ?? []) {
    runtimeCandidates.push({ carrier: route.carrier, identity, from: route.pair[0], to: route.pair[1], number });
    const key = `${route.carrier}|${identity}|${pair}|${number}`;
    if (!netNewAcceptedKeys.has(key)) baselineCandidates.push({ carrier: route.carrier, identity, from: route.pair[0], to: route.pair[1], number });
  }
  for (const number of timed.keys()) {
    const key = `${route.carrier}|${identity}|${pair}|${number}`;
    if (!acceptedKeys.has(key)) throw new Error(`Unexpected time-bound runtime association ${key}`);
    runtimeTimedKeys.add(key);
    if (!netNewAcceptedKeys.has(key)) baselineCandidates.push({ carrier: route.carrier, identity, from: route.pair[0], to: route.pair[1], number });
  }
}
if (runtimeTimedKeys.size !== acceptedKeys.size || [...acceptedKeys].some((key) => !runtimeTimedKeys.has(key))) {
  throw new Error(`Runtime has ${runtimeTimedKeys.size} time-bound keys; accepted packet has ${acceptedKeys.size}`);
}
for (const row of snapshot.associations) {
  const [carrier, identity, pair, number] = row.candidateKey.split('|');
  const [from, to] = pair!.split('>');
  const route = runtime.routes.find((item) => item.carrier === carrier && (item.carrierEntityKey ?? item.carrier) === identity && item.pair[0] === from && item.pair[1] === to);
  const bound = route?.timeBoundFlightNumbers?.find((item) => item.flightNumber === number);
  if (!route || !bound || bound.sourceId !== snapshot.sourceId
    || !bound.candidateSourceIds.every((sourceId) => row.candidateSourceIds.includes(sourceId))) {
    throw new Error(`Runtime association provenance differs from the accepted key ${row.candidateKey}`);
  }
}
for (const sourceSnapshot of batch.snapshots) {
  const bytes = readFileSync(`${ROOT}/${sourceSnapshot.rawResponsePath.split('/').at(-1)}`);
  if (bytes.byteLength !== sourceSnapshot.responseBytes || sha256(bytes) !== sourceSnapshot.responseSHA256) {
    throw new Error(`Original Avinor XML bytes differ from the accepted ${sourceSnapshot.airport} response`);
  }
  const source = runtime.sources.find((item) => item.id === sourceSnapshot.sourceId);
  if (!source || source.freshUntilUTC !== sourceSnapshot.validUntilUTC) throw new Error(`Missing ${sourceSnapshot.airport} source freshness cutoff`);
}
for (const row of batch.associations) {
  const [carrier, identity, pair, number] = row.candidateKey.split('|');
  const [from, to] = pair!.split('>');
  const route = runtime.routes.find((item) => item.carrier === carrier && (item.carrierEntityKey ?? item.carrier) === identity && item.pair[0] === from && item.pair[1] === to);
  const sourceRow = row.supportingRows.filter((item) => item.observationClass === 'upcoming-scheduled-row')
    .sort((a, b) => (batch.snapshots.find((s) => s.airport === b.sourceAirport)?.retrievedAtUTC ?? '').localeCompare(batch.snapshots.find((s) => s.airport === a.sourceAirport)?.retrievedAtUTC ?? ''))[0];
  const expectedSource = batch.snapshots.find((item) => item.airport === sourceRow?.sourceAirport);
  const bound = route?.timeBoundFlightNumbers?.find((item) => item.flightNumber === number && item.sourceId === expectedSource?.sourceId);
  if (!route || !bound || bound.sourceId !== expectedSource?.sourceId || bound.plannerUse !== 'display-only'
    || !bound.candidateWindow || bound.candidateWindow.runtimeValidityAtCaptureDate !== row.candidate.runtimeValidityAtCaptureDate
    || bound.candidateWindow.effectiveUntil !== row.candidate.effectiveUntil
    || bound.candidateSourceIds.length !== row.candidate.candidateSourceIds.length
    || !bound.candidateSourceIds.every((sourceId) => row.candidate.candidateSourceIds.includes(sourceId))) {
    throw new Error(`Runtime multi-airport provenance or candidate-window guard differs for ${row.candidateKey}`);
  }
}

const publishedCandidates = totals(runtimeCandidates);
const reconstructedBaselineConfirmed = totals(baselineConfirmed);
const reconstructedBaselineCandidates = totals(baselineCandidates);
assertTotals(publishedCandidates, EXPECTED.publishedCandidates, 'published candidates');
assertTotals(reconstructedBaselineConfirmed, EXPECTED.baselineConfirmed, 'reconstructed baseline confirmed');
assertTotals(reconstructedBaselineCandidates, EXPECTED.baselineCandidates, 'reconstructed baseline candidates');
if (runtimeConfirmed.length !== baselineConfirmed.length + acceptedKeys.size) {
  throw new Error(`Stored route-number associations ${runtimeConfirmed.length} do not reconcile to baseline ${baselineConfirmed.length} plus ${acceptedKeys.size} date-scoped identities`);
}

const now = Date.now();
const sourcesById = new Map(runtime.sources.map((source) => [source.id, source] as const));
const currentlyEligibleDatedKeys = new Set(runtime.routes.flatMap((route) => routeFlightNumberFreshness(route, sourcesById, now).current
  .filter((number) => (route.timeBoundFlightNumbers ?? []).some((evidence) => evidence.flightNumber === number))
  .map((number) => `${route.carrier}|${route.carrierEntityKey ?? route.carrier}|${route.pair[0]}>${route.pair[1]}|${number}`)));
console.log(JSON.stringify({
  verified: true,
  source: {
    sourceId: snapshot.sourceId,
    retrievedAtUTC: snapshot.snapshot.retrievedAtUTC,
    validUntilUTC: snapshot.snapshot.validUntilUTC,
    rawXMLBytes: xml.byteLength,
    rawXMLSHA256: actualXmlSha256,
    acceptedAssociationsSHA256: snapshot.snapshot.acceptedAssociationsSHA256,
    acceptedAssociations: snapshot.associations.length,
    acceptedDirectedRoutes: snapshot.snapshot.acceptedDirectedRouteCount,
  },
  multiAirportBatch: {
    acceptedAssociations: batch.acceptedAssociationCount,
    acceptedDirectedCarrierRoutes: batch.acceptedDirectedCarrierRouteCount,
    acceptedCarrierDesignators: batch.acceptedCarrierDesignatorCount,
    acceptedInputPackets: batch.acceptedInputPackets.map(({ associationCount, sha256: digest }) => ({ associationCount, sha256: digest })),
    airportSnapshots: batch.snapshots.map(({ airport, retrievedAtUTC, validUntilUTC, responseBytes, responseSHA256 }) => ({ airport, retrievedAtUTC, validUntilUTC, responseBytes, responseSHA256 })),
  },
  followOnReconciliation: {
    acceptedIdentityGroups: followOnRows.length,
    acceptedOccurrences: followOnRows.reduce((total, row) => total + row.occurrences.length, 0),
    alreadyPromotedIdentityGroups: followOnPriorCandidateRows.length,
    alreadyPromotedOccurrences: followOnPriorCandidateRows.reduce((total, row) => total + row.occurrences.length, 0),
    netNewIdentityGroups: followOnNetNewKeys.size,
    netNewOccurrences: followOnRows.filter((row) => followOnNetNewKeys.has(row.candidateKey)).reduce((total, row) => total + row.occurrences.length, 0),
    historicalWindowConflictOccurrences: followOnRows.reduce((total, row) => total + row.occurrences.filter((occurrence) => occurrence.oldCandidateWindowConflict).length, 0),
  },
  caaActualAsset: { associationKeys: caa.associationCount, overlap: caaOverlap.length },
  baseline: { confirmed: reconstructedBaselineConfirmed, candidates: reconstructedBaselineCandidates },
  published: {
    storedFlightNumberAssociations: runtimeConfirmed.length,
    distinctStoredDesignators: new Set(runtimeConfirmed.map((row) => row.number)).size,
    storedCarrierDirectedRoutes: new Set(runtimeConfirmed.map((row) => `${row.identity}:${row.from}-${row.to}`)).size,
    candidates: publishedCandidates,
    currentlyEligibleDatedIdentityGroups: currentlyEligibleDatedKeys.size,
    acceptedDatedIdentityGroups: acceptedKeys.size,
  },
}, null, 2));
