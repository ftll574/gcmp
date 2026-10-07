/** Assemble accepted DGCA schedule evidence packets into one non-selectable data catalog. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { parseAirportCatalog } from '../src/lib/schemas/airports.ts';
import { SpiceJetScheduleReferenceCatalogSchema } from '../src/lib/schemas/spicejet-schedule-references.ts';
import { DgcaScheduleEvidenceCatalogSchema } from '../src/lib/schemas/dgca-schedule-evidence.ts';

const ROOT = resolve(process.cwd());
const SPICEJET_PACKET = join(ROOT, 'docs/source-evidence/spicejet-ss-2026');
const INDIGO_PACKET = join(ROOT, 'docs/source-evidence/indigo-ss-2026');
const AIRINDIA_PACKET = join(ROOT, 'docs/source-evidence/airindia-dgca-2026');
const SPICEJET_NORMALIZED = join(ROOT, '.tmp/spicejet-schedule-reference-normalizer.json');
const OUT = join(ROOT, 'public/data/dgca-schedule-evidence-20261007.json');
const RELEASE_BASE_RUNTIME_SHA256 = '34c465081e6835721abf95bd6ca9e132f3afad6386977b4ca6ca797b528c37e9';
const INDIGO_MANIFEST_SHA256 = '6c02de06403cde63f2acea74d09c608b84c6a6d9ab109a4f5547b7ff4750eede';
const AIRINDIA_MANIFEST_SHA256 = 'f51868d23f1170ba81bcd650f570e9cb2d3c72575a4827ac39900405dfefd17b';
const INDIGO_ARTIFACT_HASHES: Record<string, string> = {
  'REVIEW.md': 'a6758d572f182f2c0a1518a9e0027b73db7b0bff75bb6ccb98003bccadbbf240',
  'airport-mapping-supplement.csv': 'ed5a21adfba490523db789ed0e2fde1c6c7ee76fa74aa4014697d4034ada6fb4',
  'flagged-source-rows.csv': '8e566f6e07b82214cdd2e919e8abfcd6413b9acb9c38a96ce943012f3340a86d',
  'identity-ledger.csv': '8b8669af1255214ab603c7bc78245369a7dc652d39c9b9ba015e6eebd49a84e2',
  'integration-candidate-snapshot.json': '9edf712870d8003dfb9e58efbb02e4a02dbfbfceb490b8b79ef4e84a3ca3bea1',
  'packet-baseline-flagged-source-rows.csv': '0c45b2a26d2a881ba8c24731d140740e2c328acc17c6b75dac80bb826d6e2c04',
  'station-mapping-review.csv': '2c5f2e6c0747cdad17a84915fc358e67c74d55138ec0524df82eb67c16afa0a7',
  'validation-summary.json': '6e8193a68692a87036555d45fb5b7bfe222d695bdbb51734b267b4a26c15a32b',
};
const AIRINDIA_ARTIFACT_HASHES: Record<string, string> = {
  'README.md': '0414471eab9fc13466e4379b6b93dcbe090dd235a3110ffcea17f233671abe4b',
  'schedule-identity-ledger.csv': 'ad5e16cf427953531097f649c5642bd2a361ab46fe2cba5e0955b7794d3738e6',
  'movement-lineage.csv': '41732e1ec2eee4048324fa0b09819cde53cc9e7aca36851fd531c373a8268123',
  'integration-snapshot.json': '5655533f15459917af220661deb438e11e47b172d6243c4993987d1c2dbcca77',
};

const SnapshotRecordSchema = z.object({
  id: z.string(),
  identityRecordSha256: z.string().regex(/^[0-9a-f]{64}$/),
  candidateKey: z.string().nullable(),
  evidenceStatus: z.enum(['accepted_identity_only', 'held', 'expired']),
  evidenceReason: z.string(),
  actualOperationVerified: z.literal(false),
  publishedDesignatorRaw: z.string(),
  publishedDesignatorKey: z.string(),
  publishedDesignatorPrefixRaw: z.string(),
  sourceOperatorCodeRaw: z.string(),
  sourceOperatorNameRaw: z.string(),
  originIata: z.string().nullable(),
  destinationIata: z.string().nullable(),
  stationCodeResolution: z.string(),
  stationLabelsRaw: z.array(z.string()),
  frequencyRaw: z.string(),
  frequencyQualification: z.string(),
  frequencyWeekdaysCorroborated: z.array(z.string()),
  departureClockValuesRaw: z.array(z.string()),
  arrivalClockValuesRaw: z.array(z.string()),
  timezone: z.null(),
  timezoneQualification: z.string(),
  timeFieldUseStatus: z.string(),
  selectableOperatingService: z.literal(false),
  scheduleVariantConflictIds: z.array(z.string()),
  scheduleVariantTimeConflict: z.boolean(),
  sourceMovementSide: z.enum(['arrival', 'departure']),
  sourceRowSides: z.array(z.enum(['arrival', 'departure'])),
  sourceRows: z.array(z.object({
    lineage: z.string(), page: z.number().int().positive(), printedRow: z.string(),
    sourceRowSha256: z.string().regex(/^[0-9a-f]{64}$/), sourceSide: z.enum(['arrival', 'departure']),
    stationSection: z.string(),
  }).strict()).min(1),
  validity: z.object({
    fromIso: z.string(), fromRaw: z.string(), untilIso: z.string(), untilRaw: z.string(),
    'statusAsOf2026-10-07': z.enum(['current-or-future', 'expired']),
  }).strict(),
}).passthrough();

const IndigoSnapshotSchema = z.object({
  asOfDate: z.literal('2026-10-07'),
  classificationCounts: z.object({
    acceptedCurrentFutureNewIdentityKeys: z.number().int(),
    acceptedIdentityOnlyVariants: z.number().int(),
    directedScheduleVariants: z.number().int(),
    expiredVariants: z.number().int(),
    heldVariants: z.number().int(),
    uniqueCompleteCandidateFlightDirectionKeys: z.number().int(),
  }).passthrough(),
  conflictReview: z.object({
    aircraft_variant_pairs: z.number().int(), arrival_time_pairs: z.number().int(),
    departure_time_pairs: z.number().int(), pairs: z.number().int(), candidate_keys: z.number().int(),
    allFlaggedSourceRows: z.number().int(),
  }).passthrough(),
  format: z.literal('gcmp-evidence-only-schedule-identities-v1'),
  records: z.array(SnapshotRecordSchema),
  semantics: z.object({
    actualOperation: z.string(), direction: z.string(), flightNumber: z.string(), frequency: z.string(),
    operatorCode: z.string(), time: z.string(), validity: z.string(), weekdayAnnotationSource: z.object({
      qualification: z.string(), url: z.string(),
    }).passthrough(),
  }).passthrough(),
  source: z.object({
    attribution: z.string(), operatorNamePrinted: z.string(), publishedDateRaw: z.string(),
    reproductionBasis: z.object({ policyUrl: z.string(), terms: z.string(), openDataLicenseClaimed: z.literal(false) }).passthrough(),
    seasonValidityRaw: z.string(), sourcePdf: z.object({
      bytes: z.number().int().positive(), filename: z.string(), pages: z.number().int().positive(),
      sha256: z.string().regex(/^[0-9a-f]{64}$/), url: z.string().url(),
    }).strict(), title: z.string(),
  }).passthrough(),
}).passthrough();

const AirIndiaSnapshotSchema = z.object({
  artifact: z.string(),
  format_version: z.number().int(),
  audit_date: z.literal('2026-10-07'),
  source: z.object({
    organization: z.string(), document_title: z.string(), operator_heading: z.string(), operator_code_raw: z.string(),
    carrier_iata: z.literal('AI'), pdf_url: z.string().url(), pdf_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    pdf_bytes: z.number().int().positive(), pdf_pages: z.number().int().positive(), printed_published_date: z.string(),
  }).passthrough(),
  reproduction_and_counts: z.object({
    source_rows: z.number().int(), movement_records: z.number().int(), schedule_identity_variants: z.number().int(),
    source_rows_by_temporal_status: z.object({ current: z.number().int(), expired: z.number().int(), future: z.number().int() }),
    identity_variants_by_temporal_status: z.object({ current: z.number().int(), expired: z.number().int(), future: z.number().int() }),
    current_future_schedule_variants: z.number().int(), current_future_distinct_carrier_route_designator_identities: z.number().int(),
    current_future_distinct_directed_routes: z.number().int(), baseline_designator_match_counts: z.object({
      candidate_exact_designator: z.number().int(), confirmed_exact_designator: z.number().int(), existing_route_unlisted_designator: z.number().int(),
    }), baseline_schedule_variant_match_counts: z.object({
      candidate_exact_designator: z.number().int(), confirmed_exact_designator: z.number().int(), existing_route_unlisted_designator: z.number().int(),
    }),
    aircraft_field_hold_count: z.number().int(), one_sided_schedule_identity_count: z.number().int(),
    unique_full_movement_lineage_keys: z.number().int(), repeated_printed_serial_groups_within_page: z.number().int(),
  }).passthrough(),
  rights_review: z.object({ policy_url: z.string().url(), policy_result: z.string(), packet_visual_review: z.string(), license_claim: z.string() }).passthrough(),
  input_hashes: z.object({ source_pdf_sha256: z.string().regex(/^[0-9a-f]{64}$/), pinned_runtime_current_sha256: z.string().regex(/^[0-9a-f]{64}$/), carrier_code_mapping_file_sha256: z.string().regex(/^[0-9a-f]{64}$/) }).passthrough(),
}).passthrough();

const AirIndiaLedgerRowSchema = z.object({
  identity_id: z.string(), carrier_iata: z.literal('AI'), operator_code_raw: z.literal('AIC'),
  origin_iata: z.string().regex(/^[A-Z]{3}$/), destination_iata: z.string().regex(/^[A-Z]{3}$/),
  flight_designator_raw: z.string(), flight_designator_normalized: z.string().regex(/^AI\d{1,4}[A-Z]?$/),
  raw_frequency: z.string(), weekday_interpretation_corroborated: z.string(), effective_from: z.string(), effective_until: z.string(),
  temporal_status_as_of_2026_10_07: z.enum(['current', 'future', 'expired']),
  ledger_disposition: z.enum(['accepted', 'held_field_only', 'expired']),
  baseline_match_class: z.string(), field_hold_scope: z.string(), field_hold_reasons: z.string(), aircraft_types_raw: z.string(),
  frequency_interpretation_status: z.string(), clock_basis_status: z.string(), service_classification_status: z.string(), actual_operation_status: z.string(),
  counterpart_coverage: z.string(), source_row_refs: z.string(), source_movement_refs: z.string(), source_pdf_sha256: z.string().regex(/^[0-9a-f]{64}$/),
}).passthrough();

const AirIndiaMovementRowSchema = z.object({
  source_row_address: z.string(), source_pdf_sha256: z.string().regex(/^[0-9a-f]{64}$/), pdf_page: z.string(),
  physical_row_on_page: z.string(), station_section_ordinal_on_page: z.string(), station_section_raw: z.string(), printed_row_no: z.string(),
  movement_id: z.string(), movement_side: z.enum(['arrival', 'departure']), origin_iata: z.string(), destination_iata: z.string(),
  raw_clock: z.string(), identity_id: z.string(),
}).passthrough();

interface CsvRecord { [key: string]: string }
interface IndigoConflict { readonly kinds: Set<string>; readonly fields: Set<'frequency' | 'departureClock' | 'arrivalClock' | 'aircraftType' | 'rawClock'> }

function readJson(path: string): unknown { return JSON.parse(readFileSync(path, 'utf8')) as unknown; }
function sha256(path: string): string { return createHash('sha256').update(readFileSync(path)).digest('hex'); }
const AIRPORT_CATALOG_CODES = new Set(parseAirportCatalog(readJson(join(ROOT, 'public/data/airports.json'))).map(airport => airport.iata));

function indigoPhysicalRow(sourceRow: { lineage: string; page: number; printedRow: string; sourceRowSha256: string; stationSection: string }): number {
  const match = /^p(\d+)\/line(\d+)\/station=([^/]*)\/row=([^/]*)\/sha256=([0-9a-f]{12})$/.exec(sourceRow.lineage);
  if (!match || Number(match[1]) !== sourceRow.page || match[3] !== sourceRow.stationSection
    || match[4] !== sourceRow.printedRow || !sourceRow.sourceRowSha256.startsWith(match[5]!)) {
    throw new Error(`IndiGo corrected page/physical-row/station/printed-row/hash lineage is inconsistent: ${sourceRow.lineage}`);
  }
  return Number(match[2]);
}

function verifyChecksumPacket(packetDir: string, manifestName: string, expectedManifestHash?: string, pinnedArtifacts?: Record<string, string>): void {
  const manifestPath = join(packetDir, manifestName);
  if (expectedManifestHash && sha256(manifestPath) !== expectedManifestHash) throw new Error(`Packet manifest hash mismatch: ${manifestName}`);
  const lines = readFileSync(manifestPath, 'utf8').trim().split(/\r?\n/);
  const checksums = lines.map(line => {
    const match = /^([0-9a-f]{64})\s+([A-Za-z0-9._-]+)$/.exec(line);
    if (!match) throw new Error(`Malformed packet checksum line: ${line}`);
    return { hash: match[1]!, filename: match[2]! };
  });
  if (pinnedArtifacts) {
    if (checksums.length !== Object.keys(pinnedArtifacts).length) throw new Error('Packet checksum manifest has an unexpected artifact count');
    for (const [filename, expected] of Object.entries(pinnedArtifacts)) {
      const row = checksums.find(item => item.filename === filename);
      if (!row || row.hash !== expected || sha256(join(packetDir, filename)) !== expected) throw new Error(`Pinned packet artifact mismatch: ${filename}`);
    }
  } else {
    for (const item of checksums) if (sha256(join(packetDir, item.filename)) !== item.hash) throw new Error(`Packet artifact hash mismatch: ${item.filename}`);
  }
}

function parseCsv(text: string): CsvRecord[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(value); value = ''; }
    else if (char === '\n') { row.push(value.replace(/\r$/, '')); rows.push(row); row = []; value = ''; }
    else value += char;
  }
  if (value !== '' || row.length > 0) { row.push(value.replace(/\r$/, '')); rows.push(row); }
  const [headers, ...records] = rows;
  if (!headers?.length) throw new Error('Conflict CSV has no header row');
  return records.filter(record => record.length === headers.length).map(record => Object.fromEntries(headers.map((header, index) => [header!, record[index]!]))) as CsvRecord[];
}

function jsonArrayField(record: CsvRecord, field: string): string[] {
  const parsed: unknown = JSON.parse(record[field] ?? '[]');
  if (!Array.isArray(parsed) || parsed.some(value => typeof value !== 'string')) throw new Error(`Malformed ${field} in reviewed conflict CSV`);
  return parsed as string[];
}

function indigoConflictIndex(packetDir: string): Map<string, IndigoConflict> {
  const records = parseCsv(readFileSync(join(packetDir, 'flagged-source-rows.csv'), 'utf8'));
  const conflicts = new Map<string, IndigoConflict>();
  for (const record of records) {
    for (const id of jsonArrayField(record, 'conflict_ids')) {
      const conflict = conflicts.get(id) ?? { kinds: new Set<string>(), fields: new Set<'frequency' | 'departureClock' | 'arrivalClock' | 'aircraftType' | 'rawClock'>() };
      for (const kind of jsonArrayField(record, 'flag_types')) conflict.kinds.add(kind);
      if (record.frequency_raw) conflict.fields.add('frequency');
      if (record.departure_time_raw) conflict.fields.add('departureClock');
      if (record.arrival_time_raw) conflict.fields.add('arrivalClock');
      if (record.aircraft_type_raw) conflict.fields.add('aircraftType');
      conflicts.set(id, conflict);
    }
  }
  return conflicts;
}

function mapSpiceJet(source: z.infer<typeof SpiceJetScheduleReferenceCatalogSchema>['source'],
  counts: z.infer<typeof SpiceJetScheduleReferenceCatalogSchema>['counts'],
  references: z.infer<typeof SpiceJetScheduleReferenceCatalogSchema>['references']): z.infer<typeof DgcaScheduleEvidenceCatalogSchema>['sources'][number] {
  const packetManifest = readJson(join(SPICEJET_PACKET, 'manifest.json')) as {
    counts: { source_rows: number; directional_assertions: number; unique_flight_number_direction_keys: number; distinct_route_endpoint_codes: number };
  };
  return {
    id: 'dgca-spicejet-ss-2026',
    title: source.title,
    url: source.url,
    pdfSha256: source.sha256,
    pdfBytes: source.bytes,
    pages: source.pages,
    publishedDateRaw: source.publishedOn,
    checkedAt: source.checkedAt,
    reviewBy: source.reviewBy,
    reviewedSnapshotDate: '2026-10-07',
    attribution: source.attribution,
    reusePolicyUrl: source.reusePolicyUrl,
    reusePolicyStatement: source.reusePolicyStatement,
    operator: {
      printedNameRaw: 'Spice Jet', operatorCodeRaw: 'SEJ', carrierIdentityStatus: 'independently-mapped',
      carrierName: 'SpiceJet Limited', iataDesignator: 'SG', icaoCode: 'SEJ',
      identitySourceUrl: 'https://www.iata.org/en/about/members/airline-list/spicejet/532/',
      qualification: 'The DGCA source names Spice Jet and prints operator code SEJ; IATA independently maps SG/SEJ to SpiceJet Limited. This identifies source attribution, not actual operation.',
    },
    counts: {
      currentReferences: counts.currentReferences,
      currentVariants: counts.currentVariants,
      excludedExpiredVariants: counts.expiredVariantsExcluded,
      excludedHeldVariants: 0,
      excludedExpiredOnlyIdentityKeys: counts.expiredOnlyIdentityKeysExcluded,
      overlapPairs: counts.overlappingMetadataVariantPairs,
      conflictingCoreIdentityPairs: counts.conflictingCoreIdentityPairs,
      conflictVariants: counts.currentVariantsWithMetadataConflict,
    },
    sourceSpecificCounts: {
      sourceRows: packetManifest.counts.source_rows,
      directionalAssertions: packetManifest.counts.directional_assertions,
      allIdentityKeys: packetManifest.counts.unique_flight_number_direction_keys,
      endpointCodes: packetManifest.counts.distinct_route_endpoint_codes,
      overlapClaimsFlagged: counts.overlappingClaimsFlagged,
      currentIdentityKeysWithCounterparts: counts.currentIdentityKeysWithCounterparts,
      currentIdentityKeysWithoutCounterparts: counts.currentIdentityKeysWithoutCounterparts,
      sourceDesignatorsWithOtherDirectionalRoutes: counts.sourceDesignatorsWithOtherDirectionalRoutes,
    },
    references: references.map(reference => ({
      id: reference.id,
      publishedDesignatorRaw: reference.publishedDesignatorRaw,
      designatorKey: reference.designator,
      designatorPrefixRaw: 'SG',
      flightDigitsRaw: reference.flightNumber,
      originIata: reference.from,
      destinationIata: reference.to,
      identityStatus: 'accepted-identity-only',
      airportCatalogStatus: AIRPORT_CATALOG_CODES.has(reference.from) && AIRPORT_CATALOG_CODES.has(reference.to) ? 'all-endpoints-present' : 'source-code-not-in-current-catalog',
      otherDirectionalRoutes: reference.otherDirectionalRoutes,
      sourceCounterpartStatus: reference.hasCurrentSourceCounterpart ? 'paired' : 'one-sided',
      hasVariantConflict: reference.overlappingMetadataVariant,
      conflictReferences: [...new Set(reference.variants.flatMap(variant => variant.metadataConflictPeerClaimIds))].sort(),
      variants: reference.variants.map(variant => ({
        id: variant.claimId,
        effectiveFrom: variant.effectiveFrom,
        effectiveUntil: variant.effectiveUntil,
        effectiveFromRaw: variant.effectiveFrom,
        effectiveUntilRaw: variant.effectiveUntil,
        frequencyRaw: variant.frequencyRaw,
        frequencyQualification: 'DGCA does not define a weekday legend; retain the printed frequency only.',
        frequencyWeekdaysCorroborated: [],
        departureClockValuesRaw: [variant.departureTimeRaw],
        arrivalClockValuesRaw: [variant.arrivalTimeRaw],
        aircraftTypeValuesRaw: [variant.aircraftTypeRaw],
        timeBasis: 'unknown',
        timezone: null,
        sourceRows: variant.pageRowRefs.map((referenceRaw, index) => {
          const match = /^p(\d{2}):([^:]+):r(\d+)$/.exec(referenceRaw);
          if (!match) throw new Error(`Malformed accepted SpiceJet source row reference: ${referenceRaw}`);
          return {
            referenceRaw,
            page: Number(match[1]),
            physicalRow: null,
            stationSectionOrdinal: null,
            stationSectionRaw: match[2]!,
            printedRowRaw: variant.sourceSerials[index] ?? match[3]!,
            sourceSide: null,
            sourceRowSha256: null,
          };
        }),
        stationCodeResolution: 'airport codes independently cross-checked against airport catalog',
        stationLabelsRaw: [],
        sourceMovementSides: variant.counterpartStatus === 'paired' ? ['arrival', 'departure'] : [],
        sourceCounterpartStatus: variant.counterpartStatus,
        conflictIds: variant.metadataConflictPeerClaimIds,
        conflictKinds: variant.overlappingMetadataVariant ? ['overlapping-metadata-variant'] : [],
        conflictFields: variant.metadataDifferenceFields.map(field => ({
          frequency_raw: 'frequency', departure_time_raw: 'departureClock', arrival_time_raw: 'arrivalClock', aircraft_type_raw: 'aircraftType',
        }[field] as 'frequency' | 'departureClock' | 'arrivalClock' | 'aircraftType')).filter(Boolean),
        hasVariantConflict: variant.overlappingMetadataVariant,
        timeConflict: variant.metadataDifferenceFields.includes('arrival_time_raw') || variant.metadataDifferenceFields.includes('departure_time_raw'),
        notes: ['Source-side row pairing is identity evidence only; actual operation is not established.'],
      })),
    })),
  };
}

function mapIndiGo(snapshot: z.infer<typeof IndigoSnapshotSchema>, conflicts: Map<string, IndigoConflict>,
  ledgerById: Map<string, CsvRecord>, validation: { acceptedOrderedRoutePairContextOverlaps: number; allValidityOrderedRoutePairContextOverlaps: number }): z.infer<typeof DgcaScheduleEvidenceCatalogSchema>['sources'][number] {
  const manifest = snapshot.source;
  const accepted = snapshot.records.filter(record => record.evidenceStatus === 'accepted_identity_only'
    && record.validity['statusAsOf2026-10-07'] === 'current-or-future');
  const grouped = new Map<string, typeof accepted>();
  for (const record of accepted) {
    if (!record.candidateKey || !record.originIata || !record.destinationIata) throw new Error(`Accepted IndiGo identity lacks resolved endpoints: ${record.id}`);
    const group = grouped.get(record.candidateKey) ?? [];
    group.push(record);
    grouped.set(record.candidateKey, group);
  }
  if (accepted.length !== 3729 || grouped.size !== 2218 || accepted.length !== snapshot.classificationCounts.acceptedIdentityOnlyVariants
    || grouped.size !== snapshot.classificationCounts.acceptedCurrentFutureNewIdentityKeys
    || snapshot.classificationCounts.directedScheduleVariants !== 5110 || snapshot.classificationCounts.heldVariants !== 0
    || snapshot.classificationCounts.expiredVariants !== 1381 || snapshot.records.length !== 5110) {
    throw new Error('IndiGo accepted identity-only counts do not match the reviewed snapshot');
  }

  const references = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([candidateKey, variants]) => {
    const first = variants[0]!;
    const parts = /^([A-Z0-9]{2})(\d{1,4}[A-Z]?)\|([A-Z]{3})>([A-Z]{3})$/.exec(candidateKey);
    if (!parts) throw new Error(`Malformed accepted IndiGo candidate identity: ${candidateKey}`);
    const conflictReferences = [...new Set(variants.flatMap(record => record.scheduleVariantConflictIds))].sort();
    const normalizedVariants = variants.map(record => {
      const sourceLedgerRecord = ledgerById.get(record.id);
      if (!sourceLedgerRecord || sourceLedgerRecord.identity_record_sha256 !== record.identityRecordSha256) {
        throw new Error(`IndiGo accepted identity has no matching reviewed ledger row: ${record.id}`);
      }
      const sides = [...new Set(record.sourceRows.map(sourceRow => sourceRow.sourceSide))].sort();
      const conflictRows = record.scheduleVariantConflictIds.map(id => conflicts.get(id)).filter((item): item is IndigoConflict => Boolean(item));
      const conflictKinds = [...new Set(conflictRows.flatMap(item => [...item.kinds]))].sort();
      const conflictFields = [...new Set(conflictRows.flatMap(item => [...item.fields]))].sort();
      if (record.scheduleVariantConflictIds.length > 0 && conflictRows.length === 0) throw new Error(`Conflict flags lack reviewed CSV lineage: ${record.id}`);
      return {
        id: record.id,
        effectiveFrom: record.validity.fromIso,
        effectiveUntil: record.validity.untilIso,
        effectiveFromRaw: record.validity.fromRaw,
        effectiveUntilRaw: record.validity.untilRaw,
        frequencyRaw: record.frequencyRaw,
        frequencyQualification: record.frequencyQualification,
        frequencyWeekdaysCorroborated: record.frequencyWeekdaysCorroborated,
        departureClockValuesRaw: record.departureClockValuesRaw,
        arrivalClockValuesRaw: record.arrivalClockValuesRaw,
        aircraftTypeValuesRaw: [sourceLedgerRecord.aircraft_type_raw ?? ''],
        timeBasis: 'unknown' as const,
        timezone: null,
        sourceRows: record.sourceRows.map(sourceRow => ({
          referenceRaw: sourceRow.lineage,
          page: sourceRow.page,
          physicalRow: indigoPhysicalRow(sourceRow),
          stationSectionOrdinal: null,
          stationSectionRaw: sourceRow.stationSection,
          printedRowRaw: sourceRow.printedRow,
          sourceSide: sourceRow.sourceSide,
          sourceRowSha256: sourceRow.sourceRowSha256,
        })),
        stationCodeResolution: record.stationCodeResolution,
        stationLabelsRaw: record.stationLabelsRaw,
        sourceMovementSides: sides,
        sourceCounterpartStatus: sides.includes('arrival') && sides.includes('departure') ? 'paired' as const : 'one-sided' as const,
        conflictIds: record.scheduleVariantConflictIds,
        conflictKinds,
        conflictFields,
        hasVariantConflict: record.scheduleVariantConflictIds.length > 0 || conflictFields.length > 0,
        timeConflict: record.scheduleVariantTimeConflict,
        notes: [record.evidenceReason, record.operatorRoleQualification, record.frequencyQualification, record.timezoneQualification,
          ...(!AIRPORT_CATALOG_CODES.has(record.originIata!) || !AIRPORT_CATALOG_CODES.has(record.destinationIata!)
            ? ['At least one DGCA source-mapped endpoint is not present in the current GCMP airport catalog; this reference is not a routable service.'] : [])],
      };
    }).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.effectiveUntil.localeCompare(b.effectiveUntil) || a.id.localeCompare(b.id));
    const sourceSides = new Set(normalizedVariants.flatMap(variant => variant.sourceMovementSides));
    return {
      id: `dgca-indigo-${candidateKey.replace('|', '-').replace('>', '-')}`.toLowerCase(),
      publishedDesignatorRaw: first.publishedDesignatorRaw,
      designatorKey: first.publishedDesignatorKey,
      designatorPrefixRaw: first.publishedDesignatorPrefixRaw,
      flightDigitsRaw: parts[2]!,
      originIata: first.originIata!,
      destinationIata: first.destinationIata!,
      identityStatus: 'accepted-identity-only',
      airportCatalogStatus: AIRPORT_CATALOG_CODES.has(first.originIata!) && AIRPORT_CATALOG_CODES.has(first.destinationIata!) ? 'all-endpoints-present' : 'source-code-not-in-current-catalog',
      otherDirectionalRoutes: [],
      sourceCounterpartStatus: sourceSides.has('arrival') && sourceSides.has('departure') ? 'paired' : 'one-sided',
      hasVariantConflict: normalizedVariants.some(variant => variant.hasVariantConflict),
      conflictReferences,
      variants: normalizedVariants,
    };
  });

  const conflictVariantCount = accepted.filter(record => record.scheduleVariantConflictIds.length > 0 || record.scheduleVariantTimeConflict).length;
  const rights = manifest.reproductionBasis;
  return {
    id: 'dgca-indigo-domestic-ss-2026',
    title: manifest.title,
    url: manifest.sourcePdf.url,
    pdfSha256: manifest.sourcePdf.sha256,
    pdfBytes: manifest.sourcePdf.bytes,
    pages: manifest.sourcePdf.pages,
    publishedDateRaw: manifest.publishedDateRaw,
    checkedAt: null,
    reviewBy: null,
    reviewedSnapshotDate: snapshot.asOfDate,
    attribution: manifest.attribution,
    reusePolicyUrl: rights.policyUrl,
    reusePolicyStatement: `${rights.terms} No open-data-license or public-domain claim is made.`,
    operator: {
      printedNameRaw: manifest.operatorNamePrinted,
      operatorCodeRaw: 'IGO',
      carrierIdentityStatus: 'unresolved',
      carrierName: null,
      iataDesignator: null,
      icaoCode: null,
      identitySourceUrl: null,
      qualification: 'DGCA prints the 6E designator and IGO operator code in separate fields. No equivalence or marketed/operating carrier role is inferred.',
    },
    counts: {
      currentReferences: references.length,
      currentVariants: accepted.length,
      excludedExpiredVariants: snapshot.classificationCounts.expiredVariants,
      excludedHeldVariants: snapshot.classificationCounts.heldVariants,
      excludedExpiredOnlyIdentityKeys: 79,
      overlapPairs: snapshot.conflictReview.pairs,
      conflictingCoreIdentityPairs: 0,
      conflictVariants: conflictVariantCount,
    },
    sourceSpecificCounts: {
      directedScheduleVariants: snapshot.classificationCounts.directedScheduleVariants,
      acceptedCurrentFutureNewIdentityKeys: snapshot.classificationCounts.acceptedCurrentFutureNewIdentityKeys,
      acceptedOrderedRoutePairContextOverlaps: validation.acceptedOrderedRoutePairContextOverlaps,
      allValidityOrderedRoutePairContextOverlaps: validation.allValidityOrderedRoutePairContextOverlaps,
      scheduleConflictPairs: snapshot.conflictReview.pairs,
      aircraftVariantPairs: snapshot.conflictReview.aircraft_variant_pairs,
      arrivalTimePairs: snapshot.conflictReview.arrival_time_pairs,
      departureTimePairs: snapshot.conflictReview.departure_time_pairs,
      conflictCandidateKeys: snapshot.conflictReview.candidate_keys,
      flaggedSourceRows: snapshot.conflictReview.allFlaggedSourceRows,
      exactRuntimeFlightNumberDirectionMatches: 0,
      unresolvedHeldStationVariants: snapshot.classificationCounts.heldVariants,
      excludedExpiredVariants: snapshot.classificationCounts.expiredVariants,
      expiredOnlyIdentityKeys: 79,
    },
    references,
  };
}

function mapAirIndia(): z.infer<typeof DgcaScheduleEvidenceCatalogSchema>['sources'][number] {
  const snapshot = AirIndiaSnapshotSchema.parse(readJson(join(AIRINDIA_PACKET, 'integration-snapshot.json')));
  const sourceHash = snapshot.source.pdf_sha256;
  const ledgerRows = parseCsv(readFileSync(join(AIRINDIA_PACKET, 'schedule-identity-ledger.csv'), 'utf8'))
    .map(row => AirIndiaLedgerRowSchema.parse(row));
  const movements = parseCsv(readFileSync(join(AIRINDIA_PACKET, 'movement-lineage.csv'), 'utf8'))
    .map(row => AirIndiaMovementRowSchema.parse(row));
  const movementById = new Map<string, z.infer<typeof AirIndiaMovementRowSchema>>();
  for (const movement of movements) {
    if (movementById.has(movement.movement_id)) throw new Error(`Duplicate Air India movement lineage: ${movement.movement_id}`);
    movementById.set(movement.movement_id, movement);
    if (movement.source_pdf_sha256 !== sourceHash) throw new Error(`Air India movement source hash mismatch: ${movement.movement_id}`);
  }
  if (ledgerRows.length !== 1115 || movements.length !== 1537 || movementById.size !== snapshot.reproduction_and_counts.unique_full_movement_lineage_keys
    || snapshot.source.pdf_sha256 !== '107983dc72d381e6897a5a333556946adcc98daef82e954d52cec1fc402c3086'
    || snapshot.input_hashes.pinned_runtime_current_sha256 !== 'aa90283d52015b1b418c3840252cb34152f9ed577a3e0766291935b92b151537') {
    throw new Error('Air India source or baseline lineage counts differ from the accepted snapshot');
  }
  const currentFuture = ledgerRows.filter(row => ['current', 'future'].includes(row.temporal_status_as_of_2026_10_07)
    && ['accepted', 'held_field_only'].includes(row.ledger_disposition));
  const expired = ledgerRows.filter(row => row.temporal_status_as_of_2026_10_07 === 'expired' || row.ledger_disposition === 'expired');
  if (currentFuture.length !== 865 || expired.length !== 250
    || currentFuture.filter(row => row.ledger_disposition === 'held_field_only').length !== 7
    || currentFuture.filter(row => row.ledger_disposition === 'accepted').length !== 858) {
    throw new Error('Air India accepted/current/expired/field-hold counts changed');
  }
  const grouped = new Map<string, typeof currentFuture>();
  for (const row of currentFuture) {
    const key = `${row.flight_designator_normalized}|${row.origin_iata}|${row.destination_iata}`;
    const group = grouped.get(key) ?? [];
    group.push(row);
    grouped.set(key, group);
  }
  if (grouped.size !== 573 || grouped.size !== snapshot.reproduction_and_counts.current_future_distinct_carrier_route_designator_identities) {
    throw new Error('Air India active identity count differs from the independent review');
  }

  const references = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, identityRows]) => {
    const first = identityRows[0]!;
    const designatorKey = first.flight_designator_normalized;
    const flightDigitsRaw = designatorKey.slice(2);
    const variants = identityRows.map(row => {
      const movementIds = row.source_movement_refs.split(';').filter(Boolean);
      if (movementIds.length === 0) throw new Error(`Air India identity variant has no movement lineage: ${row.identity_id}`);
      const sourceRows = movementIds.map(movementId => {
        const movement = movementById.get(movementId);
        if (!movement || movement.identity_id !== row.identity_id) throw new Error(`Air India movement/identity linkage mismatch: ${movementId}`);
        if (movement.flight_designator_raw.replace(/\s+/g, '') !== designatorKey
          || movement.origin_iata !== row.origin_iata || movement.destination_iata !== row.destination_iata
          || movement.operator_code_raw !== 'AIC' || movement.carrier_iata !== 'AI') {
          throw new Error(`Air India movement identity fields differ from its ledger: ${movementId}`);
        }
        return {
          referenceRaw: movement.source_row_address,
          page: Number(movement.pdf_page),
          physicalRow: Number(movement.physical_row_on_page),
          stationSectionOrdinal: Number(movement.station_section_ordinal_on_page),
          stationSectionRaw: movement.station_section_raw,
          printedRowRaw: movement.printed_row_no,
          sourceSide: movement.movement_side,
          sourceRowSha256: null,
        };
      }).sort((a, b) => a.page - b.page || (a.physicalRow ?? 0) - (b.physicalRow ?? 0));
      const sourceSides = [...new Set(sourceRows.map(sourceRow => sourceRow.sourceSide).filter((side): side is 'arrival' | 'departure' => side !== null))].sort();
      const aircraftValues = [...new Set(row.aircraft_types_raw.split(';').filter(Boolean))];
      const fieldHeld = row.ledger_disposition === 'held_field_only' || row.field_hold_reasons !== '';
      const departureClocks = sourceRows.filter(sourceRow => sourceRow.sourceSide === 'departure').map(sourceRow => {
        const movement = movementById.get(movementIds.find(id => movementById.get(id)?.source_row_address === sourceRow.referenceRaw) ?? '')!;
        return movement.raw_clock;
      });
      const arrivalClocks = sourceRows.filter(sourceRow => sourceRow.sourceSide === 'arrival').map(sourceRow => {
        const movement = movementById.get(movementIds.find(id => movementById.get(id)?.source_row_address === sourceRow.referenceRaw) ?? '')!;
        return movement.raw_clock;
      });
      return {
        id: row.identity_id,
        effectiveFrom: row.effective_from,
        effectiveUntil: row.effective_until,
        effectiveFromRaw: row.effective_from,
        effectiveUntilRaw: row.effective_until,
        frequencyRaw: row.raw_frequency,
        frequencyQualification: row.frequency_interpretation_status,
        frequencyWeekdaysCorroborated: row.weekday_interpretation_corroborated.split(';').filter(Boolean),
        departureClockValuesRaw: departureClocks,
        arrivalClockValuesRaw: arrivalClocks,
        aircraftTypeValuesRaw: aircraftValues,
        timeBasis: 'unknown' as const,
        timezone: null,
        sourceRows,
        stationCodeResolution: 'reviewed station-to-airport mapping; full station-section lineage retained',
        stationLabelsRaw: [...new Set(sourceRows.map(sourceRow => sourceRow.stationSectionRaw).filter(Boolean))],
        sourceMovementSides: sourceSides,
        sourceCounterpartStatus: sourceSides.includes('arrival') && sourceSides.includes('departure') ? 'paired' as const : 'one-sided' as const,
        conflictIds: fieldHeld ? [row.identity_id] : [],
        conflictKinds: fieldHeld ? ['aircraft-field-hold'] : [],
        conflictFields: fieldHeld ? ['aircraftType' as const] : [],
        hasVariantConflict: fieldHeld,
        timeConflict: false,
        notes: [
          row.clock_basis_status,
          row.service_classification_status,
          row.actual_operation_status,
          ...(row.field_hold_reasons ? [`Field-only hold: ${row.field_hold_reasons}; route/designator identity remains accepted.`] : []),
          `Baseline comparison: ${row.baseline_match_class}.`,
          `Printed source row refs: ${row.source_row_refs}.`,
          `Movement lineage IDs: ${row.source_movement_refs}.`,
        ],
      };
    }).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.effectiveUntil.localeCompare(b.effectiveUntil) || a.id.localeCompare(b.id));
    const heldIds = identityRows.filter(row => row.ledger_disposition === 'held_field_only').map(row => row.identity_id).sort();
    const sourceSides = new Set(variants.flatMap(variant => variant.sourceMovementSides));
    return {
      id: `dgca-airindia-${designatorKey.toLowerCase()}-${first.origin_iata.toLowerCase()}-${first.destination_iata.toLowerCase()}`,
      publishedDesignatorRaw: first.flight_designator_raw,
      designatorKey,
      designatorPrefixRaw: 'AI',
      flightDigitsRaw,
      originIata: first.origin_iata,
      destinationIata: first.destination_iata,
      identityStatus: 'accepted-identity-only',
      airportCatalogStatus: AIRPORT_CATALOG_CODES.has(first.origin_iata) && AIRPORT_CATALOG_CODES.has(first.destination_iata) ? 'all-endpoints-present' : 'source-code-not-in-current-catalog',
      otherDirectionalRoutes: [],
      sourceCounterpartStatus: sourceSides.has('arrival') && sourceSides.has('departure') ? 'paired' : 'one-sided',
      hasVariantConflict: variants.some(variant => variant.hasVariantConflict),
      conflictReferences: heldIds,
      variants,
    };
  });

  const sourceRowsResolved = new Set(references.flatMap(reference => reference.variants.flatMap(variant => variant.sourceRows.map(row => row.referenceRaw))));
  const expectedActiveMovementIds = new Set(currentFuture.flatMap(row => row.source_movement_refs.split(';').filter(Boolean)));
  if (sourceRowsResolved.size !== expectedActiveMovementIds.size
    || [...expectedActiveMovementIds].some(movementId => !movementById.has(movementId))) {
    throw new Error(`Air India active source movement lineage is incomplete or not unique (${sourceRowsResolved.size}/${expectedActiveMovementIds.size})`);
  }
  const counts = snapshot.reproduction_and_counts;
  const rights = snapshot.rights_review;
  return {
    id: 'dgca-air-india-domestic-ss-2026',
    title: `${snapshot.source.organization} ${snapshot.source.document_title} — ${snapshot.source.operator_heading}`,
    url: snapshot.source.pdf_url,
    pdfSha256: sourceHash,
    pdfBytes: snapshot.source.pdf_bytes,
    pages: snapshot.source.pdf_pages,
    publishedDateRaw: snapshot.source.printed_published_date,
    checkedAt: null,
    reviewBy: null,
    reviewedSnapshotDate: snapshot.audit_date,
    attribution: `Source: ${snapshot.source.organization}, ${snapshot.source.document_title}, ${snapshot.source.operator_heading}, published ${snapshot.source.printed_published_date}.`,
    reusePolicyUrl: rights.policy_url,
    reusePolicyStatement: `${rights.policy_result} ${rights.license_claim}`,
    operator: {
      printedNameRaw: snapshot.source.operator_heading,
      operatorCodeRaw: snapshot.source.operator_code_raw,
      carrierIdentityStatus: 'independently-mapped',
      carrierName: 'Air India Ltd.',
      iataDesignator: snapshot.source.carrier_iata,
      icaoCode: snapshot.source.operator_code_raw,
      identitySourceUrl: null,
      qualification: `Explicit repository code mapping AI:AIC was used; identity was not inferred from the flight-number prefix. Mapping-file SHA-256: ${snapshot.input_hashes.carrier_code_mapping_file_sha256}. This maps schedule attribution, not actual operation. Passenger/cargo class is not stated by the source.`,
    },
    counts: {
      currentReferences: references.length,
      currentVariants: currentFuture.length,
      excludedExpiredVariants: expired.length,
      excludedHeldVariants: 0,
      excludedExpiredOnlyIdentityKeys: null,
      overlapPairs: counts.aircraft_field_hold_count,
      conflictingCoreIdentityPairs: 0,
      conflictVariants: counts.aircraft_field_hold_count,
    },
    sourceSpecificCounts: {
      sourceRows: counts.source_rows,
      movementRecords: counts.movement_records,
      allScheduleIdentityVariants: counts.schedule_identity_variants,
      currentFutureScheduleVariants: counts.current_future_schedule_variants,
      baselineConfirmedDesignatorIdentities: counts.baseline_designator_match_counts.confirmed_exact_designator,
      baselineConfirmedVariants: counts.baseline_schedule_variant_match_counts.confirmed_exact_designator,
      baselineCandidateDesignatorIdentities: counts.baseline_designator_match_counts.candidate_exact_designator,
      baselineCandidateVariants: counts.baseline_schedule_variant_match_counts.candidate_exact_designator,
      unlistedExistingRouteDesignatorIdentities: counts.baseline_designator_match_counts.existing_route_unlisted_designator,
      unlistedExistingRouteVariants: counts.baseline_schedule_variant_match_counts.existing_route_unlisted_designator,
      aircraftFieldHoldIdentities: counts.aircraft_field_hold_count,
      oneSidedScheduleIdentities: counts.one_sided_schedule_identity_count,
      uniqueFullMovementLineageKeys: counts.unique_full_movement_lineage_keys,
      repeatedPrintedPageSerialGroups: counts.repeated_printed_serial_groups_within_page,
    },
    references,
  };
}

function build(): void {
  verifyChecksumPacket(SPICEJET_PACKET, 'SHA256SUMS.txt');
  verifyChecksumPacket(INDIGO_PACKET, 'manifest.sha256', INDIGO_MANIFEST_SHA256, INDIGO_ARTIFACT_HASHES);
  verifyChecksumPacket(AIRINDIA_PACKET, 'SHA256SUMS', AIRINDIA_MANIFEST_SHA256, AIRINDIA_ARTIFACT_HASHES);
  const spicejet = SpiceJetScheduleReferenceCatalogSchema.parse(readJson(SPICEJET_NORMALIZED));
  const snapshot = IndigoSnapshotSchema.parse(readJson(join(INDIGO_PACKET, 'integration-candidate-snapshot.json')));
  const indigoLedgerRows = parseCsv(readFileSync(join(INDIGO_PACKET, 'identity-ledger.csv'), 'utf8'));
  if (indigoLedgerRows.length !== snapshot.records.length) throw new Error('IndiGo snapshot and reviewed identity ledger record counts differ');
  const indigoLedgerById = new Map(indigoLedgerRows.map(row => [row.record_id ?? '', row]));
  if (indigoLedgerById.size !== indigoLedgerRows.length || indigoLedgerRows.some(row => !row.record_id)) {
    throw new Error('IndiGo reviewed identity ledger has missing or duplicate record IDs');
  }
  const validation = readJson(join(INDIGO_PACKET, 'validation-summary.json')) as {
    capturedSourcePdfSha256MatchesPinned: boolean; capturedSourcePdfBytes: number; pdfPages: number;
    acceptedOrderedRoutePairContextOverlaps: number; allValidityOrderedRoutePairContextOverlaps: number;
    acceptedIdentityOnlyVariants: number; heldVariants: number; expiredVariants: number;
    scheduleConflictPairs: number; scheduleConflictCounts: { aircraft_variant_pairs: number; arrival_time_pairs: number; departure_time_pairs: number };
    exactRuntimeFlightNumberDirectionMatches: number; runtimeSha256MatchesPinned: boolean; runtimeFlightValuesWith6EPrefix: number;
    runtimeCarrier6E: boolean; runtimeCarrierIGO: boolean;
  };
  if (snapshot.source.sourcePdf.sha256 !== '49202673b590051beef3873127cecf171bea73c67ac1962d0031ccbb109bcd85'
    || !validation.capturedSourcePdfSha256MatchesPinned || validation.capturedSourcePdfBytes !== snapshot.source.sourcePdf.bytes
    || validation.pdfPages !== snapshot.source.sourcePdf.pages || !validation.runtimeSha256MatchesPinned
    || validation.exactRuntimeFlightNumberDirectionMatches !== 0 || validation.runtimeFlightValuesWith6EPrefix !== 0
    || validation.runtimeCarrier6E || validation.runtimeCarrierIGO || validation.acceptedIdentityOnlyVariants !== 3729
    || validation.heldVariants !== 0 || validation.expiredVariants !== 1381 || validation.scheduleConflictPairs !== 365
    || validation.scheduleConflictCounts.aircraft_variant_pairs !== 364 || validation.scheduleConflictCounts.arrival_time_pairs !== 1
    || validation.scheduleConflictCounts.departure_time_pairs !== 0) {
    throw new Error('IndiGo validation summary or source/runtime pins differ from the accepted review');
  }
  const manifest = readJson(join(SPICEJET_PACKET, 'manifest.json')) as { snapshot_as_of_date: string };
  if (snapshot.asOfDate !== manifest.snapshot_as_of_date) throw new Error('DGCA source snapshots use different review dates');
  const conflictIndex = indigoConflictIndex(INDIGO_PACKET);
  if (sha256(join(ROOT, 'public/data/route-network/runtime-current.json')) !== RELEASE_BASE_RUNTIME_SHA256) {
    throw new Error('Accepted route runtime differs from the resolved Brazil release base; reconcile before building DGCA evidence');
  }
  const catalog = DgcaScheduleEvidenceCatalogSchema.parse({
    version: 1,
    kind: 'dgca-schedule-identity-evidence',
    snapshotAsOfDate: snapshot.asOfDate,
    semantics: {
      selectable: false,
      actualOperationEstablished: false,
      dateAvailability: 'unknown',
      sourceDateWindowSemantics: 'inclusive-calendar-date-identity-window-only',
      frequencyInterpretation: 'raw-only-unverified',
      timeBasis: 'unknown',
      utcOccurrencesGenerated: false,
      connectionTimingEstablished: false,
    },
    sources: [
      mapSpiceJet(spicejet.source, spicejet.counts, spicejet.references),
      mapIndiGo(snapshot, conflictIndex, indigoLedgerById, validation),
      mapAirIndia(),
    ],
  });
  writeFileSync(OUT, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`Wrote shared DGCA evidence catalog: ${catalog.sources.map(source => `${source.counts.currentReferences} identities / ${source.counts.currentVariants} variants`).join('; ')}`);
}

build();
