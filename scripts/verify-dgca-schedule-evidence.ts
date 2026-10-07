/** Cross-check the shared DGCA evidence catalog against the accepted source packets and protected release base. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseAirportCatalog } from '../src/lib/schemas/airports.ts';
import { DgcaScheduleEvidenceCatalogSchema } from '../src/lib/schemas/dgca-schedule-evidence.ts';

const ROOT = resolve(process.cwd());
const SPICEJET_PACKET = join(ROOT, 'docs/source-evidence/spicejet-ss-2026');
const INDIGO_PACKET = join(ROOT, 'docs/source-evidence/indigo-ss-2026');
const AIRINDIA_PACKET = join(ROOT, 'docs/source-evidence/airindia-dgca-2026');
const RELEASE_BASE_RUNTIME_SHA256 = '34c465081e6835721abf95bd6ca9e132f3afad6386977b4ca6ca797b528c37e9';
const EXPECTED_CHECKSUMS: Record<string, Record<string, string>> = {
  spicejet: {
    'identity_ledger.jsonl': '0ca771b458c7fbbdb4bb3c0230a755fa25fd59cb2a39da5688218efa107a18b9',
    'manifest.json': '1132f3573c4bb1579f815bdb60ffa46eebfe61116c7014b8026bb95935727e73',
    'official-schedules.patch.json': '06cef970ec4cc1e1b6cdabf7058bdd4c195da70fa9cf887d673b4d013aa2330b',
    'review.md': 'd09841651dbfa11fba31e94983cc9588a760588b8a0c414e024a81f0fa18c346',
  },
  indigo: {
    'REVIEW.md': 'a6758d572f182f2c0a1518a9e0027b73db7b0bff75bb6ccb98003bccadbbf240',
    'airport-mapping-supplement.csv': 'ed5a21adfba490523db789ed0e2fde1c6c7ee76fa74aa4014697d4034ada6fb4',
    'flagged-source-rows.csv': '8e566f6e07b82214cdd2e919e8abfcd6413b9acb9c38a96ce943012f3340a86d',
    'identity-ledger.csv': '8b8669af1255214ab603c7bc78245369a7dc652d39c9b9ba015e6eebd49a84e2',
    'integration-candidate-snapshot.json': '9edf712870d8003dfb9e58efbb02e4a02dbfbfceb490b8b79ef4e84a3ca3bea1',
    'packet-baseline-flagged-source-rows.csv': '0c45b2a26d2a881ba8c24731d140740e2c328acc17c6b75dac80bb826d6e2c04',
    'station-mapping-review.csv': '2c5f2e6c0747cdad17a84915fc358e67c74d55138ec0524df82eb67c16afa0a7',
    'validation-summary.json': '6e8193a68692a87036555d45fb5b7bfe222d695bdbb51734b267b4a26c15a32b',
  },
  airindia: {
    'README.md': '0414471eab9fc13466e4379b6b93dcbe090dd235a3110ffcea17f233671abe4b',
    'schedule-identity-ledger.csv': 'ad5e16cf427953531097f649c5642bd2a361ab46fe2cba5e0955b7794d3738e6',
    'movement-lineage.csv': '41732e1ec2eee4048324fa0b09819cde53cc9e7aca36851fd531c373a8268123',
    'integration-snapshot.json': '5655533f15459917af220661deb438e11e47b172d6243c4993987d1c2dbcca77',
  },
};

interface CsvRecord { [key: string]: string }
interface EvidenceVariant { id: string; effectiveFrom: string; effectiveUntil: string; effectiveFromRaw: string; effectiveUntilRaw: string; frequencyRaw: string; departureClockValuesRaw: string[]; arrivalClockValuesRaw: string[]; aircraftTypeValuesRaw: string[]; sourceRows: Array<{ referenceRaw: string; sourceRowSha256: string | null; page: number; physicalRow: number | null; stationSectionOrdinal: number | null; printedRowRaw: string | null; sourceSide: 'arrival' | 'departure' | null }> }
interface EvidenceReference { id: string; designatorKey: string; originIata: string; destinationIata: string; airportCatalogStatus: 'all-endpoints-present' | 'source-code-not-in-current-catalog'; variants: EvidenceVariant[] }

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8')) as unknown;
const sha256Bytes = (value: Buffer | string): string => createHash('sha256').update(value).digest('hex');
const sha256File = (path: string): string => sha256Bytes(readFileSync(path));

function verifyPacket(packetDir: string, checksumFile: string, expected: Record<string, string>): void {
  const checksumPath = join(packetDir, checksumFile);
  const rows = readFileSync(checksumPath, 'utf8').trim().split(/\r?\n/).map(line => {
    const match = /^([0-9a-f]{64})\s+([A-Za-z0-9._-]+)$/.exec(line);
    if (!match) throw new Error(`Malformed checksum row in ${checksumFile}`);
    return { hash: match[1]!, filename: match[2]! };
  });
  if (rows.length !== Object.keys(expected).length) throw new Error(`Unexpected artifact count in ${checksumFile}`);
  for (const [filename, hash] of Object.entries(expected)) {
    const row = rows.find(candidate => candidate.filename === filename);
    if (!row || row.hash !== hash || sha256File(join(packetDir, filename)) !== hash) throw new Error(`Packet hash mismatch: ${filename}`);
  }
}

function parseCsv(text: string): CsvRecord[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += char;
  }
  if (field !== '' || row.length > 0) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  const [headers, ...records] = rows;
  if (!headers?.length) throw new Error('CSV has no headers');
  return records.filter(record => record.length === headers.length).map(record => Object.fromEntries(headers.map((header, index) => [header!, record[index]!]))) as CsvRecord[];
}

function recordsBySource(catalog: ReturnType<typeof DgcaScheduleEvidenceCatalogSchema.parse>): Map<string, EvidenceReference[]> {
  return new Map(catalog.sources.map(source => [source.id, source.references as EvidenceReference[]]));
}

function indigoPhysicalRow(sourceRow: { lineage: string; page: number; printedRow: string; sourceRowSha256: string; stationSection: string }): number {
  const match = /^p(\d+)\/line(\d+)\/station=([^/]*)\/row=([^/]*)\/sha256=([0-9a-f]{12})$/.exec(sourceRow.lineage);
  if (!match || Number(match[1]) !== sourceRow.page || match[3] !== sourceRow.stationSection
    || match[4] !== sourceRow.printedRow || !sourceRow.sourceRowSha256.startsWith(match[5]!)) {
    throw new Error(`IndiGo corrected page/physical-row/station/printed-row/hash lineage is inconsistent: ${sourceRow.lineage}`);
  }
  return Number(match[2]);
}

function verifySpiceJet(references: EvidenceReference[], airports: Set<string>): void {
  const manifest = JSON.parse(readFileSync(join(SPICEJET_PACKET, 'manifest.json'), 'utf8')) as {
    source: { sha256: string };
    counts: { expired_only_keys: string[]; overlap_pairs: number; overlap_pairs_conflicting_core_identity: number; overlap_claims_flagged: number };
    ledger_sha256: string; integration_patch: { patch_sha256: string }; review_sha256: string;
  };
  const claims = readFileSync(join(SPICEJET_PACKET, 'identity_ledger.jsonl'), 'utf8').trim().split(/\r?\n/)
    .map(line => JSON.parse(line) as {
      claim_id: string; disposition: string; identity: { flight_number_key: string; from: string; to: string };
      validity: { lifecycle_as_of_date: string; effective_from: string; effective_to: string };
      raw_schedule_fields: { frequency_raw: string; departure_time_raw: string; arrival_time_raw: string; aircraft_type: string };
      source_evidence: { page_row_refs: string[]; sha256: string };
      conflict_flags: { overlapping_metadata_variant: boolean; metadata_difference_fields: string[]; metadata_conflict_peer_claim_ids: string[] };
    });
  const current = claims.filter(claim => claim.disposition === 'accepted_identity' && claim.validity.lifecycle_as_of_date === 'current');
  const expired = claims.filter(claim => claim.validity.lifecycle_as_of_date === 'expired');
  const variants = new Map(references.flatMap(reference => reference.variants.map(variant => [variant.id, variant] as const)));
  if (manifest.source.sha256 !== '135845cb7339e567e18b8e971d6aa5537882c3e1fd8d8101b024927e2b38124b'
    || sha256File(join(SPICEJET_PACKET, 'identity_ledger.jsonl')) !== manifest.ledger_sha256
    || sha256File(join(SPICEJET_PACKET, 'official-schedules.patch.json')) !== manifest.integration_patch.patch_sha256
    || sha256File(join(SPICEJET_PACKET, 'review.md')) !== manifest.review_sha256
    || current.length !== 196 || expired.length !== 15 || references.length !== 140 || variants.size !== current.length) {
    throw new Error('SpiceJet source/identity/variant counts differ from the accepted review');
  }
  for (const claim of current) {
    const variant = variants.get(claim.claim_id);
    if (!variant || variant.effectiveFrom !== claim.validity.effective_from || variant.effectiveUntil !== claim.validity.effective_to
      || variant.frequencyRaw !== claim.raw_schedule_fields.frequency_raw
      || JSON.stringify(variant.departureClockValuesRaw) !== JSON.stringify([claim.raw_schedule_fields.departure_time_raw])
      || JSON.stringify(variant.arrivalClockValuesRaw) !== JSON.stringify([claim.raw_schedule_fields.arrival_time_raw])
      || JSON.stringify(variant.aircraftTypeValuesRaw) !== JSON.stringify([claim.raw_schedule_fields.aircraft_type])
      || JSON.stringify(variant.sourceRows.map(row => row.referenceRaw)) !== JSON.stringify(claim.source_evidence.page_row_refs)
      || JSON.stringify(variant.conflictIds) !== JSON.stringify(claim.conflict_flags.metadata_conflict_peer_claim_ids)
      || JSON.stringify(variant.conflictFields) !== JSON.stringify(claim.conflict_flags.metadata_difference_fields.map(field => ({
        frequency_raw: 'frequency', departure_time_raw: 'departureClock', arrival_time_raw: 'arrivalClock', aircraft_type_raw: 'aircraftType',
      }[field]))) || claim.source_evidence.sha256 !== manifest.source.sha256) {
      throw new Error(`SpiceJet source lineage or raw fields changed: ${claim.claim_id}`);
    }
  }
  if (references.some(reference => !airports.has(reference.originIata) || !airports.has(reference.destinationIata)
    || reference.airportCatalogStatus !== 'all-endpoints-present')) throw new Error('SpiceJet endpoints do not pass the current airport catalog');
  for (const claim of expired) if (variants.has(claim.claim_id)) throw new Error(`Expired SpiceJet variant leaked: ${claim.claim_id}`);
  if (manifest.counts.expired_only_keys.length !== 5 || manifest.counts.overlap_pairs !== 79
    || manifest.counts.overlap_pairs_conflicting_core_identity !== 0 || manifest.counts.overlap_claims_flagged !== 120) {
    throw new Error('SpiceJet independently reviewed overlap flags changed');
  }
}

function verifyIndiGo(references: EvidenceReference[], airports: Set<string>): void {
  const snapshot = JSON.parse(readFileSync(join(INDIGO_PACKET, 'integration-candidate-snapshot.json'), 'utf8')) as {
    records: Array<{ id: string; identityRecordSha256: string; evidenceStatus: string; candidateKey: string | null; publishedDesignatorKey: string; originIata: string | null; destinationIata: string | null; validity: { 'statusAsOf2026-10-07': string; fromIso: string; untilIso: string; fromRaw: string; untilRaw: string }; frequencyRaw: string; departureClockValuesRaw: string[]; arrivalClockValuesRaw: string[]; scheduleVariantConflictIds: string[]; sourceRows: Array<{ lineage: string; sourceRowSha256: string; page: number; printedRow: string; sourceSide: 'arrival' | 'departure'; stationSection: string }> }>;
    classificationCounts: { acceptedIdentityOnlyVariants: number; directedScheduleVariants: number; heldVariants: number; expiredVariants: number };
    source: { sourcePdf: { sha256: string; bytes: number; pages: number } };
  };
  const ledger = parseCsv(readFileSync(join(INDIGO_PACKET, 'identity-ledger.csv'), 'utf8'));
  const ledgerById = new Map(ledger.map(row => [row.record_id, row]));
  const active = snapshot.records.filter(record => record.evidenceStatus === 'accepted_identity_only' && record.validity['statusAsOf2026-10-07'] === 'current-or-future');
  const variants = new Map(references.flatMap(reference => reference.variants.map(variant => [variant.id, variant] as const)));
  const referenceByVariantId = new Map(references.flatMap(reference => reference.variants.map(variant => [variant.id, reference] as const)));
  const identities = new Set(references.map(reference => `${reference.designatorKey}|${reference.originIata}|${reference.destinationIata}`));
  if (active.length !== 3729 || variants.size !== 3729 || identities.size !== 2218 || references.length !== 2218
    || snapshot.classificationCounts.acceptedIdentityOnlyVariants !== 3729
    || snapshot.classificationCounts.directedScheduleVariants !== 5110 || snapshot.classificationCounts.heldVariants !== 0
    || snapshot.records.filter(record => record.evidenceStatus === 'held').length !== 0
    || snapshot.classificationCounts.expiredVariants !== 1381
    || snapshot.records.filter(record => record.evidenceStatus === 'expired').length !== 1381
    || snapshot.source.sourcePdf.sha256 !== '49202673b590051beef3873127cecf171bea73c67ac1962d0031ccbb109bcd85') {
    throw new Error('IndiGo active identities, variants, exclusions, or source hash differ from the accepted packet');
  }
  for (const record of active) {
    const variant = variants.get(record.id);
    const reference = referenceByVariantId.get(record.id);
    const sourceLedgerRow = ledgerById.get(record.id);
    if (!variant || !reference || !sourceLedgerRow || sourceLedgerRow.identity_record_sha256 !== record.identityRecordSha256
      || reference.designatorKey !== record.publishedDesignatorKey
      || variant.effectiveFrom !== record.validity.fromIso || variant.effectiveUntil !== record.validity.untilIso
      || variant.effectiveFromRaw !== record.validity.fromRaw || variant.effectiveUntilRaw !== record.validity.untilRaw
      || variant.frequencyRaw !== record.frequencyRaw
      || JSON.stringify(variant.frequencyWeekdaysCorroborated) !== JSON.stringify(record.frequencyWeekdaysCorroborated)
      || JSON.stringify(variant.departureClockValuesRaw) !== JSON.stringify(record.departureClockValuesRaw)
      || JSON.stringify(variant.arrivalClockValuesRaw) !== JSON.stringify(record.arrivalClockValuesRaw)
      || JSON.stringify(variant.aircraftTypeValuesRaw) !== JSON.stringify([sourceLedgerRow.aircraft_type_raw ?? ''])
      || JSON.stringify(variant.conflictIds) !== JSON.stringify(record.scheduleVariantConflictIds)
      || variant.sourceRows.length !== record.sourceRows.length
      || variant.sourceRows.some((row, index) => {
        const sourceRow = record.sourceRows[index];
        return !sourceRow || row.referenceRaw !== sourceRow.lineage || row.page !== sourceRow.page
          || row.physicalRow !== indigoPhysicalRow(sourceRow) || row.stationSectionOrdinal !== null
          || row.stationSectionRaw !== sourceRow.stationSection || row.printedRowRaw !== sourceRow.printedRow
          || row.sourceSide !== sourceRow.sourceSide || row.sourceRowSha256 !== sourceRow.sourceRowSha256;
      })) {
      throw new Error(`IndiGo raw fields or corrected lineage changed: ${record.id}`);
    }
  }
  const nonCatalogReferences = references.filter(reference => !airports.has(reference.originIata) || !airports.has(reference.destinationIata));
  const missingCodes = [...new Set(nonCatalogReferences.flatMap(reference => [reference.originIata, reference.destinationIata]).filter(code => !airports.has(code)))];
  const sourceOnlyVariantCount = nonCatalogReferences.reduce((count, reference) => count + reference.variants.length, 0);
  const sourceOnlyKeys = new Set(nonCatalogReferences.map(reference => `${reference.designatorKey}|${reference.originIata}|${reference.destinationIata}`));
  const expectedPurniaKeys = new Set([
    '6E5935|HYD|PXN', '6E5936|PXN|HYD', '6E6175|DEL|PXN',
    '6E6560|PXN|DEL', '6E7924|CCU|PXN', '6E7925|PXN|CCU',
  ]);
  const stationMappings = parseCsv(readFileSync(join(INDIGO_PACKET, 'station-mapping-review.csv'), 'utf8'));
  const pxnMapping = stationMappings.find(row => row.station_iata_candidate === 'PXN' && row.station_label_raw === 'Purnia' && row.mapping_status === 'pdf-counterpart');
  if (nonCatalogReferences.length !== 6 || sourceOnlyVariantCount !== 10 || sourceOnlyKeys.size !== 6
    || [...expectedPurniaKeys].some(key => !sourceOnlyKeys.has(key))
    || JSON.stringify(missingCodes) !== JSON.stringify(['PXN']) || !pxnMapping
    || nonCatalogReferences.some(reference => reference.airportCatalogStatus !== 'source-code-not-in-current-catalog')) {
    throw new Error('IndiGo source-mapped PXN references must remain visibly non-routable until the code is in the GCMP airport catalog');
  }
}

function verifyAirIndia(references: EvidenceReference[], runtime: Array<Record<string, unknown>>): void {
  const snapshot = JSON.parse(readFileSync(join(AIRINDIA_PACKET, 'integration-snapshot.json'), 'utf8')) as {
    source: { pdf_sha256: string };
    reproduction_and_counts: { current_future_schedule_variants: number; current_future_distinct_carrier_route_designator_identities: number; aircraft_field_hold_count: number; baseline_designator_match_counts: { confirmed_exact_designator: number; candidate_exact_designator: number; existing_route_unlisted_designator: number } };
  };
  const ledger = parseCsv(readFileSync(join(AIRINDIA_PACKET, 'schedule-identity-ledger.csv'), 'utf8'));
  const movements = parseCsv(readFileSync(join(AIRINDIA_PACKET, 'movement-lineage.csv'), 'utf8'));
  const movementById = new Map(movements.map(row => [row.movement_id, row]));
  const active = ledger.filter(row => ['current', 'future'].includes(row.temporal_status_as_of_2026_10_07)
    && ['accepted', 'held_field_only'].includes(row.ledger_disposition));
  const expired = ledger.filter(row => row.ledger_disposition === 'expired' || row.temporal_status_as_of_2026_10_07 === 'expired');
  const variants = new Map(references.flatMap(reference => reference.variants.map(variant => [variant.id, variant] as const)));
  const referenceByVariantId = new Map(references.flatMap(reference => reference.variants.map(variant => [variant.id, reference] as const)));
  const identities = new Set(references.map(reference => `${reference.designatorKey}|${reference.originIata}|${reference.destinationIata}`));
  if (active.length !== 865 || expired.length !== 250 || variants.size !== 865 || identities.size !== 573 || references.length !== 573
    || snapshot.source.pdf_sha256 !== '107983dc72d381e6897a5a333556946adcc98daef82e954d52cec1fc402c3086') {
    throw new Error('Air India active identities, variants, exclusions, or source hash differ from the accepted packet');
  }
  if (references.some(reference => reference.airportCatalogStatus !== 'all-endpoints-present')) throw new Error('Air India endpoints do not pass the current airport catalog');
  for (const row of active) {
    const variant = variants.get(row.identity_id);
    const reference = referenceByVariantId.get(row.identity_id);
    const movementIds = row.source_movement_refs.split(';').filter(Boolean);
    if (!variant || !reference || movementIds.length !== variant.sourceRows.length || reference.designatorKey !== row.flight_designator_normalized
      || variant.effectiveFrom !== row.effective_from || variant.effectiveUntil !== row.effective_until
      || variant.frequencyRaw !== row.raw_frequency
      || !variant.sourceRows.every((sourceRow, index) => {
        const movement = movementById.get(movementIds[index]!);
        return movement !== undefined && sourceRow.referenceRaw === movement.source_row_address
          && sourceRow.page === Number(movement.pdf_page) && sourceRow.physicalRow === Number(movement.physical_row_on_page)
          && sourceRow.stationSectionOrdinal === Number(movement.station_section_ordinal_on_page)
          && sourceRow.stationSectionRaw === movement.station_section_raw && sourceRow.printedRowRaw === movement.printed_row_no
          && sourceRow.sourceSide === movement.movement_side;
      })) {
      throw new Error(`Air India raw fields or full movement lineage changed: ${row.identity_id}`);
    }
  }
  const baselineCounts = snapshot.reproduction_and_counts.baseline_designator_match_counts;
  const observed: Record<string, number> = { confirmed_exact_designator: 0, candidate_exact_designator: 0, existing_route_unlisted_designator: 0 };
  const identityRows = new Map<string, CsvRecord>();
  for (const row of active) identityRows.set(`${row.flight_designator_normalized}|${row.origin_iata}|${row.destination_iata}`, row);
  for (const row of identityRows.values()) {
    const route = runtime.find(candidate => candidate.carrier === 'AI' && Array.isArray(candidate.pair)
      && (candidate.pair as string[]).join('-') === `${row.origin_iata}-${row.destination_iata}`);
    if (!route) throw new Error(`Air India reference route is absent from the resolved runtime: ${row.origin_iata}-${row.destination_iata}`);
    const confirmed = Array.isArray(route.flightNumbers) && (route.flightNumbers as string[]).includes(row.flight_designator_normalized);
    const candidate = Array.isArray(route.flightNumberCandidates) && (route.flightNumberCandidates as string[]).includes(row.flight_designator_normalized);
    const actualClass = confirmed ? 'confirmed_exact_designator' : candidate ? 'candidate_exact_designator' : 'existing_route_unlisted_designator';
    if (actualClass !== row.baseline_match_class) throw new Error(`Air India runtime identity classification changed for ${row.flight_designator_normalized}`);
    observed[actualClass] = (observed[actualClass] ?? 0) + 1;
  }
  if (observed.confirmed_exact_designator !== baselineCounts.confirmed_exact_designator
    || observed.candidate_exact_designator !== baselineCounts.candidate_exact_designator
    || observed.existing_route_unlisted_designator !== baselineCounts.existing_route_unlisted_designator
    || observed.confirmed_exact_designator !== 567 || observed.candidate_exact_designator !== 2 || observed.existing_route_unlisted_designator !== 4) {
    throw new Error('Air India confirmed, candidate, and unlisted identity counts changed');
  }
  const suffix = references.find(reference => reference.designatorKey === 'AI532A' && reference.originIata === 'AMD' && reference.destinationIata === 'DEL');
  if (!suffix) throw new Error('Air India AI532A suffix was truncated or omitted');
}

function verifyProtectedReleaseBase(): void {
  const runtimePath = join(ROOT, 'public/data/route-network/runtime-current.json');
  if (sha256File(runtimePath) !== RELEASE_BASE_RUNTIME_SHA256) throw new Error('Brazil release runtime hash changed');
  const runtime = readJson(runtimePath) as { routes: Array<Record<string, unknown>> };
  let confirmed = 0;
  let candidates = 0;
  let registeredPlanProfiles = 0;
  const sgOrIndigoFound = runtime.routes.some(route => route.carrier === 'SG' || route.carrier === '6E' || route.carrier === 'IGO'
    || (Array.isArray(route.flightNumbers) && (route.flightNumbers as string[]).some(number => /^(SG|6E)/.test(number)))
    || (Array.isArray(route.flightNumberCandidates) && (route.flightNumberCandidates as string[]).some(number => /^(SG|6E)/.test(number))));
  if (sgOrIndigoFound) throw new Error('SpiceJet/IndiGo evidence leaked into the route or flight-number layers');
  for (const route of runtime.routes) {
    if (Array.isArray(route.flightNumbers)) confirmed += route.flightNumbers.length;
    if (Array.isArray(route.flightNumberCandidates)) candidates += route.flightNumberCandidates.length;
    if (Array.isArray(route.registeredPlans)) registeredPlanProfiles += route.registeredPlans.length;
  }
  if (confirmed !== 2767 || candidates !== 132383 || runtime.routes.length !== 32216 || registeredPlanProfiles !== 15304) {
    throw new Error('Protected confirmed/candidate, route, or Brazil registered-plan totals changed');
  }
  const siros = readJson(join(ROOT, 'public/data/route-network/siros-registered-plan-release-20261007.json')) as { accepted: { sourceRows: number; existingRouteKeys: number; baselineConfirmedFlightAssociations: number } };
  const caa = readJson(join(ROOT, 'public/data/route-network/caa-weekly-schedule-tier-20261006.json')) as { associations: unknown[] };
  if (siros.accepted.sourceRows !== 14997 || siros.accepted.existingRouteKeys !== 386 || siros.accepted.baselineConfirmedFlightAssociations !== 2767
    || caa.associations.length !== 488) throw new Error('SIROS 14,997/386/2,767 or CAA 488 protected counts changed');
  const official = readJson(join(ROOT, 'public/data/official-schedules.json')) as { flightNumberReferences?: Array<{ carrier: string }> };
  if (official.flightNumberReferences?.some(reference => reference.carrier === 'SG' || reference.carrier === '6E' || reference.carrier === 'IGO')) {
    throw new Error('DGCA references were promoted into the evergreen official flight-number reference layer');
  }
  const avinor = readJson(join(ROOT, 'public/data/route-network/avinor-remaining-airports-release-20261007.json')) as { accepted: { occurrences: number }; sourceSnapshots: Array<{ freshUntilUTC: string }> };
  if (avinor.accepted.occurrences !== 517 || avinor.sourceSnapshots.length !== 24
    || avinor.sourceSnapshots.some(snapshot => !Number.isFinite(Date.parse(snapshot.freshUntilUTC)))) {
    throw new Error('Existing Avinor occurrence expiry/source-window data changed');
  }
}

function main(): void {
  verifyPacket(SPICEJET_PACKET, 'SHA256SUMS.txt', EXPECTED_CHECKSUMS.spicejet!);
  verifyPacket(INDIGO_PACKET, 'manifest.sha256', EXPECTED_CHECKSUMS.indigo!);
  verifyPacket(AIRINDIA_PACKET, 'SHA256SUMS', EXPECTED_CHECKSUMS.airindia!);
  const catalog = DgcaScheduleEvidenceCatalogSchema.parse(readJson(join(ROOT, 'public/data/dgca-schedule-evidence-20261007.json')));
  const bySource = recordsBySource(catalog);
  const spicejet = bySource.get('dgca-spicejet-ss-2026');
  const indigo = bySource.get('dgca-indigo-domestic-ss-2026');
  const airIndia = bySource.get('dgca-air-india-domestic-ss-2026');
  if (!spicejet || !indigo || !airIndia || catalog.sources.length !== 3
    || catalog.semantics.selectable || catalog.semantics.actualOperationEstablished
    || catalog.semantics.dateAvailability !== 'unknown' || catalog.semantics.timeBasis !== 'unknown'
    || catalog.semantics.utcOccurrencesGenerated || catalog.semantics.connectionTimingEstablished) {
    throw new Error('Shared DGCA evidence schema/source semantics changed');
  }
  const airports = new Set(parseAirportCatalog(readJson(join(ROOT, 'public/data/airports.json'))).map(airport => airport.iata));
  verifySpiceJet(spicejet, airports);
  verifyIndiGo(indigo, airports);
  const runtime = (readJson(join(ROOT, 'public/data/route-network/runtime-current.json')) as { routes: Array<Record<string, unknown>> }).routes;
  verifyAirIndia(airIndia, runtime);
  verifyProtectedReleaseBase();
  console.log('✓ DGCA evidence verified: 140 SpiceJet + 2,218 IndiGo + 573 Air India identities; 196 + 3,729 + 865 variants; 0 IndiGo station holds, 1,381 expired variants, 10 PXN variants across six source-only identities; exact packets, bounded validity, raw fields and corrected lineage pinned; no planner promotion; Brazil runtime/counts, CAA 488 and Avinor expiry preserved');
}

main();
