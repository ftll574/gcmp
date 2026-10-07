import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { parseRouteNetworkCatalog, type RouteNetworkCatalog } from '../src/lib/schemas/route-network.ts';
import { parseAvinorXmlPublicSnapshot } from '../src/lib/schemas/avinor-xml-public.ts';
import { parseAvinorXmlPublicBatch } from '../src/lib/schemas/avinor-xml-public-batch.ts';
import { parseAvinorFollowOnLedgerJsonl, parseAvinorFollowOnRelease } from '../src/lib/schemas/avinor-follow-on.ts';
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
const AVINOR_FOLLOWON_LEDGER_INPUT = 'avinor-follow-on-evidence-20261006.jsonl';
const AVINOR_FOLLOWON_RELEASE_INPUT = 'avinor-follow-on-release-20261006.json';
const AVINOR_FOLLOWON_HELD_PATH = 'docs/avinor-follow-on-release-20261007/reviewer-held-ledger.jsonl';
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
const finalRuntime = followOnRuntime;

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
  source: 'curated + provider-listed route-network layers, the first OSL snapshot, the ten-airport Avinor batch, and the 11-snapshot follow-on ledger (see THIRD_PARTY_NOTICES.md and exact occurrence/source expiry metadata)',
  license: 'ODbL-1.0',
  licenseNote: 'Derived database of ODbL-licensed ADS-B route sources; share-alike applies. Avinor is date-scoped schedule evidence with separate attribution terms; every occurrence expires at its scheduled UTC time, and each snapshot has its own source-window cutoff.',
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
    followOnRelease.assets.validationReportPath,
    followOnRelease.assets.cachedTermsSnapshotPath,
  ].map((file) => {
    const docOrRootPath = /^(?:docs|scripts|public)\//.test(file) ? file : `${root}/${file}`;
    const bytes = file.endsWith('.xml')
      ? batchXmlBytes.get(`route-network/${file}`) ?? avinorXmlBytes
      : undefined;
    return [file, bytes ? sha256Bytes(bytes) : sha256(readFileSync(docOrRootPath, 'utf8'))];
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
};
writeFileSync(`${root}/runtime-current.meta.json`, `${JSON.stringify(meta, null, 2)}\n`);

console.log(JSON.stringify(meta, null, 2));
