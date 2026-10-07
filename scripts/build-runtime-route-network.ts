import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { parseRouteNetworkCatalog, type RouteNetworkCatalog } from '../src/lib/schemas/route-network.ts';
import { parseAvinorXmlPublicSnapshot } from '../src/lib/schemas/avinor-xml-public.ts';
import { parseAvinorXmlPublicBatch } from '../src/lib/schemas/avinor-xml-public-batch.ts';
import { parseAvinorFollowOnLedgerJsonl, parseAvinorFollowOnRelease } from '../src/lib/schemas/avinor-follow-on.ts';
import { parseAvinorRemainingAirportsLedgerJsonl, parseAvinorRemainingAirportsRelease } from '../src/lib/schemas/avinor-remaining-airports.ts';
import { CaaWeeklyScheduleTierSchema } from '../src/lib/schemas/caa-weekly-schedule-tier.ts';
import { SiroRegisteredPlanReleaseSchema } from '../src/lib/schemas/siros-registered-plan-release.ts';
import { carrierRouteKey } from '../src/lib/carrier-identity.ts';
import { applySiroRegisteredPlanOverlay } from '../src/lib/rtw/siros-registered-plan-adapter.ts';
import {
  SIROS_RETRIEVED_AT_UTC,
  buildSiroRegisteredPlanOverlay,
} from './lib/siros-registered-plan-input.ts';
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
const AVINOR_FOLLOWON_LEDGER_INPUT = 'avinor-follow-on-evidence-20261006.jsonl';
const AVINOR_FOLLOWON_RELEASE_INPUT = 'avinor-follow-on-release-20261006.json';
const AVINOR_FOLLOWON_HELD_PATH = 'docs/avinor-follow-on-release-20261007/reviewer-held-ledger.jsonl';
const BASELINE_RUNTIME_SHA256 = '2bd353350db6d871099a2c2aa2aee23b63b0a7e65cccbbc502d9234eeb017c8a';
const AVINOR_REMAINING_LEDGER_INPUT = 'avinor-remaining-airports-accepted-20261007.jsonl';
const AVINOR_REMAINING_RELEASE_INPUT = 'avinor-remaining-airports-release-20261007.json';
const AVINOR_REMAINING_BASELINE_RUNTIME_SHA256 = '1d6f2565df9f6be1168b88c9f27d5a2df2dc9790204eaf276ffd571b5d36f400';
const AVINOR_REMAINING_HELD_KEYS = new Set([
  'LTR|LTR|BOO>VRY|LTR001',
  'LTR|LTR|BOO>VRY|LTR003',
  'LTR|LTR|VRY>BOO|LTR002',
  'LTR|LTR|VRY>BOO|LTR004',
]);
const SIROS_PROPOSAL_INPUT = 'siros-registered-plan-proposal-20261007.jsonl.gz';
const SIROS_RAW_ROWS_INPUT = 'siros-registered-plan-raw-rows-20261007.jsonl.gz';
const SIROS_RELEASE_INPUT = 'siros-registered-plan-release-20261007.json';

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

function directedIdentityKey(carrier: string, identity: string, from: string, to: string, number: string): string {
  return `${carrier}|${identity}|${from}>${to}|${number}`;
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
const assetPathRuntime = parseRouteNetworkCatalog({
  ...acceptedRuntime,
  sources: acceptedRuntime.sources.map((source) => source.id === avinor.sourceId
    ? { ...source, rawAssetPath: avinor.snapshot.rawResponsePath }
    : source),
}, airportCodes);

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
  const matches = assetPathRuntime.routes.filter((route) => carrierRouteKey(route, ...route.pair) === routeKey);
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
  rawAssetPath: snapshot.rawResponsePath,
  note: `Avinor XML Public ${snapshot.airport} snapshot retrieved ${snapshot.retrievedAtUTC}; exact OperatingAirlineIata, full FlightId and direction matches are retained with source-listed UTC schedules only. TimeFrom=1 and TimeTo=144 hours; stale after ${snapshot.validUntilUTC}. Existing route-candidate dates are preserved and not extended.`,
}));
if (batchSources.some((source) => assetPathRuntime.sources.some((existing) => existing.id === source.id))) {
  throw new Error('An Avinor airport-batch source ID already exists in the integration runtime');
}

const batchRuntime = parseRouteNetworkCatalog({
  ...assetPathRuntime,
  sources: [...assetPathRuntime.sources, ...batchSources],
  routes: assetPathRuntime.routes.map((route) => {
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

const followOnLedgerRaw = readFileSync(`${root}/${AVINOR_FOLLOWON_LEDGER_INPUT}`, 'utf8');
const followOnReleaseRaw = readFileSync(`${root}/${AVINOR_FOLLOWON_RELEASE_INPUT}`, 'utf8');
const followOnHeldRaw = readFileSync(AVINOR_FOLLOWON_HELD_PATH, 'utf8');
rawByFile.set(AVINOR_FOLLOWON_LEDGER_INPUT, followOnLedgerRaw);
rawByFile.set(AVINOR_FOLLOWON_RELEASE_INPUT, followOnReleaseRaw);
const followOnRelease = parseAvinorFollowOnRelease(JSON.parse(followOnReleaseRaw));
const followOnLedgerBytes = Buffer.from(followOnLedgerRaw, 'utf8');
const followOnHeldBytes = Buffer.from(followOnHeldRaw, 'utf8');
if (followOnLedgerBytes.byteLength !== followOnRelease.assets.acceptedLedger.bytes
  || sha256Bytes(followOnLedgerBytes) !== followOnRelease.assets.acceptedLedger.sha256) {
  throw new Error('Avinor follow-on normalized ledger differs from its pinned size/hash');
}
if (sha256Bytes(followOnHeldBytes) !== followOnRelease.held.ledgerSHA256) {
  throw new Error('Avinor reviewer-held ledger differs from its pinned hash');
}
if (followOnRelease.assets.acceptedLedger.path !== `route-network/${AVINOR_FOLLOWON_LEDGER_INPUT}`
  || followOnRelease.held.ledgerPath !== AVINOR_FOLLOWON_HELD_PATH) {
  throw new Error('Avinor follow-on evidence paths differ from the release manifest');
}
const followOnRows = parseAvinorFollowOnLedgerJsonl(followOnLedgerRaw);
const followOnCarrierCodes = [...new Set(followOnRows.map((row) => row.identity.carrierCode))].sort();
if (followOnRows.length !== followOnRelease.accepted.identityGroups
  || followOnRows.reduce((total, row) => total + row.occurrences.length, 0) !== followOnRelease.accepted.occurrences) {
  throw new Error('Avinor follow-on ledger group or occurrence totals differ from the release manifest');
}
const firstReleaseKeys = new Set(avinor.associations.map((association) => association.candidateKey));
const heldRows = followOnHeldRaw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as { candidateKey: string; occurrences: unknown[] });
const heldKeys = new Set(heldRows.map((row) => row.candidateKey));
if (followOnRows.some((row) => firstReleaseKeys.has(row.candidateKey))) throw new Error('Follow-on ledger overlaps the first 412 release keys');
if (heldRows.length !== followOnRelease.held.identityGroups
  || heldRows.reduce((total, row) => total + row.occurrences.length, 0) !== followOnRelease.held.occurrences
  || [...heldKeys].some((key) => followOnRows.some((row) => row.candidateKey === key))) {
  throw new Error('Held identity partition differs from the release manifest or accepted ledger');
}

const followOnSourcesByAirport = new Map<string, RouteNetworkCatalog['sources'][number]>();
const followOnSnapshotByAirport = new Map(followOnRelease.sourceSnapshots.map((snapshot) => [snapshot.airport, snapshot] as const));
for (const snapshot of followOnRelease.sourceSnapshots) {
  const sourceId = snapshot.airport === 'OSL'
    ? 'avinor-xml-public-osl-20261006'
    : `avinor-xml-public-batch-${snapshot.airport.toLowerCase()}-20261006`;
  const existing = batchRuntime.sources.find((source) => source.id === sourceId);
  if (!existing?.rawAssetPath || existing.url !== snapshot.requestUrl || existing.freshUntilUTC !== snapshot.freshUntilUTC) {
    throw new Error(`Existing Avinor source ${sourceId} does not match the verified ${snapshot.airport} snapshot`);
  }
  if (!existing.rawAssetPath.startsWith('route-network/') || existing.rawAssetPath.split('/').includes('..')) {
    throw new Error(`Avinor raw source must resolve under /gcmp/data: ${existing.rawAssetPath}`);
  }
  const rawBytes = readFileSync(`public/data/${existing.rawAssetPath}`);
  if (rawBytes.byteLength !== snapshot.responseBytes || sha256Bytes(rawBytes) !== snapshot.responseSHA256) {
    throw new Error(`Avinor ${snapshot.airport} source bytes differ from the follow-on release hash`);
  }
  followOnSourcesByAirport.set(snapshot.airport, existing);
}
if (followOnSourcesByAirport.size !== followOnRelease.sourceSnapshots.length) throw new Error('Not all 11 Avinor snapshots have runtime source identities');

const baselineRoutesByKey = new Map(baseAcceptedRuntime.routes.map((route) => [carrierRouteKey(route, ...route.pair), route] as const));
const batchRoutesByKey = new Map(batchRuntime.routes.map((route) => [carrierRouteKey(route, ...route.pair), route] as const));
type FollowOnOccurrence = NonNullable<RouteNetworkCatalog['routes'][number]['timeBoundFlightNumbers']>[number]['occurrenceDetails'] extends ReadonlyArray<infer T> | undefined ? T : never;
type FollowOnRouteBucket = {
  routeIdentity: { carrier: string; carrierEntityKey?: string };
  from: string;
  to: string;
  entries: Map<string, {
    flightNumber: string;
    candidateSourceIds: string[];
    bySource: Map<string, FollowOnOccurrence[]>;
    carrierEntityName: string | undefined;
  }>;
};
const followOnByRoute = new Map<string, FollowOnRouteBucket>();
const followOnKeys = new Set<string>();
const existingFollowOnKeys = new Set<string>();
let existingFollowOnOccurrences = 0;
for (const row of followOnRows) {
  if (followOnKeys.has(row.candidateKey)) throw new Error(`Duplicate accepted follow-on key ${row.candidateKey}`);
  followOnKeys.add(row.candidateKey);
  if (heldKeys.has(row.candidateKey)) throw new Error(`Reviewer-held key was included in accepted ledger: ${row.candidateKey}`);
  if (row.runtimeBaseline.runtimeSHA256 !== BASELINE_RUNTIME_SHA256 || row.runtimeBaseline.exactIdentityWasConfirmedBeforeHandoff) {
    throw new Error(`Follow-on identity does not match the reviewed runtime baseline: ${row.candidateKey}`);
  }
  const { carrierCode, carrierEntityKey, origin, destination, flightDesignator } = row.identity;
  const routeIdentity = { carrier: carrierCode, ...(carrierEntityKey !== carrierCode ? { carrierEntityKey } : {}) };
  const routeKey = carrierRouteKey(routeIdentity, origin, destination);
  const baselineRoute = baselineRoutesByKey.get(routeKey);
  const wasCandidate = row.runtimeBaseline.exactIdentityWasCandidateBeforeHandoff;
  const baselineCandidates = baselineRoute?.flightNumberCandidates ?? [];
  if (wasCandidate && (!baselineRoute || !baselineCandidates.includes(flightDesignator))) {
    throw new Error(`Prior candidate identity no longer matches the reviewed baseline: ${row.candidateKey}`);
  }
  if (!wasCandidate && (baselineCandidates.includes(flightDesignator) || baselineRoute?.flightNumbers?.includes(flightDesignator))) {
    throw new Error(`Reviewed new identity unexpectedly existed in its baseline: ${row.candidateKey}`);
  }
  if (firstReleaseKeys.has(row.candidateKey)) throw new Error(`Follow-on identity overlaps first release: ${row.candidateKey}`);
  const liveRoute = batchRoutesByKey.get(routeKey);
  const alreadyPublished = (liveRoute?.flightNumbers ?? []).includes(flightDesignator);
  if (alreadyPublished && !wasCandidate) throw new Error(`New follow-on identity unexpectedly overlaps published runtime: ${row.candidateKey}`);
  if (wasCandidate && !alreadyPublished) throw new Error(`Previously accepted candidate is missing from the latest runtime: ${row.candidateKey}`);
  const sourceIds = [...new Set(baselineRoute?.flightNumberCandidateSourceIds ?? [])].sort();
  const occurrences = row.occurrences.map((occurrence) => {
    const snapshot = followOnSnapshotByAirport.get(occurrence.sourceAirport);
    const source = followOnSourcesByAirport.get(occurrence.sourceAirport);
    if (!snapshot || !source || occurrence.sourceSnapshotSHA256 !== snapshot.responseSHA256
      || occurrence.sourceRequestUrl !== snapshot.requestUrl
      || occurrence.sourceOperatingCarrierIATA !== carrierCode
      || occurrence.sourceFullFlightID !== flightDesignator
      || occurrence.origin !== origin || occurrence.destination !== destination
      || occurrence.expiresAtUTC !== occurrence.scheduleTimeUTC
      || occurrence.scheduleTimeUTC > snapshot.freshUntilUTC) {
      throw new Error(`Occurrence provenance or exact identity mismatch: ${row.candidateKey} at ${occurrence.scheduleTimeUTC}`);
    }
    return { occurrence, source };
  });
  if (alreadyPublished) {
    existingFollowOnKeys.add(row.candidateKey);
    existingFollowOnOccurrences += row.occurrences.length;
  }
  const routeBucket = followOnByRoute.get(routeKey) ?? { routeIdentity, from: origin, to: destination, entries: new Map() };
  const entry = routeBucket.entries.get(flightDesignator) ?? {
    flightNumber: flightDesignator,
    candidateSourceIds: sourceIds,
    bySource: new Map(),
    carrierEntityName: row.identity.carrierEntityNameMapping === 'unique-trusted-name' ? row.identity.carrierEntityName ?? undefined : undefined,
  };
  if (entry.carrierEntityName && row.identity.carrierEntityName && entry.carrierEntityName !== row.identity.carrierEntityName) {
    throw new Error(`Conflicting trusted display names for ${row.candidateKey}`);
  }
  for (const { occurrence, source } of occurrences) {
    const bucket = entry.bySource.get(source.id) ?? [];
    bucket.push({
      candidateKey: row.candidateKey,
      carrierEntityName: row.identity.carrierEntityName,
      carrierEntityNameMapping: row.identity.carrierEntityNameMapping,
      directnessAssessment: row.directnessAssessment,
      expiresAtUTC: occurrence.expiresAtUTC,
      oldCandidateWindowConflict: occurrence.oldCandidateWindowConflict,
      oldCandidateWindowConflictOccurrenceCount: row.oldCandidateWindowConflictOccurrenceCount,
      oldCandidateWindowEffectiveFrom: row.oldCandidateWindow.effectiveFrom,
      oldCandidateWindowEffectiveUntil: row.oldCandidateWindow.effectiveUntil,
      oldCandidateWindowRelationship: occurrence.oldCandidateWindowRelationship,
      oldCandidateWindowSource: row.oldCandidateWindow.source,
      scheduleTimeUTC: occurrence.scheduleTimeUTC,
      sourceAirport: occurrence.sourceAirport,
      sourceOperatingCarrierIATA: occurrence.sourceOperatingCarrierIATA,
      sourceRow: occurrence.sourceRow,
      sourceUniqueID: occurrence.sourceUniqueID,
      statusCode: occurrence.statusCode,
      arrDepRaw: occurrence.arrDepRaw,
      viaAirportRaw: occurrence.viaAirportRaw,
      viaAirports: occurrence.viaAirports,
    });
    entry.bySource.set(source.id, bucket);
  }
  routeBucket.entries.set(flightDesignator, entry);
  followOnByRoute.set(routeKey, routeBucket);
}
if (followOnKeys.size !== followOnRelease.accepted.identityGroups) throw new Error('Accepted follow-on identity count changed during runtime mapping');
if (existingFollowOnKeys.size !== 201 || existingFollowOnOccurrences !== 726) {
  throw new Error(`Latest runtime must account for the 201 previously promoted follow-on identities and 726 occurrences; found ${existingFollowOnKeys.size}/${existingFollowOnOccurrences}`);
}
const netNewFollowOnGroups = followOnKeys.size - existingFollowOnKeys.size;
if (netNewFollowOnGroups !== 1172) throw new Error(`Expected 1,172 new identities after latest release reconciliation; found ${netNewFollowOnGroups}`);

const followOnRuntimeRoutes = new Map<string, RouteNetworkCatalog['routes'][number]>();
for (const [routeKey, bucket] of followOnByRoute) {
  const existing = batchRoutesByKey.get(routeKey);
  const newNumbers = [...bucket.entries.keys()];
  const candidateNumbers = (existing?.flightNumberCandidates ?? []).filter((number) => !newNumbers.includes(number));
  const sourceIds = [...new Set([...bucket.entries.values()].flatMap((entry) => [...entry.bySource.keys()]))].sort();
  const datedEvidence = [...bucket.entries.values()].flatMap((entry) => [...entry.bySource.entries()].map(([sourceId, details]) => ({
    flightNumber: entry.flightNumber,
    sourceId,
    candidateSourceIds: entry.candidateSourceIds,
    occurrencesUTC: [...new Set(details.map((detail) => detail.scheduleTimeUTC))].sort(),
    occurrenceDetails: [...details].sort((a, b) => a.scheduleTimeUTC.localeCompare(b.scheduleTimeUTC) || a.sourceRow - b.sourceRow),
  })));
  const trustedName = [...bucket.entries.values()].find((entry) => entry.carrierEntityName)?.carrierEntityName;
  const route: RouteNetworkCatalog['routes'][number] = existing ? {
    ...existing,
    ...(existing.status === 'identity-unresolved' ? { status: 'published' as const } : {}),
    carrierIdentity: existing.carrierIdentity === 'operating' ? 'operating' : 'provider-listed',
    flightNumbers: [...new Set([...(existing.flightNumbers ?? []), ...newNumbers])].sort(),
    ...(candidateNumbers.length ? { flightNumberCandidates: candidateNumbers } : { flightNumberCandidates: undefined }),
    ...(candidateNumbers.length ? {} : { flightNumberCandidateSourceIds: undefined }),
    sourceIds: [...new Set([...existing.sourceIds, ...sourceIds])],
    timeBoundFlightNumbers: [
      ...(existing.timeBoundFlightNumbers ?? []).filter((previous) => !datedEvidence.some((next) =>
        next.flightNumber === previous.flightNumber && next.sourceId === previous.sourceId)),
      ...datedEvidence.map((next) => {
        const previous = existing.timeBoundFlightNumbers?.find((evidence) =>
          evidence.flightNumber === next.flightNumber && evidence.sourceId === next.sourceId);
        if (!previous) return { ...next, plannerUse: 'dated-departure' as const };
        return {
          ...previous,
          candidateSourceIds: [...new Set([...previous.candidateSourceIds, ...next.candidateSourceIds])],
          occurrencesUTC: [...new Set([...previous.occurrencesUTC, ...next.occurrencesUTC])].sort(),
          occurrenceDetails: [...(previous.occurrenceDetails ?? []), ...(next.occurrenceDetails ?? [])]
            .filter((detail, index, all) => all.findIndex((candidate) => candidate.sourceAirport === detail.sourceAirport
              && candidate.sourceRow === detail.sourceRow && candidate.sourceUniqueID === detail.sourceUniqueID) === index)
            .sort((a, b) => a.scheduleTimeUTC.localeCompare(b.scheduleTimeUTC) || a.sourceRow - b.sourceRow),
          // Keep an earlier display-only/candidate-window classification as route-level history.
          // Follow-on occurrenceDetails carry the narrower date-planner permission individually.
          ...(previous.candidateWindow ? { candidateWindow: previous.candidateWindow } : {}),
          ...(previous.plannerUse ? { plannerUse: previous.plannerUse } : { plannerUse: 'dated-departure' as const }),
        };
      }),
    ],
  } : {
    carrier: bucket.routeIdentity.carrier,
    ...(bucket.routeIdentity.carrierEntityKey ? { carrierEntityKey: bucket.routeIdentity.carrierEntityKey } : {}),
    ...(trustedName ? { carrierEntityName: trustedName } : {}),
    pair: [bucket.from, bucket.to],
    service: 'scheduled-endpoint-pair',
    status: 'published',
    carrierIdentity: 'provider-listed',
    flightNumbers: newNumbers.sort(),
    sourceIds,
    timeBoundFlightNumbers: datedEvidence.map((evidence) => ({ ...evidence, plannerUse: 'dated-departure' as const })),
  };
  followOnRuntimeRoutes.set(routeKey, route);
}
const followOnSources = [...followOnSourcesByAirport.values()];
const followOnRuntime = parseRouteNetworkCatalog({
  ...batchRuntime,
  sources: [...batchRuntime.sources, ...followOnSources.filter((source) => !batchRuntime.sources.some((row) => row.id === source.id))],
  routes: batchRuntime.routes.map((route) => followOnRuntimeRoutes.get(carrierRouteKey(route, ...route.pair)) ?? route)
    .concat([...followOnRuntimeRoutes.entries()].filter(([key]) => !batchRoutesByKey.has(key)).map(([, route]) => route)),
}, airportCodes);
for (const row of heldRows) {
  const [carrier, carrierIdentity, routeText, flightNumber] = row.candidateKey.split('|');
  const [from, to] = routeText?.split('>') ?? [];
  if (!carrier || !carrierIdentity || !from || !to || !flightNumber) throw new Error(`Malformed held key: ${row.candidateKey}`);
  const identity = { carrier, ...(carrierIdentity !== carrier ? { carrierEntityKey: carrierIdentity } : {}) };
  const route = followOnRuntime.routes.find((entry) => carrierRouteKey(entry, ...entry.pair) === carrierRouteKey(identity, from, to));
  if (route?.timeBoundFlightNumbers?.some((evidence) => evidence.flightNumber === flightNumber)) {
    throw new Error(`Reviewer-held identity entered runtime: ${row.candidateKey}`);
  }
}
const remainingLedgerRaw = readFileSync(`${root}/${AVINOR_REMAINING_LEDGER_INPUT}`, 'utf8');
const remainingReleaseRaw = readFileSync(`${root}/${AVINOR_REMAINING_RELEASE_INPUT}`, 'utf8');
rawByFile.set(AVINOR_REMAINING_LEDGER_INPUT, remainingLedgerRaw);
rawByFile.set(AVINOR_REMAINING_RELEASE_INPUT, remainingReleaseRaw);
const remainingRelease = parseAvinorRemainingAirportsRelease(JSON.parse(remainingReleaseRaw));
const remainingLedgerBytes = Buffer.from(remainingLedgerRaw, 'utf8');
if (remainingLedgerBytes.byteLength !== remainingRelease.acceptedInput.bytes
  || sha256Bytes(remainingLedgerBytes) !== remainingRelease.acceptedInput.sha256
  || remainingRelease.acceptedInput.path !== `route-network/${AVINOR_REMAINING_LEDGER_INPUT}`) {
  throw new Error('Avinor remaining-airports accepted input differs from its pinned size/hash/path');
}
const remainingRows = parseAvinorRemainingAirportsLedgerJsonl(remainingLedgerRaw);
if (remainingRows.length !== remainingRelease.accepted.identityGroups
  || remainingRows.reduce((total, row) => total + row.occurrenceEvidence.length, 0) !== remainingRelease.accepted.occurrences) {
  throw new Error('Avinor remaining-airports identity or occurrence totals differ from the release manifest');
}
const remainingBaselineRuntimeSHA256 = sha256(`${JSON.stringify(followOnRuntime)}\n`);
if (remainingBaselineRuntimeSHA256 !== AVINOR_REMAINING_BASELINE_RUNTIME_SHA256
  || remainingRelease.runtimeBaseline.sha256 !== remainingBaselineRuntimeSHA256) {
  throw new Error(`Runtime before the independently accepted remaining-airports batch changed: ${remainingBaselineRuntimeSHA256}`);
}

const remainingSnapshotsByAirport = new Map(remainingRelease.sourceSnapshots.map((snapshot) => [snapshot.airport, snapshot] as const));
const remainingSourceByAirport = new Map<string, RouteNetworkCatalog['sources'][number]>();
const remainingXmlBytes = new Map<string, Buffer>();
for (const snapshot of remainingRelease.sourceSnapshots) {
  const rawPath = `${root}/${snapshot.rawAssetPath.split('/').at(-1)}`;
  const bytes = readFileSync(rawPath);
  if (bytes.byteLength !== snapshot.responseBytes || sha256Bytes(bytes) !== snapshot.responseSHA256) {
    throw new Error(`Avinor remaining-airports original XML differs from pinned size/hash for ${snapshot.airport}`);
  }
  remainingXmlBytes.set(snapshot.rawAssetPath, bytes);
  const sourceId = `avinor-remaining-airports-${snapshot.airport.toLowerCase()}-20261007`;
  const source: RouteNetworkCatalog['sources'][number] = {
    id: sourceId,
    url: snapshot.requestUrl,
    checkedOn: snapshot.retrievedAtUTC.slice(0, 10),
    freshUntilUTC: snapshot.freshUntilUTC,
    rawAssetPath: snapshot.rawAssetPath,
    note: `Avinor XML Public ${snapshot.airport} snapshot retrieved ${snapshot.retrievedAtUTC}; TimeFrom=1 and TimeTo=144 hours, both directions, codeshare=Y. It supplies source-listed dated schedule identities only and is stale after ${snapshot.freshUntilUTC}; each occurrence expires at its own scheduled UTC time. No actual-operation, recurring-service, physical-nonstop, award-seat or bookability claim is made.`,
  };
  if (followOnRuntime.sources.some((existing) => existing.id === sourceId)) {
    throw new Error(`Avinor remaining-airports source ID already exists: ${sourceId}`);
  }
  remainingSourceByAirport.set(snapshot.airport, source);
}
const acceptedOccurrenceAirports = new Set(remainingRows.flatMap((row) => row.occurrenceEvidence.map((occurrence) => occurrence.sourceAirport)));
if (acceptedOccurrenceAirports.size !== remainingSnapshotsByAirport.size
  || [...acceptedOccurrenceAirports].some((airport) => !remainingSnapshotsByAirport.has(airport))) {
  throw new Error('Remaining-airports release snapshots do not exactly cover the accepted occurrence sources');
}

const remainingConfirmedBaselineKeys = new Set(followOnRuntime.routes.flatMap((route) => (route.flightNumbers ?? []).map((flightNumber) =>
  directedIdentityKey(route.carrier, route.carrierEntityKey ?? route.carrier, route.pair[0], route.pair[1], flightNumber),
)));
const remainingCandidateBaselineKeys = new Set(followOnRuntime.routes.flatMap((route) => (route.flightNumberCandidates ?? []).map((flightNumber) =>
  directedIdentityKey(route.carrier, route.carrierEntityKey ?? route.carrier, route.pair[0], route.pair[1], flightNumber),
)));
if (remainingConfirmedBaselineKeys.size !== remainingRelease.runtimeBaseline.confirmedFlightIdentityKeys) {
  throw new Error(`Pinned pre-batch confirmed identity count changed: ${remainingConfirmedBaselineKeys.size}`);
}

type RemainingRouteEntry = {
  flightNumber: string;
  carrierEntityName: string | null;
  carrierEntityNameMapping: 'unique-trusted-name' | 'not-present-in-curated-registry' | 'unresolved-not-supplied-by-source-record';
  bySource: Map<string, FollowOnOccurrence[]>;
};
type RemainingRouteBucket = {
  routeIdentity: { carrier: string; carrierEntityKey?: string };
  from: string;
  to: string;
  entries: Map<string, RemainingRouteEntry>;
};
const remainingByRoute = new Map<string, RemainingRouteBucket>();
const remainingAcceptedKeys = new Set<string>();
let remainingRetainedOccurrences = 0;
for (const row of remainingRows) {
  const { candidate } = row;
  if (remainingAcceptedKeys.has(row.candidateKey)) throw new Error(`Duplicate accepted remaining-airports identity: ${row.candidateKey}`);
  remainingAcceptedKeys.add(row.candidateKey);
  if (AVINOR_REMAINING_HELD_KEYS.has(row.candidateKey)) throw new Error(`Reviewer-held identity entered accepted remaining-airports release: ${row.candidateKey}`);
  if (remainingConfirmedBaselineKeys.has(row.candidateKey) || remainingCandidateBaselineKeys.has(row.candidateKey)) {
    throw new Error(`New remaining-airports identity unexpectedly overlaps the pinned runtime: ${row.candidateKey}`);
  }
  if (candidate.carrierCode === 'LTR') throw new Error(`Held LTR identity entered the accepted remaining-airports ledger: ${row.candidateKey}`);
  const routeIdentity = { carrier: candidate.carrierCode, ...(candidate.carrierEntityKey !== candidate.carrierCode ? { carrierEntityKey: candidate.carrierEntityKey } : {}) };
  const routeKey = carrierRouteKey(routeIdentity, candidate.origin, candidate.destination);
  const routeBucket = remainingByRoute.get(routeKey) ?? { routeIdentity, from: candidate.origin, to: candidate.destination, entries: new Map() };
  const entry = routeBucket.entries.get(candidate.flightDesignator) ?? {
    flightNumber: candidate.flightDesignator,
    carrierEntityName: candidate.carrierEntityName,
    carrierEntityNameMapping: candidate.carrierEntityNameMapping,
    bySource: new Map(),
  };
  if (entry.carrierEntityName && candidate.carrierEntityName && entry.carrierEntityName !== candidate.carrierEntityName) {
    throw new Error(`Conflicting trusted carrier display names in ${row.candidateKey}`);
  }
  const rowConflictCount = row.occurrenceEvidence.filter((occurrence) => occurrence.oldCandidateWindowConflict).length;
  for (const occurrence of row.occurrenceEvidence) {
    const snapshot = remainingSnapshotsByAirport.get(occurrence.sourceAirport);
    const source = remainingSourceByAirport.get(occurrence.sourceAirport);
    if (!snapshot || !source
      || occurrence.snapshotSHA256 !== snapshot.responseSHA256
      || occurrence.requestUrl !== snapshot.requestUrl
      || occurrence.retrievedAtUTC !== snapshot.retrievedAtUTC
      || occurrence.operatingCarrierIATA !== candidate.carrierCode
      || occurrence.fullFlightID !== candidate.flightDesignator
      || occurrence.origin !== candidate.origin
      || occurrence.destination !== candidate.destination
      || occurrence.expiresAtUTC !== occurrence.scheduleTimeUTC
      || Date.parse(occurrence.scheduleTimeUTC) <= Date.parse(snapshot.retrievedAtUTC)
      || Date.parse(occurrence.scheduleTimeUTC) > Date.parse(snapshot.freshUntilUTC)) {
      throw new Error(`Remaining-airports occurrence provenance, freshness window or exact identity mismatch: ${row.candidateKey} at ${occurrence.scheduleTimeUTC}`);
    }
    const details: FollowOnOccurrence = {
      candidateKey: row.candidateKey,
      carrierEntityName: candidate.carrierEntityName,
      carrierEntityNameMapping: candidate.carrierEntityNameMapping,
      directnessAssessment: row.directnessAssessment,
      expiresAtUTC: occurrence.expiresAtUTC,
      oldCandidateWindowConflict: occurrence.oldCandidateWindowConflict,
      oldCandidateWindowConflictOccurrenceCount: rowConflictCount,
      oldCandidateWindowEffectiveFrom: null,
      oldCandidateWindowEffectiveUntil: null,
      oldCandidateWindowRelationship: occurrence.oldCandidateWindowRelationship,
      oldCandidateWindowSource: occurrence.oldCandidateWindowConflict
        ? 'Independent review retained this identity-specific candidate-window conflict; the occurrence remains date-scoped.'
        : 'Independent review found no identity-specific candidate-window conflict; route context does not extend flight-number validity.',
      scheduleTimeUTC: occurrence.scheduleTimeUTC,
      sourceAirport: occurrence.sourceAirport,
      sourceOperatingCarrierIATA: occurrence.operatingCarrierIATA,
      sourceRow: occurrence.sourceRow,
      sourceUniqueID: occurrence.sourceUniqueID,
      statusCode: occurrence.statusCode,
      arrDepRaw: occurrence.arrDepRaw,
      viaAirportRaw: occurrence.viaAirportRaw,
      viaAirports: occurrence.viaAirports,
    };
    const sourceRows = entry.bySource.get(source.id) ?? [];
    sourceRows.push(details);
    entry.bySource.set(source.id, sourceRows);
    remainingRetainedOccurrences += 1;
  }
  routeBucket.entries.set(candidate.flightDesignator, entry);
  remainingByRoute.set(routeKey, routeBucket);
}
if (remainingAcceptedKeys.size !== remainingRelease.accepted.identityGroups
  || remainingRetainedOccurrences !== remainingRelease.accepted.occurrences) {
  throw new Error('Remaining-airports accepted identity or source occurrence totals changed during runtime mapping');
}

const remainingBaselineRoutesByKey = new Map(followOnRuntime.routes.map((route) => [carrierRouteKey(route, ...route.pair), route] as const));
const newRemainingCarrierRoutes = [...remainingByRoute.keys()].filter((key) => !remainingBaselineRoutesByKey.has(key)).length;
const existingRemainingCarrierRoutes = remainingByRoute.size - newRemainingCarrierRoutes;
if (remainingByRoute.size !== remainingRelease.accepted.carrierDirectedRoutes
  || newRemainingCarrierRoutes !== remainingRelease.accepted.newCarrierDirectedRoutes
  || existingRemainingCarrierRoutes !== remainingRelease.accepted.existingCarrierDirectedRoutes) {
  throw new Error(`Remaining-airports route reconciliation changed: ${remainingByRoute.size}/${newRemainingCarrierRoutes}/${existingRemainingCarrierRoutes}`);
}

const remainingRuntimeRoutes = new Map<string, RouteNetworkCatalog['routes'][number]>();
for (const [routeKey, bucket] of remainingByRoute) {
  const existing = remainingBaselineRoutesByKey.get(routeKey);
  const entries = [...bucket.entries.values()];
  const flightNumbers = entries.map((entry) => entry.flightNumber);
  const candidateNumbers = (existing?.flightNumberCandidates ?? []).filter((number) => !flightNumbers.includes(number));
  const sourceIds = [...new Set(entries.flatMap((entry) => [...entry.bySource.keys()]))].sort();
  const datedEvidence = entries.flatMap((entry) => [...entry.bySource.entries()].map(([sourceId, details]) => ({
    flightNumber: entry.flightNumber,
    sourceId,
    candidateSourceIds: [],
    occurrencesUTC: [...new Set(details.map((detail) => detail.scheduleTimeUTC))].sort(),
    occurrenceDetails: [...details].sort((a, b) => a.scheduleTimeUTC.localeCompare(b.scheduleTimeUTC) || a.sourceRow - b.sourceRow),
    plannerUse: 'dated-departure' as const,
  })));
  const trustedName = entries.find((entry) => entry.carrierEntityNameMapping === 'unique-trusted-name' && entry.carrierEntityName)?.carrierEntityName ?? undefined;
  const route: RouteNetworkCatalog['routes'][number] = existing ? {
    ...existing,
    ...(existing.status === 'identity-unresolved' ? { status: 'published' as const } : {}),
    carrierIdentity: existing.carrierIdentity === 'operating' ? 'operating' : 'provider-listed',
    ...(existing.carrierEntityName || !trustedName ? {} : { carrierEntityName: trustedName }),
    flightNumbers: [...new Set([...(existing.flightNumbers ?? []), ...flightNumbers])].sort(),
    ...(candidateNumbers.length ? { flightNumberCandidates: candidateNumbers } : { flightNumberCandidates: undefined }),
    ...(candidateNumbers.length ? {} : { flightNumberCandidateSourceIds: undefined }),
    sourceIds: [...new Set([...existing.sourceIds, ...sourceIds])],
    timeBoundFlightNumbers: [...(existing.timeBoundFlightNumbers ?? []), ...datedEvidence],
  } : {
    carrier: bucket.routeIdentity.carrier,
    ...(bucket.routeIdentity.carrierEntityKey ? { carrierEntityKey: bucket.routeIdentity.carrierEntityKey } : {}),
    ...(trustedName ? { carrierEntityName: trustedName } : {}),
    pair: [bucket.from, bucket.to],
    service: 'scheduled-endpoint-pair',
    status: 'published',
    carrierIdentity: 'provider-listed',
    flightNumbers: flightNumbers.sort(),
    sourceIds,
    timeBoundFlightNumbers: datedEvidence,
  };
  remainingRuntimeRoutes.set(routeKey, route);
}
const remainingSources = [...remainingSourceByAirport.values()].sort((a, b) => a.id.localeCompare(b.id));
const remainingRuntime = parseRouteNetworkCatalog({
  ...followOnRuntime,
  sources: [...followOnRuntime.sources, ...remainingSources],
  routes: followOnRuntime.routes.map((route) => remainingRuntimeRoutes.get(carrierRouteKey(route, ...route.pair)) ?? route)
    .concat([...remainingRuntimeRoutes.entries()].filter(([key]) => !remainingBaselineRoutesByKey.has(key)).map(([, route]) => route)),
}, airportCodes);
const remainingRuntimeRoutesWithNewFlight = remainingRuntime.routes.filter((route) =>
  (route.timeBoundFlightNumbers ?? []).some((evidence) => evidence.occurrenceDetails?.some((detail) => remainingAcceptedKeys.has(detail.candidateKey))),
);
const finalConfirmedKeys = new Set(remainingRuntime.routes.flatMap((route) => (route.flightNumbers ?? []).map((flightNumber) =>
  directedIdentityKey(route.carrier, route.carrierEntityKey ?? route.carrier, route.pair[0], route.pair[1], flightNumber),
)));
for (const heldKey of AVINOR_REMAINING_HELD_KEYS) {
  if (finalConfirmedKeys.has(heldKey)
    || remainingRuntime.routes.some((route) => (route.timeBoundFlightNumbers ?? []).some((evidence) => (evidence.occurrenceDetails ?? []).some((detail) => detail.candidateKey === heldKey)))) {
    throw new Error(`Reviewer-held LTR identity entered final runtime: ${heldKey}`);
  }
}
if (remainingRuntime.routes.length !== followOnRuntime.routes.length + 45
  || remainingRuntime.routes.filter((route) => route.status === 'published').length !== followOnRuntime.routes.filter((route) => route.status === 'published').length + 45
  || finalConfirmedKeys.size !== remainingConfirmedBaselineKeys.size + 143
  || remainingRuntimeRoutesWithNewFlight.length !== remainingByRoute.size) {
  throw new Error('Remaining-airports runtime route, published-route or confirmed-identity projection changed');
}
const sirosProposalBytes = readFileSync(`${root}/${SIROS_PROPOSAL_INPUT}`);
const sirosRawRowsBytes = readFileSync(`${root}/${SIROS_RAW_ROWS_INPUT}`);
const sirosReleaseRaw = readFileSync(`${root}/${SIROS_RELEASE_INPUT}`, 'utf8');
const sirosRelease = SiroRegisteredPlanReleaseSchema.parse(JSON.parse(sirosReleaseRaw));
const sirosOverlay = buildSiroRegisteredPlanOverlay(sirosProposalBytes, sirosRawRowsBytes);
if (sirosRelease.inputs.proposal.sha256 !== sirosOverlay.artifacts.proposal.sha256
  || sirosRelease.inputs.proposal.bytes !== sirosOverlay.artifacts.proposal.bytes
  || sirosRelease.inputs.acceptedRawRows.sha256 !== sirosOverlay.artifacts.acceptedRawRows.sha256
  || sirosRelease.inputs.acceptedRawRows.bytes !== sirosOverlay.artifacts.acceptedRawRows.bytes
  || sirosRelease.source.bodySHA256 !== sirosOverlay.source.contentSHA256
  || sirosRelease.source.id !== sirosOverlay.source.id
  || sirosRelease.source.retrievedAtUTC !== sirosOverlay.source.retrievedAtUTC) {
  throw new Error('SIROS release manifest does not pin the exact source, proposal, and accepted raw-row artifacts');
}
const sirosApplied = applySiroRegisteredPlanOverlay(remainingRuntime, sirosOverlay);
const finalRuntime = sirosApplied.catalog;
const countRouteFlightNumbers = (catalog: RouteNetworkCatalog): number => catalog.routes.reduce((total, route) => total + (route.flightNumbers?.length ?? 0), 0);
const countRegisteredPlanRows = (catalog: RouteNetworkCatalog): number => catalog.routes.reduce((total, route) => total + (route.registeredPlans?.length ?? 0), 0);
if (countRouteFlightNumbers(finalRuntime) !== countRouteFlightNumbers(remainingRuntime)
  || finalRuntime.routes.length !== remainingRuntime.routes.length
  || sirosApplied.stats.sourceRows !== 14997
  || sirosApplied.stats.candidateAssociations !== 57
  || sirosApplied.stats.confirmedOverlaps !== 0) {
  throw new Error('SIROS registered-plan overlay changed route/flight layers or its reviewed release counts');
}

const sirosReferenceTime = Date.parse(SIROS_RETRIEVED_AT_UTC);
const sirosSourceById = new Map(finalRuntime.sources.map((source) => [source.id, source] as const));
const eligibleDatedAssociations = new Set<string>();
const eligibleDatedOccurrences = new Set<string>();
for (const route of finalRuntime.routes) {
  if (route.status !== 'published') continue;
  const routeKey = carrierRouteKey(route, ...route.pair);
  for (const evidence of route.timeBoundFlightNumbers ?? []) {
    const cutoff = Date.parse(sirosSourceById.get(evidence.sourceId)?.freshUntilUTC ?? '');
    if (!Number.isFinite(cutoff) || sirosReferenceTime >= cutoff) continue;
    const sourceAirportFromId = /^avinor-xml-public-(?:batch-)?([a-z]{3})-\d{8}$/.exec(evidence.sourceId)?.[1]?.toUpperCase();
    for (const time of evidence.occurrencesUTC) {
      const schedule = Date.parse(time);
      if (!Number.isFinite(schedule) || schedule <= sirosReferenceTime || schedule > cutoff) continue;
      const details = evidence.occurrenceDetails?.filter((detail) => detail.scheduleTimeUTC === time) ?? [];
      const sourceAirport = details[0]?.sourceAirport ?? sourceAirportFromId;
      const direction = details[0]?.arrDepRaw ?? (sourceAirport === route.pair[0] ? 'D' : sourceAirport === route.pair[1] ? 'A' : undefined);
      const isEligibleDeparture = direction === 'D' && sourceAirport === route.pair[0]
        && (evidence.plannerUse !== 'display-only' || details.some((detail) => Boolean(detail.candidateKey)));
      if (!isEligibleDeparture) continue;
      const associationKey = `${routeKey}|${evidence.flightNumber}|${evidence.sourceId}`;
      eligibleDatedAssociations.add(associationKey);
      eligibleDatedOccurrences.add(`${associationKey}|${time}`);
    }
  }
}

rawByFile.set(AVINOR_XML_INPUT, '');

// This artifact is fetched on every app startup. Keep it compact; the source
// layers remain human-reviewable and the tiny meta file carries diagnostics.
const runtimeText = `${JSON.stringify(finalRuntime)}\n`;
writeFileSync(`${root}/runtime-current.json`, runtimeText);

const runtime = finalRuntime;
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
    ...[...INPUTS, ...OPTIONAL_INPUTS, CORRECTIONS_INPUT, NUMBER_INPUT, QUARANTINES_INPUT, PRESERVATION_INPUT, AVINOR_SNAPSHOT_INPUT, AVINOR_XML_INPUT, AVINOR_BATCH_INPUT, ...[...batchXmlBytes.keys()].map((path) => path.split('/').at(-1)!), AVINOR_REMAINING_LEDGER_INPUT, AVINOR_REMAINING_RELEASE_INPUT, ...[...remainingXmlBytes.keys()].map((path) => path.split('/').at(-1)!), SIROS_PROPOSAL_INPUT, SIROS_RAW_ROWS_INPUT, SIROS_RELEASE_INPUT]
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
  source: 'Curated + provider-listed route-network layers, ODbL route sources, the first OSL snapshot, the ten-airport Avinor batch, the 11-snapshot follow-on ledger, the independently reviewed 143-identity Avinor remaining-airports release, and the exact reviewed ANAC SIROS registered-schedule snapshot (see THIRD_PARTY_NOTICES.md and per-source provenance)',
  license: 'mixed-source-terms',
  licenseNote: 'ODbL share-alike applies to the database derived from the ODbL route sources. Avinor, CAA, and ANAC SIROS evidence retain separate source-specific attribution and reuse conditions; see THIRD_PARTY_NOTICES.md. Registered schedules remain distinct from operation and dated-schedule evidence.',
  mergeStrategy: 'curated + generated',
  inputs: Object.fromEntries([
    ...INPUTS,
    ...OPTIONAL_INPUTS.filter((file) => rawByFile.has(file)),
    CORRECTIONS_INPUT,
    NUMBER_INPUT,
    QUARANTINES_INPUT,
    PRESERVATION_INPUT,
    'public/data/airports.json',
    AVINOR_SNAPSHOT_INPUT,
    AVINOR_XML_INPUT,
    AVINOR_BATCH_INPUT,
    ...[...batchXmlBytes.keys()].map((path) => path.split('/').at(-1)!),
    AVINOR_FOLLOWON_LEDGER_INPUT,
    AVINOR_FOLLOWON_RELEASE_INPUT,
    AVINOR_FOLLOWON_HELD_PATH,
    AVINOR_REMAINING_LEDGER_INPUT,
    AVINOR_REMAINING_RELEASE_INPUT,
    ...remainingRelease.sourceSnapshots.map((snapshot) => snapshot.rawAssetPath.split('/').at(-1)!),
    followOnRelease.assets.validationReportPath,
    followOnRelease.assets.cachedTermsSnapshotPath,
    SIROS_PROPOSAL_INPUT,
    SIROS_RAW_ROWS_INPUT,
    SIROS_RELEASE_INPUT,
    'scripts/build-runtime-route-network.ts',
    'scripts/lib/siros-registered-plan-input.ts',
    'scripts/build-siros-registered-plan-release.ts',
    'src/lib/rtw/siros-registered-plan-adapter.ts',
    'src/lib/schemas/siros-registered-plan-overlay.ts',
    'src/lib/schemas/siros-registered-plan-release.ts',
    'src/lib/schemas/route-network.ts',
  ].map((file) => {
    const docOrRootPath = /^(?:docs|scripts|public|src)\//.test(file) ? file : `${root}/${file}`;
    const bytes = file.endsWith('.xml') || file.endsWith('.gz')
      ? batchXmlBytes.get(`route-network/${file}`) ?? remainingXmlBytes.get(`route-network/${file}`) ?? avinorXmlBytes
      : undefined;
    const contentHash = file.endsWith('.gz')
      ? sha256Bytes(readFileSync(docOrRootPath))
      : bytes ? sha256Bytes(bytes) : sha256(readFileSync(docOrRootPath, 'utf8'));
    return [file, contentHash];
  })),
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
  avinorFollowOnCarrierCodes: followOnCarrierCodes,
  avinorRemainingAirports: {
    releaseId: remainingRelease.releaseId,
    acceptedIdentityGroups: remainingAcceptedKeys.size,
    retainedOccurrences: remainingRetainedOccurrences,
    newCarrierDirectedRoutes: newRemainingCarrierRoutes,
    existingCarrierDirectedRoutes: existingRemainingCarrierRoutes,
    sourceSnapshots: remainingRelease.sourceSnapshots.length,
    sourceCodes: remainingRelease.accepted.sourceOperatingCodeCounts,
    independentlyReviewedCurrentOccurrences: remainingRelease.accepted.currentOccurrenceEvidenceAtReviewAsOf,
    independentlyReviewedExpiredOccurrences: remainingRelease.accepted.expiredOccurrenceEvidenceAtReviewAsOf,
  },
  registeredScheduleEvidence: {
    sourceId: sirosOverlay.source.id,
    capturedSourceBodySHA256: sirosOverlay.source.contentSHA256,
    sourceRetrievedAtUTC: sirosOverlay.source.retrievedAtUTC,
    acceptedSourceRows: sirosApplied.stats.sourceRows,
    existingRouteKeysEnriched: sirosApplied.stats.existingRouteKeys,
    registeredPlanProfilesAdded: sirosApplied.stats.planProfilesAdded,
    registeredPlanProfilesMatchedAndLineaged: sirosApplied.stats.planProfilesMatched,
    totalRegisteredPlanProfilesAfterMerge: countRegisteredPlanRows(finalRuntime),
    storedFlightDesignatorRouteAssociations: countRouteFlightNumbers(finalRuntime),
    storedTimeBoundScheduleAssociations: finalRuntime.routes.reduce((total, route) => total + (route.timeBoundFlightNumbers?.length ?? 0), 0),
    eligibleDatedDepartureAssociationsAtCapture: eligibleDatedAssociations.size,
    eligibleDatedDepartureOccurrencesAtCapture: eligibleDatedOccurrences.size,
    datedEligibilityReferenceUTC: SIROS_RETRIEVED_AT_UTC,
    routeEntriesAdded: 0,
    flightNumbersPromoted: 0,
    timeBoundFlightNumbersPromoted: 0,
  },
};
writeFileSync(`${root}/runtime-current.meta.json`, `${JSON.stringify(meta, null, 2)}\n`);

console.log(JSON.stringify(meta, null, 2));
