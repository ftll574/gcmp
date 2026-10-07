import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SiroRegisteredPlanReleaseSchema } from '../src/lib/schemas/siros-registered-plan-release.ts';
import {
  SIROS_ATTRIBUTION,
  SIROS_HANDOFF_SUMMARY_SHA256,
  SIROS_PROPOSAL_PATH,
  SIROS_PROPOSAL_SHA256,
  SIROS_RAW_ROWS_PATH,
  SIROS_RETRIEVED_AT_UTC,
  SIROS_RIGHTS_BASIS,
  SIROS_REVIEW_MANIFEST_SHA256,
  SIROS_REVIEW_REPORT_SHA256,
  SIROS_REVIEW_SUMMARY_SHA256,
  SIROS_RUNTIME_COMMIT,
  SIROS_RUNTIME_SHA256,
  SIROS_SOURCE_BODY_SHA256,
  SIROS_SOURCE_ID,
  SIROS_SOURCE_URL,
  buildSiroRegisteredPlanOverlay,
  buildSiroRawRowsArchive,
} from './lib/siros-registered-plan-input.ts';

const DATA = resolve('public/data');
const proposalPath = resolve(DATA, SIROS_PROPOSAL_PATH);
const rawRowsPath = resolve(DATA, SIROS_RAW_ROWS_PATH);
const outputPath = resolve(DATA, 'route-network/siros-registered-plan-release-20261007.json');
const proposalBytes = readFileSync(proposalPath);
const rawRowsBytes = readFileSync(rawRowsPath);
const overlay = buildSiroRegisteredPlanOverlay(proposalBytes, rawRowsBytes);
if (createHash('sha256').update(proposalBytes).digest('hex') !== SIROS_PROPOSAL_SHA256) {
  throw new Error('SIROS proposal bytes differ from the independently reviewed pin');
}

const captureCsvPath = process.argv[2];
if (captureCsvPath) {
  const sourceCsvBytes = readFileSync(captureCsvPath);
  const rebuiltRawRows = buildSiroRawRowsArchive(sourceCsvBytes, proposalBytes);
  if (!rebuiltRawRows.equals(rawRowsBytes)) {
    throw new Error('Accepted SIROS raw rows cannot be reproduced from the supplied captured CSV');
  }
  console.log(JSON.stringify({ capturedCsvBytes: sourceCsvBytes.byteLength, capturedCsvSHA256: createHash('sha256').update(sourceCsvBytes).digest('hex'), acceptedRawRowsReproduced: true }, null, 2));
}

const release = SiroRegisteredPlanReleaseSchema.parse({
  schemaVersion: 1,
  releaseId: 'anac-siros-registered-plans-20261007',
  source: {
    id: SIROS_SOURCE_ID,
    url: SIROS_SOURCE_URL,
    checkedOn: '2026-10-07',
    retrievedAtUTC: SIROS_RETRIEVED_AT_UTC,
    bodyBytes: 27270017,
    bodySHA256: SIROS_SOURCE_BODY_SHA256,
    attributionText: SIROS_ATTRIBUTION,
    rightsBasis: SIROS_RIGHTS_BASIS,
  },
  baselineRuntime: { commit: SIROS_RUNTIME_COMMIT, runtimeSHA256: SIROS_RUNTIME_SHA256 },
  inputs: {
    proposal: overlay.artifacts.proposal,
    acceptedRawRows: overlay.artifacts.acceptedRawRows,
    independentReview: {
      handoffSummarySHA256: SIROS_HANDOFF_SUMMARY_SHA256,
      reviewSummarySHA256: SIROS_REVIEW_SUMMARY_SHA256,
      reviewReportSHA256: SIROS_REVIEW_REPORT_SHA256,
      reviewManifestSHA256: SIROS_REVIEW_MANIFEST_SHA256,
    },
  },
  accepted: {
    sourceRows: overlay.counts.acceptedSourceRows,
    existingRouteKeys: overlay.counts.existingRouteKeys,
    uniqueDesignatorAssociations: overlay.counts.associationGroups,
    existingCandidateRows: overlay.counts.candidateRows,
    existingCandidateAssociations: overlay.counts.candidateAssociations,
    confirmedFlightOverlaps: overlay.counts.confirmedRows,
    newIdentityRowsOnExistingRoutes: overlay.counts.newIdentityRows,
    newIdentityAssociationsOnExistingRoutes: overlay.counts.newIdentityAssociations,
    registeredPlanIdentityMatchRows: overlay.counts.registeredPlanIdentityMatchRows,
    sameRegistrationAndProfileRows: overlay.counts.sameRegistrationAndProfileRows,
    designatorIdentitiesAbsentFromCandidateAndConfirmedLayers: overlay.counts.newIdentityAssociations,
    baselineConfirmedFlightAssociations: 2767,
  },
  excluded: {
    allHeldExpiredAndOutOfScopeRowsOmitted: true,
    clockConflictRowsHeld: overlay.counts.conflictRowsHeldOut,
    expiredRows: overlay.counts.expiredRowsHeldOut,
    schemaIncompatibleZRows: overlay.counts.schemaIncompatibleRowsHeldOut,
    newRouteAdmissionRows: overlay.counts.newRouteRowsHeldOut,
  },
  boundaries: [
    'Registered schedule evidence is not proof of actual operation, bookability, physical nonstop service, or award eligibility.',
    'SIROS does not supply an arrival-day offset; validity dates and source weekday columns are retained, and schedule clocks are UTC.',
    'Raw flight-number strings preserve leading zeroes; qualified carrier identity is retained where required.',
    'Codeshare marketing identities remain raw source fields and do not establish the registered or operating carrier.',
    'No SIROS rows are promoted into flightNumbers or timeBoundFlightNumbers; all out-of-scope held, expired, schema-incompatible, and new-route cases remain omitted.',
  ],
});
writeFileSync(outputPath, `${JSON.stringify(release, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, acceptedSourceRows: release.accepted.sourceRows, routeKeys: release.accepted.existingRouteKeys, artifactBytes: overlay.artifacts }, null, 2));
