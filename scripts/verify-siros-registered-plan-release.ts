import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { CaaWeeklyScheduleTierSchema } from '../src/lib/schemas/caa-weekly-schedule-tier.ts';
import { parseRouteNetworkCatalog } from '../src/lib/schemas/route-network.ts';
import { SiroRegisteredPlanReleaseSchema } from '../src/lib/schemas/siros-registered-plan-release.ts';
import { SIROS_SOURCE_ID } from './lib/siros-registered-plan-input.ts';

const ROOT = 'public/data/route-network';
const airports = new Set((JSON.parse(readFileSync('public/data/airports.json', 'utf8')) as Array<{ iata: string }>).map((row) => row.iata));
const releaseBytes = readFileSync(`${ROOT}/siros-registered-plan-release-20261007.json`);
const release = SiroRegisteredPlanReleaseSchema.parse(JSON.parse(releaseBytes.toString('utf8')));
const proposalBytes = readFileSync(`${ROOT}/siros-registered-plan-proposal-20261007.jsonl.gz`);
const rawRowsBytes = readFileSync(`${ROOT}/siros-registered-plan-raw-rows-20261007.jsonl.gz`);
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
for (const [name, bytes, expected] of [
  ['proposal', proposalBytes, release.inputs.proposal],
  ['accepted raw rows', rawRowsBytes, release.inputs.acceptedRawRows],
] as const) {
  if (bytes.byteLength !== expected.bytes || sha256(bytes) !== expected.sha256) throw new Error(`SIROS ${name} artifact differs from the release manifest`);
}

const runtime = parseRouteNetworkCatalog(JSON.parse(readFileSync(`${ROOT}/runtime-current.json`, 'utf8')), airports);
const meta = JSON.parse(readFileSync(`${ROOT}/runtime-current.meta.json`, 'utf8')) as {
  outputSha256: string;
  routes: number;
  registeredScheduleEvidence: {
    sourceId: string;
    acceptedSourceRows: number;
    existingRouteKeysEnriched: number;
    registeredPlanProfilesAdded: number;
    registeredPlanProfilesMatchedAndLineaged: number;
    totalRegisteredPlanProfilesAfterMerge: number;
    storedFlightDesignatorRouteAssociations: number;
    storedTimeBoundScheduleAssociations: number;
    eligibleDatedDepartureAssociationsAtCapture: number;
    eligibleDatedDepartureOccurrencesAtCapture: number;
    routeEntriesAdded: number;
    flightNumbersPromoted: number;
    timeBoundFlightNumbersPromoted: number;
  };
  avinorRemainingAirports: { acceptedIdentityGroups: number; retainedOccurrences: number; sourceSnapshots: number };
};
const runtimeText = readFileSync(`${ROOT}/runtime-current.json`, 'utf8');
if (sha256(Buffer.from(runtimeText.replace(/\r\n/g, '\n'), 'utf8')) !== meta.outputSha256) throw new Error('Runtime output hash differs from runtime metadata');
if (runtime.routes.length !== meta.routes) throw new Error('Runtime route count differs from runtime metadata');

const source = runtime.sources.find((row) => row.id === SIROS_SOURCE_ID);
if (!source || source.contentSHA256 !== release.source.bodySHA256 || source.retrievedAtUTC !== release.source.retrievedAtUTC
  || source.rawAssetPath !== 'route-network/siros-registered-plan-raw-rows-20261007.jsonl.gz') {
  throw new Error('Runtime SIROS source metadata differs from its release manifest');
}
const routesWithSiros = runtime.routes.filter((route) => (route.registeredPlans ?? []).some((plan) =>
  (plan.sourceRowLineage ?? []).some((row) => row.sourceId === SIROS_SOURCE_ID)));
const lineageRows = routesWithSiros.flatMap((route) => (route.registeredPlans ?? []).flatMap((plan) =>
  (plan.sourceRowLineage ?? []).filter((row) => row.sourceId === SIROS_SOURCE_ID)));
if (routesWithSiros.length !== 386 || lineageRows.length !== 14997
  || new Set(lineageRows.map((row) => `${row.sourceId}:${row.sourceRow}`)).size !== 14997) {
  throw new Error(`Runtime SIROS route/lineage counts differ: routes=${routesWithSiros.length}; rows=${lineageRows.length}`);
}
const rawRows = gunzipSync(rawRowsBytes).toString('utf8').split(/\r?\n/).filter(Boolean)
  .map((line) => JSON.parse(line) as { sourceRow: number; rawSourceRow: string; sourceRowSHA256: string });
if (rawRows.length !== 14997) throw new Error('Raw source-row archive count differs from the reviewed handoff');
const rawRowsByNumber = new Map(rawRows.map((row) => [row.sourceRow, row] as const));
for (const row of lineageRows) {
  const archived = rawRowsByNumber.get(row.sourceRow);
  if (!archived || archived.sourceRowSHA256 !== row.sourceRowSHA256
    || sha256(Buffer.from(archived.rawSourceRow, 'utf8')) !== row.sourceRowSHA256
    || row.sourceBodySHA256 !== release.source.bodySHA256) {
    throw new Error(`Runtime source-row lineage does not match its exact raw row ${row.sourceRow}`);
  }
}

const schedule = meta.registeredScheduleEvidence;
if (schedule.sourceId !== SIROS_SOURCE_ID || schedule.acceptedSourceRows !== 14997 || schedule.existingRouteKeysEnriched !== 386
  || schedule.registeredPlanProfilesAdded !== 12422 || schedule.registeredPlanProfilesMatchedAndLineaged !== 2575
  || schedule.totalRegisteredPlanProfilesAfterMerge !== 15304 || schedule.storedFlightDesignatorRouteAssociations !== 2767
  || schedule.storedTimeBoundScheduleAssociations !== 2274 || schedule.eligibleDatedDepartureAssociationsAtCapture !== 1104
  || schedule.eligibleDatedDepartureOccurrencesAtCapture !== 3581 || schedule.routeEntriesAdded !== 0
  || schedule.flightNumbersPromoted !== 0 || schedule.timeBoundFlightNumbersPromoted !== 0) {
  throw new Error('Runtime registered-schedule evidence counts changed from the verified build');
}
for (const route of runtime.routes) {
  if (route.flightNumberSourceIds?.includes(SIROS_SOURCE_ID) || route.flightNumberCandidateSourceIds?.includes(SIROS_SOURCE_ID)
    || (route.timeBoundFlightNumbers ?? []).some((row) => row.sourceId === SIROS_SOURCE_ID || row.candidateSourceIds.includes(SIROS_SOURCE_ID))) {
    throw new Error(`SIROS evidence was promoted into a flight-number layer on ${route.carrier}:${route.pair.join('-')}`);
  }
}
const acnRoutes = routesWithSiros.filter((route) => route.carrier === '2F' && route.carrierEntityKey === 'BR+ACN+azul-conecta-ltda');
if (acnRoutes.length !== 4 || acnRoutes.some((route) => route.flightNumbers || route.flightNumberCandidates || route.timeBoundFlightNumbers)) {
  throw new Error('Qualified ACN/2F schedule evidence lost its identity or was promoted into selectable flight layers');
}

const caa = CaaWeeklyScheduleTierSchema.parse(JSON.parse(readFileSync(`${ROOT}/caa-weekly-schedule-tier-20261006.json`, 'utf8')));
if (caa.associations.length !== 488) throw new Error('Separate CAA reference tier no longer contains its 488 associations');
const sourceById = new Map(runtime.sources.map((row) => [row.id, row] as const));
let avinorOccurrenceCount = 0;
for (const route of runtime.routes) {
  for (const evidence of route.timeBoundFlightNumbers ?? []) {
    if (!evidence.sourceId.startsWith('avinor-xml-public-')) continue;
    const sourceRow = sourceById.get(evidence.sourceId);
    if (!sourceRow?.freshUntilUTC) throw new Error(`Avinor source expiry is missing for ${evidence.sourceId}`);
    for (const occurrence of evidence.occurrenceDetails ?? []) {
      if (occurrence.expiresAtUTC !== occurrence.scheduleTimeUTC || occurrence.scheduleTimeUTC > sourceRow.freshUntilUTC) {
        throw new Error(`Avinor occurrence expiry changed for ${evidence.sourceId} row ${occurrence.sourceRow}`);
      }
      avinorOccurrenceCount += 1;
    }
  }
}
if (meta.avinorRemainingAirports.acceptedIdentityGroups !== 143
  || meta.avinorRemainingAirports.retainedOccurrences !== 517
  || meta.avinorRemainingAirports.sourceSnapshots !== 24
  || avinorOccurrenceCount < 517) {
  throw new Error('Previously reviewed Avinor expiry/occurrence summary changed');
}

console.log(JSON.stringify({
  verified: true,
  releaseManifestSHA256: sha256(releaseBytes),
  runtimeSHA256: meta.outputSha256,
  sourceRows: lineageRows.length,
  registeredPlanProfiles: schedule.totalRegisteredPlanProfilesAfterMerge,
  storedFlightDesignatorRouteAssociations: schedule.storedFlightDesignatorRouteAssociations,
  eligibleDatedDepartureAssociationsAtCapture: schedule.eligibleDatedDepartureAssociationsAtCapture,
  eligibleDatedDepartureOccurrencesAtCapture: schedule.eligibleDatedDepartureOccurrencesAtCapture,
  caaAssociations: caa.associations.length,
  avinorDetailOccurrences: avinorOccurrenceCount,
}, null, 2));
