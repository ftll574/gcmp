/** Build the bounded, non-selectable SpiceJet DGCA schedule identity references. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { FlightNumberReferenceSchema, PublicationSourceSchema } from '../src/lib/schemas/published-schedules.ts';
import { SpiceJetScheduleReferenceCatalogSchema } from '../src/lib/schemas/spicejet-schedule-references.ts';

const ROOT = resolve(process.cwd());
const PACKET = join(ROOT, 'docs/source-evidence/spicejet-ss-2026');
const OUT = join(ROOT, '.tmp/spicejet-schedule-reference-normalizer.json');

const SourceManifestSchema = z.object({
  snapshot_as_of_date: z.string(),
  source: z.object({ url: z.string().url(), sha256: z.string(), bytes: z.number().int(), pages: z.number().int() }),
  operator_identity_source: z.string().url(),
  counts: z.object({
    accepted_current_variants: z.number().int(), expired_variants: z.number().int(),
    keys_with_current_variant: z.number().int(), expired_only_keys: z.array(z.string()), overlap_pairs: z.number().int(),
    overlap_pairs_conflicting_core_identity: z.number().int(), overlap_claims_flagged: z.number().int(),
    counterpart_confirmed_current_keys: z.number().int(), same_designator_multiple_directional_routes: z.number().int(),
  }),
  ledger_records: z.number().int(), ledger_sha256: z.string(),
  integration_patch: z.object({
    source_id: z.string(), checked_at: z.string(), review_by: z.string(),
    flight_number_references: z.number().int(), patch_sha256: z.string(),
  }),
  review_sha256: z.string(),
}).passthrough();

const ClaimSchema = z.object({
  claim_id: z.string().regex(/^claim-\d{4}$/),
  disposition: z.enum(['accepted_identity', 'expired_identity']),
  identity: z.object({
    flight_number_raw: z.string(), flight_number_key: z.string(), flight_number_digits_raw: z.string(),
    from: z.string(), to: z.string(), direction_key: z.string(),
  }).passthrough(),
  operator: z.object({
    operator_code_raw: z.string(), iata_designator: z.string(), actual_operation_established: z.literal(false),
  }).passthrough(),
  validity: z.object({
    effective_from: z.string(), effective_to: z.string(), lifecycle_as_of_date: z.enum(['current', 'expired']),
  }).passthrough(),
  raw_schedule_fields: z.object({
    aircraft_type: z.string(), frequency_raw: z.string(), departure_time_raw: z.string(), arrival_time_raw: z.string(),
    frequency_weekday_mapping: z.string(), time_basis: z.string(),
  }).passthrough(),
  source_evidence: z.object({
    url: z.string().url(), sha256: z.string(), page_row_refs: z.array(z.string()), source_pages: z.array(z.number().int()),
    source_serials: z.array(z.string()), directional_leg_assertion_count: z.number().int().positive(),
    counterpart_status: z.enum(['one-sided', 'paired']), source_scope: z.string(),
  }).passthrough(),
  conflict_flags: z.object({
    overlapping_metadata_variant: z.boolean(), metadata_difference_fields: z.array(z.string()),
    metadata_conflict_peer_claim_ids: z.array(z.string()), contradictory_flight_number_or_direction_identity: z.literal(false),
    same_designator_has_other_directional_routes: z.boolean(), other_directional_routes_for_same_designator: z.array(z.string()),
  }).passthrough(),
}).passthrough();

const PatchSchema = z.object({
  version: z.literal(1), patchTarget: z.literal('public/data/official-schedules.json'),
  sources: z.record(z.string(), PublicationSourceSchema),
  flightNumberReferences: z.array(FlightNumberReferenceSchema),
}).passthrough();

type Claim = z.infer<typeof ClaimSchema>;

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function verifyPacketHashes(): void {
  const checksums = readFileSync(join(PACKET, 'SHA256SUMS.txt'), 'utf8')
    .trim().split(/\r?\n/).map(line => {
      const match = /^([0-9a-f]{64})\s+([A-Za-z0-9._-]+)$/.exec(line);
      if (!match) throw new Error(`Malformed packet checksum line: ${line}`);
      return { hash: match[1]!, filename: match[2]! };
    });
  const expectedFiles = new Set(['identity_ledger.jsonl', 'manifest.json', 'official-schedules.patch.json', 'review.md']);
  if (checksums.length !== expectedFiles.size || new Set(checksums.map(item => item.filename)).size !== expectedFiles.size
    || checksums.some(item => !expectedFiles.has(item.filename))) {
    throw new Error('Accepted packet checksum list does not match the four reviewed artifacts');
  }
  for (const item of checksums) {
    if (sha256(join(PACKET, item.filename)) !== item.hash) throw new Error(`Accepted packet hash mismatch: ${item.filename}`);
  }
}

function identityKey(designator: string, from: string, to: string): string {
  return `${designator}|${from}|${to}`;
}

function build(): void {
  verifyPacketHashes();
  const manifest = SourceManifestSchema.parse(readJson(join(PACKET, 'manifest.json')));
  const patch = PatchSchema.parse(readJson(join(PACKET, 'official-schedules.patch.json')));
  const ledger = readFileSync(join(PACKET, 'identity_ledger.jsonl'), 'utf8').trim().split(/\r?\n/)
    .map(line => ClaimSchema.parse(JSON.parse(line) as unknown));

  if (ledger.length !== manifest.ledger_records || patch.flightNumberReferences.length !== manifest.integration_patch.flight_number_references) {
    throw new Error('Reviewed packet counts do not match its manifest');
  }
  if (sha256(join(PACKET, 'identity_ledger.jsonl')) !== manifest.ledger_sha256
    || sha256(join(PACKET, 'official-schedules.patch.json')) !== manifest.integration_patch.patch_sha256
    || sha256(join(PACKET, 'review.md')) !== manifest.review_sha256) {
    throw new Error('Reviewed artifact hash differs from the manifest');
  }

  const sourceId = manifest.integration_patch.source_id;
  const source = patch.sources[sourceId];
  if (!source || source.url !== manifest.source.url || source.checkedAt !== manifest.integration_patch.checked_at
    || source.reviewBy !== manifest.integration_patch.review_by) {
    throw new Error('Patch source identity or bounded review window differs from the manifest');
  }
  if (manifest.source.sha256 !== '135845cb7339e567e18b8e971d6aa5537882c3e1fd8d8101b024927e2b38124b') {
    throw new Error('Unexpected DGCA source PDF SHA-256');
  }

  const current = ledger.filter(claim => claim.disposition === 'accepted_identity' && claim.validity.lifecycle_as_of_date === 'current');
  const expired = ledger.filter(claim => claim.disposition === 'expired_identity' || claim.validity.lifecycle_as_of_date === 'expired');
  const groups = new Map<string, Claim[]>();
  for (const claim of current) {
    const key = identityKey(claim.identity.flight_number_key, claim.identity.from, claim.identity.to);
    const group = groups.get(key) ?? [];
    group.push(claim);
    groups.set(key, group);
  }
  const expiredKeys = new Set(expired.map(claim => identityKey(claim.identity.flight_number_key, claim.identity.from, claim.identity.to)));
  const currentKeys = new Set(groups.keys());
  const expiredOnlyKeys = [...expiredKeys].filter(key => !currentKeys.has(key)).sort();
  const expectedExpiredOnly = manifest.counts.expired_only_keys.map(value => {
    const match = /^(SG\s*\d{1,4}[A-Z]?)\s+([A-Z]{3})-([A-Z]{3})$/.exec(value.trim());
    if (!match) throw new Error(`Malformed expired-only identity in manifest: ${value}`);
    return identityKey(match[1]!.replace(/\s+/g, ''), match[2]!, match[3]!);
  }).sort();
  if (JSON.stringify(expiredOnlyKeys) !== JSON.stringify(expectedExpiredOnly)) {
    throw new Error('Expired-only identities differ from the reviewed manifest');
  }

  const patchByKey = new Map<string, (typeof patch.flightNumberReferences)[number]>();
  for (const reference of patch.flightNumberReferences) {
    if (reference.flightNumbers.length !== 1 || reference.carrier !== 'SG' || reference.sourceId !== sourceId) {
      throw new Error(`Patch reference is outside the reviewed SG identity scope: ${reference.id}`);
    }
    const key = identityKey(`SG${reference.flightNumbers[0]}`, reference.from, reference.to);
    if (patchByKey.has(key)) throw new Error(`Duplicate patch identity: ${key}`);
    patchByKey.set(key, reference);
  }

  const references = patch.flightNumberReferences.map(patchReference => {
    const designator = `SG${patchReference.flightNumbers[0]}`;
    const key = identityKey(designator, patchReference.from, patchReference.to);
    const claims = groups.get(key);
    if (!claims?.length) throw new Error(`Patch identity has no current accepted source claims: ${key}`);
    const variants = claims.map(claim => {
      if (claim.identity.flight_number_raw.replace(/\s+/g, '') !== designator
        || claim.identity.flight_number_digits_raw !== patchReference.flightNumbers[0]
        || claim.identity.direction_key !== `${patchReference.from}-${patchReference.to}`
        || claim.operator.iata_designator !== 'SG' || claim.operator.operator_code_raw !== 'SEJ'
        || claim.source_evidence.url !== manifest.source.url || claim.source_evidence.sha256 !== manifest.source.sha256
        || claim.source_evidence.source_scope !== 'DGCA approved schedule identity only; operation not established') {
        throw new Error(`Current claim identity/source mismatch: ${claim.claim_id}`);
      }
      return {
        claimId: claim.claim_id,
        effectiveFrom: claim.validity.effective_from,
        effectiveUntil: claim.validity.effective_to,
        pageRowRefs: claim.source_evidence.page_row_refs,
        sourcePages: claim.source_evidence.source_pages,
        sourceSerials: claim.source_evidence.source_serials,
        directionalLegAssertionCount: claim.source_evidence.directional_leg_assertion_count,
        counterpartStatus: claim.source_evidence.counterpart_status,
        frequencyRaw: claim.raw_schedule_fields.frequency_raw,
        departureTimeRaw: claim.raw_schedule_fields.departure_time_raw,
        arrivalTimeRaw: claim.raw_schedule_fields.arrival_time_raw,
        aircraftTypeRaw: claim.raw_schedule_fields.aircraft_type,
        frequencyInterpretation: 'unverified' as const,
        timeBasis: 'unknown' as const,
        overlappingMetadataVariant: claim.conflict_flags.overlapping_metadata_variant,
        metadataDifferenceFields: claim.conflict_flags.metadata_difference_fields,
        metadataConflictPeerClaimIds: claim.conflict_flags.metadata_conflict_peer_claim_ids,
        contradictoryFlightNumberOrDirectionIdentity: claim.conflict_flags.contradictory_flight_number_or_direction_identity,
        sameDesignatorHasOtherDirectionalRoutes: claim.conflict_flags.same_designator_has_other_directional_routes,
        otherDirectionalRoutes: claim.conflict_flags.other_directional_routes_for_same_designator,
        sourceScope: claim.source_evidence.source_scope as 'DGCA approved schedule identity only; operation not established',
      };
    }).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.effectiveUntil.localeCompare(b.effectiveUntil) || a.claimId.localeCompare(b.claimId));

    const otherDirectionalRoutes = [...new Set(variants.flatMap(variant => variant.otherDirectionalRoutes))].sort();
    return {
      id: patchReference.id,
      publishedDesignatorRaw: claims[0]!.identity.flight_number_raw,
      flightNumber: patchReference.flightNumbers[0]!,
      designator,
      from: patchReference.from,
      to: patchReference.to,
      hasCurrentSourceCounterpart: variants.some(variant => variant.counterpartStatus === 'paired'),
      overlappingMetadataVariant: variants.some(variant => variant.overlappingMetadataVariant),
      otherDirectionalRoutes,
      variants,
    };
  });

  if (patchByKey.size !== groups.size || groups.size !== 140 || current.length !== 196 || expired.length !== 15
    || patchByKey.size !== manifest.counts.keys_with_current_variant
    || current.length !== manifest.counts.accepted_current_variants
    || expired.length !== manifest.counts.expired_variants) {
    throw new Error('Current/expired identity totals differ from the independently reviewed counts');
  }
  const currentIdentityKeysWithCounterparts = references.filter(reference => reference.hasCurrentSourceCounterpart).length;
  if (currentIdentityKeysWithCounterparts !== manifest.counts.counterpart_confirmed_current_keys) {
    throw new Error('Current counterpart-key count differs from the independently reviewed count');
  }
  const sourceDesignatorsWithOtherDirectionalRoutes = new Set(ledger.filter(claim => claim.conflict_flags.same_designator_has_other_directional_routes)
    .map(claim => claim.identity.flight_number_key)).size;
  const currentReferencesWithOtherDirectionalRoutes = new Set(current.filter(claim => claim.conflict_flags.same_designator_has_other_directional_routes)
    .map(claim => claim.identity.flight_number_key)).size;
  if (sourceDesignatorsWithOtherDirectionalRoutes !== manifest.counts.same_designator_multiple_directional_routes) {
    throw new Error('Multi-direction designator count differs from the independently reviewed count');
  }
  const overlapClaimsFlagged = ledger.filter(claim => claim.conflict_flags.overlapping_metadata_variant).length;
  const currentVariantsWithMetadataConflict = current.filter(claim => claim.conflict_flags.overlapping_metadata_variant).length;
  if (overlapClaimsFlagged !== manifest.counts.overlap_claims_flagged) {
    throw new Error('Metadata-conflict flags differ from the independently reviewed count');
  }

  const catalog = SpiceJetScheduleReferenceCatalogSchema.parse({
    version: 1,
    kind: 'dgca-spicejet-approved-schedule-references',
    snapshotAsOfDate: manifest.snapshot_as_of_date,
    sourceDateWindowSemantics: 'inclusive-calendar-dates',
    selectable: false,
    actualOperationEstablished: false,
    dateAvailability: 'unknown',
    frequencyInterpretation: 'raw-only-unverified',
    timeBasis: 'unknown',
    source: {
      id: sourceId,
      title: source.name,
      url: source.url,
      sha256: manifest.source.sha256,
      bytes: manifest.source.bytes,
      pages: manifest.source.pages,
      publishedOn: source.publishedOn,
      checkedAt: source.checkedAt,
      reviewBy: source.reviewBy,
      attribution: 'Source: Directorate General of Civil Aviation (DGCA), “DGCA approved Summer 2026 SpiceJet domestic schedule”.',
      reusePolicyUrl: 'https://www.dgca.gov.in/digigov-portal/jsp/dgca/footerLink/WebsitePolicy.jsp',
      reusePolicyStatement: 'DGCA permits accurate, non-misleading reproduction with prominent attribution, except identified third-party material. The six reviewed pages had no identified third-party rights notice. This is not a CC-license or public-domain claim.',
    },
    carrierIdentity: {
      name: 'SpiceJet Limited',
      iataDesignator: 'SG',
      icaoCode: 'SEJ',
      identitySourceUrl: 'https://www.iata.org/en/about/members/airline-list/spicejet/532/',
      basis: 'The DGCA PDF labels the operator Spice Jet and its rows carry SEJ; IATA independently maps SG/SEJ to SpiceJet Limited. This establishes source attribution, not actual operation.',
    },
    counts: {
      currentReferences: references.length,
      currentVariants: current.length,
      expiredVariantsExcluded: expired.length,
      expiredOnlyIdentityKeysExcluded: expiredOnlyKeys.length,
      overlappingMetadataVariantPairs: manifest.counts.overlap_pairs,
      currentVariantsWithMetadataConflict,
      overlappingClaimsFlagged: overlapClaimsFlagged,
      conflictingCoreIdentityPairs: manifest.counts.overlap_pairs_conflicting_core_identity,
      currentIdentityKeysWithCounterparts,
      currentIdentityKeysWithoutCounterparts: references.length - currentIdentityKeysWithCounterparts,
      currentReferencesWithOtherDirectionalRoutes,
      sourceDesignatorsWithOtherDirectionalRoutes,
    },
    references,
  });

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`Prepared ${catalog.references.length} source references and ${catalog.counts.currentVariants} current variants for the shared DGCA adapter`);
}

build();
