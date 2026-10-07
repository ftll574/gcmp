import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { SiroRegisteredPlanOverlaySchema, type SiroRegisteredPlanOverlay } from '../../src/lib/schemas/siros-registered-plan-overlay.ts';

export const SIROS_SOURCE_ID = 'anac-siros-registrations-20261007';
export const SIROS_SOURCE_URL = 'https://siros.anac.gov.br/siros/registros/registros/registros.csv';
export const SIROS_RETRIEVED_AT_UTC = '2026-10-07T07:14:26.504894Z';
export const SIROS_SOURCE_BODY_SHA256 = '24e500b6ca5c2af6d843c7b12dd9fecad4104667de6bcdfdac894d79e6b3cbf4';
export const SIROS_PROPOSAL_SHA256 = 'ce774d7c850fd041ba9ab13284e0e03269387e9bf117873fca4df9a251abd2e5';
export const SIROS_RUNTIME_COMMIT = 'f472092b0324df7b2d744596709c69f27cbbad55';
export const SIROS_RUNTIME_SHA256 = 'aa90283d52015b1b418c3840252cb34152f9ed577a3e0766291935b92b151537';
export const SIROS_ATTRIBUTION = 'Source: ANAC, Registro de Serviços Aéreos (SIROS), https://siros.anac.gov.br/siros/registros/registros/registros.csv; snapshot retrieved 2026-10-07 UTC; transformed by schema validation, dated registered-stage classification, exact-code identity mapping, and route-key comparison. Not endorsed by ANAC.';
export const SIROS_RIGHTS_BASIS = 'Federal open-data reuse terms under Decree 8.777/2016 and federal portal terms permit reuse with attribution, subject to resource-specific terms. No Creative Commons variant or separate resource-specific license is asserted.';

export const SIROS_PROPOSAL_PATH = 'route-network/siros-registered-plan-proposal-20261007.jsonl.gz';
export const SIROS_RAW_ROWS_PATH = 'route-network/siros-registered-plan-raw-rows-20261007.jsonl.gz';
export const SIROS_RAW_ROWS_ASSET_PATH = 'route-network/siros-registered-plan-raw-rows-20261007.jsonl.gz';

export const SIROS_HANDOFF_SUMMARY_SHA256 = '8cda2be8f76644125ef35e3c743c8f57247fda6f71ecb8bb0fbbd5d159ffbae8';
export const SIROS_REVIEW_SUMMARY_SHA256 = '5da55c3c12a55aa88ad324b36ac7a4b6913d64e448f5752a0d82cb9b52909765';
export const SIROS_REVIEW_REPORT_SHA256 = '215e0070d3d6de1c4af3985eb8eda1d951a438da3dcd0009cb43a3ae9b539a21';
export const SIROS_REVIEW_MANIFEST_SHA256 = 'f34e8982f94f03b37906f48ea86f2586899bdda0e84c15a2dcf51c632ef14c7b';

export interface SiroRawSourceRow {
  readonly sourceRow: number;
  readonly rawSourceRow: string;
  readonly sourceRowSHA256: string;
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseJsonlGzip<T>(bytes: Buffer, label: string): T[] {
  const text = gunzipSync(bytes).toString('utf8');
  return text.split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line) as T;
    } catch {
      throw new Error(`${label} JSONL line ${index + 1} is malformed`);
    }
  });
}

function physicalLines(bytes: Buffer): Buffer[] {
  const lines: Buffer[] = [];
  let start = 0;
  while (start < bytes.length) {
    const newline = bytes.indexOf(0x0a, start);
    const end = newline < 0 ? bytes.length : newline + 1;
    lines.push(bytes.subarray(start, end));
    start = end;
  }
  return lines;
}

function parseSemicolonRecord(raw: string): string[] {
  const text = raw.endsWith('\r\n') ? raw.slice(0, -2) : raw.endsWith('\n') ? raw.slice(0, -1) : raw;
  const values: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ';' && !quoted) {
      values.push(value);
      value = '';
    } else {
      value += char;
    }
  }
  if (quoted) throw new Error('Raw SIROS source row has an unterminated quoted field');
  values.push(value);
  if (values.length !== 28) throw new Error(`Raw SIROS source row has ${values.length} columns instead of 28`);
  return values;
}

function validateRawPlan(
  rawRow: SiroRawSourceRow,
  plan: Record<string, unknown>,
  lineage: Record<string, unknown>,
): void {
  const values = parseSemicolonRecord(rawRow.rawSourceRow);
  // SIROS weekday columns contain the count of registered operations for
  // that weekday (0 means none), not boolean flags. Keep weekday identity,
  // while not interpreting the numeric count as a separate schedule fact.
  const weekdays = values.slice(4, 11).flatMap((value, index) => Number(value) > 0 ? [index + 1] : []);
  const matches = [
    [plan.registrationId, values[12], 'registration ID'],
    [plan.registeredOperatorICAO, values[0], 'registered operator ICAO'],
    [plan.flightNumberRaw, values[2], 'raw flight number'],
    [plan.effectiveFrom, values[15], 'effective start date'],
    [plan.effectiveUntil, values[16], 'effective end date'],
    [plan.departureUTC, values[23], 'departure UTC clock'],
    [plan.arrivalUTC, values[24], 'arrival UTC clock'],
    [String(plan.stageNumber), values[18], 'stage number'],
    [plan.codeshareRaw, values[27], 'raw codeshare field'],
    [lineage.statusRaw, values[13], 'raw registration status'],
  ] as const;
  for (const [expected, actual, label] of matches) {
    if (expected !== actual) throw new Error(`SIROS proposal does not match raw source row ${rawRow.sourceRow}: ${label}`);
  }
  if (JSON.stringify(plan.weekdays) !== JSON.stringify(weekdays)) throw new Error(`SIROS proposal weekdays do not match raw source row ${rawRow.sourceRow}`);
  if (values[25] !== 'REGULAR DE PASSAGEIROS' || values[26] !== 'PASSAGEIROS') {
    throw new Error(`SIROS source row ${rawRow.sourceRow} is outside the accepted regular-passenger scope`);
  }
  if (plan.versionConflict !== false || lineage.disposition !== 'accepted' || lineage.actualOperation !== 'unverified' || lineage.bookable !== false) {
    throw new Error(`SIROS row ${rawRow.sourceRow} is not accepted evidence-only schedule data`);
  }
}

/** Build the exact accepted source-row sidecar from the verified full capture. */
export function buildSiroRawRowsArchive(sourceCsvBytes: Buffer, proposalGzipBytes: Buffer): Buffer {
  if (sha256(sourceCsvBytes) !== SIROS_SOURCE_BODY_SHA256) throw new Error('Captured SIROS CSV body hash does not match the reviewed source snapshot');
  if (sha256(proposalGzipBytes) !== SIROS_PROPOSAL_SHA256) throw new Error('SIROS accepted proposal hash does not match the reviewed handoff');
  const proposalGroups = parseJsonlGzip<Array<Record<string, unknown>>[number]>(proposalGzipBytes, 'SIROS proposal');
  const sourceRows = new Set<number>();
  for (const group of proposalGroups) {
    for (const entry of group.registeredPlans as Array<{ lineage: { sourceRow: number } }>) {
      sourceRows.add(entry.lineage.sourceRow);
    }
  }
  if (sourceRows.size !== 14997) throw new Error(`Expected 14,997 accepted source rows, found ${sourceRows.size}`);
  const lines = physicalLines(sourceCsvBytes);
  if (lines.length !== 74134 || !lines[0]?.toString('utf8').includes('Horários em UTC')) throw new Error('Captured SIROS CSV physical-row structure changed');
  const records = [...sourceRows].sort((a, b) => a - b).map((sourceRow) => {
    const sourceBytes = lines[sourceRow + 1];
    if (!sourceBytes) throw new Error(`SIROS source row ordinal ${sourceRow} is outside the captured file`);
    return {
      sourceRow,
      rawSourceRow: sourceBytes.toString('utf8'),
      sourceRowSHA256: sha256(sourceBytes),
    } satisfies SiroRawSourceRow;
  });
  const jsonl = Buffer.from(`${records.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
  return gzipSync(jsonl, { level: 9, mtime: 0 });
}

function planProfileKey(plan: Record<string, unknown>): string {
  return JSON.stringify([
    String(plan.registrationId), plan.registeredOperator, plan.carrierEntityKey ?? null,
    String(plan.flightNumberRaw), plan.effectiveFrom, plan.effectiveUntil, plan.weekdays,
    plan.departureUTC, plan.arrivalUTC, plan.arrivalDayOffset, plan.stageNumber ?? null,
    plan.versionConflict ?? false,
  ]);
}

/** Validate reviewed inputs and adapt them to the existing registeredPlans schema. */
export function buildSiroRegisteredPlanOverlay(
  proposalGzipBytes: Buffer,
  rawRowsGzipBytes: Buffer,
): SiroRegisteredPlanOverlay {
  if (sha256(proposalGzipBytes) !== SIROS_PROPOSAL_SHA256) throw new Error('SIROS accepted proposal hash does not match the reviewed handoff');
  const rawRows = parseJsonlGzip<SiroRawSourceRow>(rawRowsGzipBytes, 'SIROS accepted raw rows');
  if (rawRows.length !== 14997) throw new Error(`Expected 14,997 accepted raw source rows, found ${rawRows.length}`);
  const rawRowsByNumber = new Map<number, SiroRawSourceRow>();
  for (const row of rawRows) {
    if (!Number.isInteger(row.sourceRow) || row.sourceRow < 1 || rawRowsByNumber.has(row.sourceRow)) throw new Error(`Duplicate or invalid SIROS raw source row ${row.sourceRow}`);
    if (sha256(Buffer.from(row.rawSourceRow, 'utf8')) !== row.sourceRowSHA256) throw new Error(`SIROS raw source row hash mismatch at row ${row.sourceRow}`);
    rawRowsByNumber.set(row.sourceRow, row);
  }

  const proposalGroups = parseJsonlGzip<Record<string, unknown>>(proposalGzipBytes, 'SIROS proposal');
  const routeGroups = new Map<string, {
    carrier: string;
    carrierEntityKey?: string;
    pair: [string, string];
    registeredPlans: Array<Record<string, unknown> & { sourceRowLineage: Array<Record<string, unknown>> }>;
  }>();
  const associationRows: Array<{ key: string; tier: 'existing-candidate' | 'new-identity-on-existing-route' }> = [];
  const sourceRowsSeen = new Set<number>();
  let candidateRows = 0;
  let newIdentityRows = 0;
  let registeredPlanIdentityMatchRows = 0;
  let sameRegistrationAndProfileRows = 0;

  for (const group of proposalGroups) {
    const route = group.route as { carrier: string; carrierEntityKey: string | null; pair: [string, string]; existingRuntimeRoute: boolean };
    const tier = group.runtimeFlightNumberTier as string;
    if (route.existingRuntimeRoute !== true) throw new Error('SIROS proposal contains a route-admission case');
    if (tier !== 'existing-candidate' && tier !== 'new-identity-on-existing-route') throw new Error(`SIROS proposal has an out-of-scope flight-number tier: ${tier}`);
    const routeKey = `${route.carrierEntityKey ?? route.carrier}:${route.pair[0]}-${route.pair[1]}`;
    const routeGroup = routeGroups.get(routeKey) ?? {
      carrier: route.carrier,
      ...(route.carrierEntityKey ? { carrierEntityKey: route.carrierEntityKey } : {}),
      pair: route.pair,
      registeredPlans: [],
    };
    if (routeGroup.carrier !== route.carrier || routeGroup.carrierEntityKey !== (route.carrierEntityKey ?? undefined)
      || routeGroup.pair[0] !== route.pair[0] || routeGroup.pair[1] !== route.pair[1]) {
      throw new Error(`SIROS proposal route identity collision: ${routeKey}`);
    }
    const associationKey = group.associationKey as string;
    associationRows.push({ key: associationKey, tier });

    const planEntries = group.registeredPlans as Array<{
      plan: Record<string, unknown>;
      lineage: Record<string, unknown>;
      runtimeRegisteredPlanIdentityMatch: boolean;
      runtimeSameRegistrationScheduleProfileAlreadyPresent: boolean;
    }>;
    for (const entry of planEntries) {
      const sourceRow = entry.lineage.sourceRow as number;
      if (sourceRowsSeen.has(sourceRow)) throw new Error(`SIROS proposal repeats source row ${sourceRow}`);
      sourceRowsSeen.add(sourceRow);
      const raw = rawRowsByNumber.get(sourceRow);
      if (!raw) throw new Error(`SIROS raw row archive is missing source row ${sourceRow}`);
      if (entry.lineage.sourceBodySHA256 !== SIROS_SOURCE_BODY_SHA256
        || entry.lineage.captureURL !== SIROS_SOURCE_URL
        || entry.lineage.captureRetrievedAtUTC !== SIROS_RETRIEVED_AT_UTC
        || entry.lineage.disposition !== 'accepted'
        || entry.lineage.actualOperation !== 'unverified'
        || entry.lineage.bookable !== false) {
        throw new Error(`SIROS proposal lineage differs from the reviewed source pin at row ${sourceRow}`);
      }
      validateRawPlan(raw, entry.plan, entry.lineage);
      const designator = `${route.carrier}${String(entry.plan.flightNumberRaw)}`;
      const expectedAssociation = `${route.carrier}|${route.carrierEntityKey ?? route.carrier}|${route.pair[0]}>${route.pair[1]}|${designator}`;
      if (associationKey !== expectedAssociation) throw new Error(`SIROS source row ${sourceRow} is grouped under the wrong exact identity`);
      if (entry.runtimeRegisteredPlanIdentityMatch) registeredPlanIdentityMatchRows += 1;
      if (entry.runtimeSameRegistrationScheduleProfileAlreadyPresent) sameRegistrationAndProfileRows += 1;
      if (tier === 'existing-candidate') candidateRows += 1;
      else newIdentityRows += 1;

      const sourceRowLineage = {
        sourceId: SIROS_SOURCE_ID,
        sourceRow,
        registeredOperator: entry.plan.registeredOperator,
        registeredOperatorICAO: entry.plan.registeredOperatorICAO,
        ...(entry.plan.carrierEntityKey ? { carrierEntityKey: entry.plan.carrierEntityKey } : {}),
        sourceRowSHA256: raw.sourceRowSHA256,
        sourceBodySHA256: SIROS_SOURCE_BODY_SHA256,
        captureRetrievedAtUTC: SIROS_RETRIEVED_AT_UTC,
        statusRaw: entry.lineage.statusRaw,
        disposition: 'accepted',
        actualOperation: 'unverified',
        bookable: false,
      };
      const plan = { ...entry.plan, sourceRowLineage: [sourceRowLineage] };
      const profileKey = planProfileKey(plan);
      const matchingPlan = routeGroup.registeredPlans.find((candidate) => planProfileKey(candidate) === profileKey);
      if (matchingPlan) {
        if (matchingPlan.registeredOperatorICAO !== plan.registeredOperatorICAO) throw new Error(`SIROS operator identity conflict at source row ${sourceRow}`);
        matchingPlan.sourceRowLineage.push(sourceRowLineage);
      } else {
        routeGroup.registeredPlans.push(plan);
      }
    }
    routeGroups.set(routeKey, routeGroup);
  }

  if (sourceRowsSeen.size !== 14997 || rawRowsByNumber.size !== sourceRowsSeen.size) throw new Error('SIROS proposal and accepted raw-row partitions are not one-to-one');
  if (proposalGroups.length !== 1447 || routeGroups.size !== 386 || candidateRows !== 276 || newIdentityRows !== 14721
    || registeredPlanIdentityMatchRows !== 2592 || sameRegistrationAndProfileRows !== 2575) {
    throw new Error('SIROS proposal counts differ from the independently reviewed handoff');
  }
  for (const route of routeGroups.values()) {
    for (const plan of route.registeredPlans) {
      plan.sourceRowLineage.sort((left, right) => Number(left.sourceRow) - Number(right.sourceRow));
    }
    route.registeredPlans.sort((left, right) => String(left.registrationId).localeCompare(String(right.registrationId))
      || Number(left.stageNumber ?? 0) - Number(right.stageNumber ?? 0)
      || String(left.effectiveFrom).localeCompare(String(right.effectiveFrom))
      || String(left.departureUTC).localeCompare(String(right.departureUTC)));
  }

  const source = {
    id: SIROS_SOURCE_ID,
    url: SIROS_SOURCE_URL,
    checkedOn: '2026-10-07',
    retrievedAtUTC: SIROS_RETRIEVED_AT_UTC,
    contentSHA256: SIROS_SOURCE_BODY_SHA256,
    rawAssetPath: SIROS_RAW_ROWS_ASSET_PATH,
    attribution: SIROS_ATTRIBUTION,
    note: `${SIROS_ATTRIBUTION} ${SIROS_RIGHTS_BASIS} Registered passenger-stage schedule evidence only; not proof of actual operation, bookability or nonstop operation. Source times and weekdays are UTC; arrival-day offset is not provided.`,
  };
  const rawRowsCompressedBytes = rawRowsGzipBytes;
  return SiroRegisteredPlanOverlaySchema.parse({
    schemaVersion: 1,
    source,
    attributionText: SIROS_ATTRIBUTION,
    rightsBasis: SIROS_RIGHTS_BASIS,
    artifacts: {
      proposal: { path: SIROS_PROPOSAL_PATH, bytes: proposalGzipBytes.byteLength, sha256: sha256(proposalGzipBytes) },
      acceptedRawRows: { path: SIROS_RAW_ROWS_PATH, bytes: rawRowsCompressedBytes.byteLength, sha256: sha256(rawRowsCompressedBytes) },
    },
    review: {
      handoffSummarySHA256: SIROS_HANDOFF_SUMMARY_SHA256,
      reviewSummarySHA256: SIROS_REVIEW_SUMMARY_SHA256,
      reviewReportSHA256: SIROS_REVIEW_REPORT_SHA256,
      reviewManifestSHA256: SIROS_REVIEW_MANIFEST_SHA256,
      runtimeCommit: SIROS_RUNTIME_COMMIT,
      runtimeSHA256: SIROS_RUNTIME_SHA256,
    },
    counts: {
      acceptedSourceRows: sourceRowsSeen.size,
      associationGroups: proposalGroups.length,
      existingRouteKeys: routeGroups.size,
      candidateRows,
      candidateAssociations: associationRows.filter((row) => row.tier === 'existing-candidate').length,
      confirmedRows: 0,
      newIdentityRows,
      newIdentityAssociations: associationRows.filter((row) => row.tier === 'new-identity-on-existing-route').length,
      registeredPlanIdentityMatchRows,
      sameRegistrationAndProfileRows,
      conflictRowsHeldOut: 308,
      expiredRowsHeldOut: 2146,
      schemaIncompatibleRowsHeldOut: 316,
      newRouteRowsHeldOut: 108,
    },
    associations: associationRows.sort((left, right) => left.key.localeCompare(right.key)),
    routes: [...routeGroups.values()].sort((left, right) => left.carrier.localeCompare(right.carrier)
      || (left.carrierEntityKey ?? left.carrier).localeCompare(right.carrierEntityKey ?? right.carrier)
      || left.pair[0].localeCompare(right.pair[0]) || left.pair[1].localeCompare(right.pair[1])),
  });
}
