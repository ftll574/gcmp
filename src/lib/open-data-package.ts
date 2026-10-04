/** Isolated package: pinned source -> qualified fields -> deterministic files.
 * Never imports existing curated catalogs or calls network/provider fallbacks.
 */
export const AIRPORT_FIELDS = ['iata', 'icao', 'name', 'city', 'country', 'lat', 'lon'] as const;
export interface OpenSource {
  id: string; url: string; snapshotPath: string; snapshotSHA256: string; rawSHA256: string;
  retrievedOn: string; license: string; licenseEvidenceUrl: string; grant: string;
  commercialUse: boolean; redistribution: boolean; attribution: string;
  attributionRequired: boolean; allowedEntity: string; fields: string[]; transform: string;
}
export interface OpenPolicy {
  version: number; profile: string; source: OpenSource;
  network: { enabled: boolean; fallbacks: string[] }; rawSnapshotsIncluded: boolean;
  held: unknown[]; futureSources: unknown[]; codeLicense: string; dataLicense: string;
}
export interface AirportRow {
  rowId: string; iata: string; icao: string; name: string; city: string; country: string;
  lat: number; lon: number;
}
export interface OpenSnapshot {
  sourceId: string; sourceUrl: string; retrievedOn: string; rawSHA256: string;
  rawRows: number; selection: string; records: AirportRow[];
}
export interface FieldProof { sourceId: string; snapshotSHA256: string; rowId: string; transform: string }
export interface FieldCandidate { entity: string; fields: Record<string, unknown>; provenance: Record<string, FieldProof[]> }
const fail = (message: string): never => { throw new Error(`Open-data eligibility: ${message}`); };
export function validatePolicy(policy: OpenPolicy): void {
  const s = policy.source;
  if (policy.version !== 1 || policy.profile !== 'gcmp-open-data-airport-base-v1') fail('unknown profile');
  // A config cannot self-approve a new provider or relax this source-specific grant.
  if (s.id !== 'ourairports-public-domain-20261001' ||
      s.url !== 'https://davidmegginson.github.io/ourairports-data/airports.csv' ||
      s.licenseEvidenceUrl !== 'https://ourairports.com/data/' || s.license !== 'public-domain') fail('unknown source/license');
  if (s.commercialUse !== true || s.redistribution !== true || !s.grant?.trim()) fail('grant incomplete');
  if (!s.attribution?.trim()) fail('package attribution missing');
  if (s.allowedEntity !== 'airports' || s.transform !== 'ourairports-base-selection-v1' ||
      JSON.stringify(s.fields) !== JSON.stringify(AIRPORT_FIELDS)) fail('unapproved entity/fields/transform');
  if (s.snapshotSHA256 !== '517dfd764137e8143d9aa9aef1ace2f09aec34c70c1af99854d1e9b3c4764d6d' ||
      s.rawSHA256 !== '7a3fe6ee4a451469cb3197d43ad71838b587dc4bca8bef98728d779d2a475722') fail('unreviewed content pin');
  if (s.snapshotPath !== 'scripts/data/open-data/ourairports-20261001.json' || s.retrievedOn !== '2026-10-01') fail('unknown snapshot');
  if (policy.network.enabled || policy.network.fallbacks.length || policy.rawSnapshotsIncluded) fail('network/raw inclusion forbidden');
}
export function checkCandidate(candidate: FieldCandidate, policy: OpenPolicy, originals: Map<string, AirportRow>): void {
  validatePolicy(policy);
  if (candidate.entity !== policy.source.allowedEntity) fail('entity has no qualified source');
  if (JSON.stringify(Object.keys(candidate.fields).sort()) !== JSON.stringify([...AIRPORT_FIELDS].sort())) fail('missing/extra fields');
  for (const field of AIRPORT_FIELDS) {
    const proofs = candidate.provenance[field] ?? [];
    if (!proofs.length) fail(`missing lineage: ${field}`);
    for (const proof of proofs) {
      if (proof.sourceId !== policy.source.id || proof.snapshotSHA256 !== policy.source.snapshotSHA256 ||
          proof.transform !== policy.source.transform) fail(`unknown/mixed lineage: ${field}`);
      const row = originals.get(proof.rowId);
      if (!row || row[field] !== candidate.fields[field]) fail(`field not independently reproduced: ${field}`);
    }
  }
}
export function buildOpenPackage(policy: OpenPolicy, snapshot: OpenSnapshot): Record<string, string> {
  validatePolicy(policy);
  if (snapshot.sourceId !== policy.source.id || snapshot.sourceUrl !== policy.source.url ||
      snapshot.rawSHA256 !== policy.source.rawSHA256 || snapshot.retrievedOn !== policy.source.retrievedOn) fail('snapshot origin mismatch');
  if (!snapshot.records.length) fail('empty airport snapshot');
  const rows = [...snapshot.records].sort((a, b) => a.iata < b.iata ? -1 : a.iata > b.iata ? 1 : 0);
  const originals = new Map(rows.map(row => [row.rowId, row]));
  if (originals.size !== rows.length || new Set(rows.map(row => row.iata)).size !== rows.length) fail('duplicate row/IATA');
  const airports: Record<string, unknown>[] = [];
  const provenance: unknown[] = [];
  for (const row of rows) {
    if (!/^[A-Z]{3}$/.test(row.iata) || !/^[A-Z]{2}$/.test(row.country) ||
        !Number.isFinite(row.lat) || Math.abs(row.lat) > 90 || !Number.isFinite(row.lon) || Math.abs(row.lon) > 180 || !row.name) fail('invalid airport');
    const fields = Object.fromEntries(AIRPORT_FIELDS.map(field => [field, row[field]]));
    const proof = { sourceId: policy.source.id, snapshotSHA256: policy.source.snapshotSHA256, rowId: row.rowId, transform: policy.source.transform };
    const lineage = Object.fromEntries(AIRPORT_FIELDS.map(field => [field, [proof]]));
    checkCandidate({ entity: 'airports', fields, provenance: lineage }, policy, originals);
    airports.push(fields);
    // One common proof plus explicit field list is the full field-level lineage.
    provenance.push({ key: row.iata, fields: [...AIRPORT_FIELDS], ...proof });
  }
  const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
  return {
    'airports.json': json(airports),
    'provenance.json': json({ version: 1, airports: provenance, routes: [], schedules: [] }),
    'routes.json': json({ version: 1, coverage: 'no-qualified-current-route-input', sources: [], routes: [] }),
    'schedules.json': json({ version: 1, sources: {}, services: [], flightNumberReferences: [] }),
    'config.json': json({ profile: policy.profile, network: { enabled: false, fallbacks: [] }, liveRoutes: false, scheduleGateway: false, dataFiles: ['airports.json', 'routes.json', 'schedules.json'], defaultRuntimeReplacement: false }),
    'metadata.json': json({ version: 1, profile: policy.profile, sources: [policy.source], counts: { airports: airports.length, routes: 0, services: 0, flightNumberReferences: 0 }, heldSources: policy.held, futureSources: policy.futureSources, rawSnapshotsIncluded: false, limitations: ['Airport existence and coordinates only; no passenger service, carrier, date or flight-number claims.', 'Existing app is unchanged. Do not point the existing app at this package without a separate integration review.', 'No complete planner data bundle: ticketing rules, maps, airlines and existing app assets are outside this package grant.', 'No ODbL derivative/combination legal clearance asserted.'] }),
    'DATA_NOTICES.md': `# GCMP isolated open-data package\n\n${policy.source.attribution}\n\nData: OurAirports original airport fields, public domain. Grant: ${policy.source.licenseEvidenceUrl}\nSource: ${policy.source.url}\nSnapshot SHA-256: ${policy.source.snapshotSHA256}\nOriginal CSV SHA-256: ${policy.source.rawSHA256}\n\nNo raw PDF, HTML, provider snapshot, existing curated route/schedule catalog or live API is included.\nCode remains MIT under the repository LICENSE; this package notice does not change repository DATA_LICENSE.\n`,
  };
}

/** Exact allowlist closes hidden raw files, legacy references and config tampering. */
export function verifyPackageContents(expected: Record<string, string>, actual: Record<string, string>): void {
  if (JSON.stringify(Object.keys(expected).sort()) !== JSON.stringify(Object.keys(actual).sort())) fail('unexpected/missing package files');
  for (const name of Object.keys(expected)) {
    if (actual[name] !== expected[name]) fail(`eligibility/reproducibility mismatch: ${name}`);
  }
}
