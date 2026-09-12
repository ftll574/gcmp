import type { RouteNetworkCatalog, RouteNetworkEntry, RouteNetworkSource } from '../schemas/route-network.ts';
import { isCalendarDate } from '../calendar-date.ts';
import { ROUTE_FRESHNESS_BENCHMARKS } from './route-freshness.ts';

export type FlightNumberCoverageState = 'confirmed' | 'candidate-only' | 'unknown';
export type RouteCarrierIdentity = 'operating' | 'provider-listed';
export type AllianceId = 'oneworld' | 'star' | 'skyteam';
export type FlightNumberTargetScope = 'taiwan' | 'bounded-hub' | 'high-value';

export interface FlightNumberEvidenceRecord {
  readonly carrier: string;
  readonly pair: readonly [string, string];
  readonly flightNumber: string;
  readonly sourceId: string;
  readonly effectiveFrom: string;
  readonly effectiveUntil: string;
}

export interface FlightNumberHighValueTarget {
  readonly carrier: string;
  readonly pair: readonly [string, string];
}

export interface FlightNumberCoverageOptions {
  readonly targetNetwork?: RouteNetworkCatalog;
  readonly evidenceRecords?: ReadonlyArray<FlightNumberEvidenceRecord>;
  readonly highValueTargets?: ReadonlyArray<FlightNumberHighValueTarget>;
}

interface AllianceMembershipLike {
  readonly airline: string;
  readonly alliance: AllianceId;
  readonly status: string;
  readonly effectiveFrom?: string;
  readonly effectiveTo?: string;
}

interface AllianceCatalogLike {
  readonly memberships: ReadonlyArray<AllianceMembershipLike>;
}

interface AirportLike {
  readonly iata: string;
  readonly country: string;
}

export interface FlightNumberCoverageSlice {
  readonly trackedDirectionalRoutes: number;
  readonly confirmed: number;
  readonly candidateOnly: number;
  readonly unknown: number;
  readonly operating: number;
  readonly providerListed: number;
  readonly operatingCandidateOnly: number;
  readonly providerListedCandidateOnly: number;
}

export interface FlightNumberCoverageLedgerRow {
  readonly carrier: string;
  readonly alliance: AllianceId;
  readonly from: string;
  readonly to: string;
  readonly carrierIdentity: RouteCarrierIdentity;
  readonly numberStatus: FlightNumberCoverageState;
  readonly runtimePresent: boolean;
  readonly targetScopes: ReadonlyArray<FlightNumberTargetScope>;
  readonly flightNumbers: ReadonlyArray<string>;
  readonly flightNumberCandidates: ReadonlyArray<string>;
  readonly sourceIds: ReadonlyArray<string>;
  readonly flightNumberSourceIds: ReadonlyArray<string>;
  readonly flightNumberCandidateSourceIds: ReadonlyArray<string>;
  readonly flightNumberEvidence: ReadonlyArray<FlightNumberEvidenceSource>;
  readonly flightNumberCandidateEvidence: ReadonlyArray<FlightNumberSourceMetadata>;
  readonly effectiveFrom?: string;
  readonly effectiveUntil?: string;
}

export interface FlightNumberSourceMetadata {
  readonly id: string;
  readonly url: string;
  readonly checkedOn: string;
}

export interface FlightNumberEvidenceSource extends FlightNumberSourceMetadata {
  readonly flightNumber: string;
  readonly effectiveFrom: string;
  readonly effectiveUntil: string;
}

export interface FlightNumberCoverageReport {
  readonly asOf: string;
  readonly denominator: 'bounded-alliance-flight-number-targets';
  readonly globalCoverage: 'unknown';
  readonly globalCoverageReason: string;
  readonly allianceMemberCount: number;
  readonly total: FlightNumberCoverageSlice;
  readonly taiwan: FlightNumberCoverageSlice;
  readonly highValue: FlightNumberCoverageSlice;
  readonly boundedHubs: ReadonlyArray<{
    readonly alliance: AllianceId;
    readonly airports: ReadonlyArray<string>;
    readonly coverage: FlightNumberCoverageSlice;
  }>;
  readonly carriers: ReadonlyArray<{
    readonly carrier: string;
    readonly alliance: AllianceId;
    readonly coverage: FlightNumberCoverageSlice;
  }>;
  readonly ledger: ReadonlyArray<FlightNumberCoverageLedgerRow>;
}

function isActiveOn(route: RouteNetworkEntry, asOf: string): boolean {
  return route.status === 'published'
    && (!route.effectiveFrom || route.effectiveFrom <= asOf)
    && (!route.effectiveUntil || route.effectiveUntil >= asOf);
}

function activeMemberships(catalog: AllianceCatalogLike, asOf: string): AllianceMembershipLike[] {
  return catalog.memberships.filter((membership) =>
    membership.status === 'member'
    && (!membership.effectiveFrom || membership.effectiveFrom <= asOf)
    && (!membership.effectiveTo || membership.effectiveTo >= asOf));
}

function identityOf(route: RouteNetworkEntry): RouteCarrierIdentity {
  // Historical route layers predate the explicit field. Existing runtime
  // semantics treat every non-provider-listed row as independently operating.
  return route.carrierIdentity === 'provider-listed' ? 'provider-listed' : 'operating';
}

function routeKey(route: Pick<RouteNetworkEntry, 'carrier' | 'pair'>): string {
  return `${route.carrier}:${route.pair[0]}-${route.pair[1]}`;
}

function targetKey(target: FlightNumberHighValueTarget): string {
  return `${target.carrier}:${target.pair[0]}-${target.pair[1]}`;
}

function evidenceKey(record: Pick<FlightNumberEvidenceRecord, 'carrier' | 'pair' | 'flightNumber'>): string {
  return `${record.carrier}:${record.pair[0]}-${record.pair[1]}:${record.flightNumber}`;
}

function summarize(rows: ReadonlyArray<FlightNumberCoverageLedgerRow>): FlightNumberCoverageSlice {
  return {
    trackedDirectionalRoutes: rows.length,
    confirmed: rows.filter((row) => row.numberStatus === 'confirmed').length,
    candidateOnly: rows.filter((row) => row.numberStatus === 'candidate-only').length,
    unknown: rows.filter((row) => row.numberStatus === 'unknown').length,
    operating: rows.filter((row) => row.carrierIdentity === 'operating').length,
    providerListed: rows.filter((row) => row.carrierIdentity === 'provider-listed').length,
    operatingCandidateOnly: rows.filter((row) => row.carrierIdentity === 'operating' && row.numberStatus === 'candidate-only').length,
    providerListedCandidateOnly: rows.filter((row) => row.carrierIdentity === 'provider-listed' && row.numberStatus === 'candidate-only').length,
  };
}

function evidenceFor(
  records: ReadonlyArray<FlightNumberEvidenceRecord>,
  sourceById: ReadonlyMap<string, RouteNetworkSource>,
): FlightNumberEvidenceSource[] {
  return records.map((record) => {
    const source = sourceById.get(record.sourceId);
    if (!source) throw new Error(`Missing route-network source metadata: ${record.sourceId}`);
    return {
      flightNumber: record.flightNumber,
      id: source.id,
      url: source.url,
      checkedOn: source.checkedOn,
      effectiveFrom: record.effectiveFrom,
      effectiveUntil: record.effectiveUntil,
    };
  });
}

function sourceMetadataFor(
  sourceIds: ReadonlyArray<string>,
  sourceById: ReadonlyMap<string, RouteNetworkSource>,
): FlightNumberSourceMetadata[] {
  return sourceIds.map((id) => {
    const source = sourceById.get(id);
    if (!source) throw new Error(`Missing route-network source metadata: ${id}`);
    return { id: source.id, url: source.url, checkedOn: source.checkedOn };
  });
}

const HUB_ALLIANCE_BY_BENCHMARK = new Map<string, AllianceId>([
  ['oneworld-showcase-hubs', 'oneworld'],
  ['star-showcase-hubs', 'star'],
  ['skyteam-showcase-hubs', 'skyteam'],
]);

export const DEFAULT_HIGH_VALUE_FLIGHT_NUMBER_TARGETS: ReadonlyArray<FlightNumberHighValueTarget> = [
  { carrier: 'BR', pair: ['TPE', 'NRT'] },
  { carrier: 'CX', pair: ['TPE', 'HKG'] },
  { carrier: 'CI', pair: ['TPE', 'LAX'] },
  // Provider-listed long-haul relationship deliberately remains a target
  // even when runtime suppression removes it for lacking operating/number proof.
  { carrier: 'LH', pair: ['FRA', 'KUL'] },
];

export function summarizeFlightNumberCoverage(
  network: RouteNetworkCatalog,
  alliances: AllianceCatalogLike,
  airports: ReadonlyArray<AirportLike>,
  asOf: string,
  options: FlightNumberCoverageOptions = {},
): FlightNumberCoverageReport {
  if (!isCalendarDate(asOf)) throw new Error(`Invalid asOf date: ${asOf}`);

  const memberships = activeMemberships(alliances, asOf);
  const allianceByCarrier = new Map(memberships.map((row) => [row.airline, row.alliance] as const));
  const taiwanAirports = new Set(airports.filter((airport) => airport.country === 'TW').map((airport) => airport.iata));
  const targetNetwork = options.targetNetwork ?? network;
  const sourceById = new Map(targetNetwork.sources.map((source) => [source.id, source] as const));
  const runtimeKeys = new Set(network.routes.filter((route) => isActiveOn(route, asOf)).map(routeKey));
  const highValueKeys = new Set((options.highValueTargets ?? DEFAULT_HIGH_VALUE_FLIGHT_NUMBER_TARGETS).map(targetKey));
  const evidenceRecords = options.evidenceRecords ?? [];
  const activeEvidenceByRoute = new Map<string, FlightNumberEvidenceRecord[]>();
  for (const record of evidenceRecords) {
    if (!isCalendarDate(record.effectiveFrom) || !isCalendarDate(record.effectiveUntil) || record.effectiveFrom > record.effectiveUntil) {
      throw new Error(`Invalid flight-number evidence window: ${evidenceKey(record)}`);
    }
    if (record.effectiveFrom > asOf || record.effectiveUntil < asOf) continue;
    const key = `${record.carrier}:${record.pair[0]}-${record.pair[1]}`;
    const rows = activeEvidenceByRoute.get(key) ?? [];
    rows.push(record);
    activeEvidenceByRoute.set(key, rows);
  }

  const hubAirportsByAlliance = new Map<AllianceId, ReadonlySet<string>>(
    ROUTE_FRESHNESS_BENCHMARKS.map((benchmark) => [
      HUB_ALLIANCE_BY_BENCHMARK.get(benchmark.id)!,
      new Set(benchmark.airports),
    ]),
  );

  const ledger = targetNetwork.routes
    .filter((route) => isActiveOn(route, asOf) && allianceByCarrier.has(route.carrier))
    .flatMap((route): FlightNumberCoverageLedgerRow[] => {
      const alliance = allianceByCarrier.get(route.carrier)!;
      const hubSet = hubAirportsByAlliance.get(alliance)!;
      const scopes: FlightNumberTargetScope[] = [];
      if (taiwanAirports.has(route.pair[0]) || taiwanAirports.has(route.pair[1])) scopes.push('taiwan');
      if (hubSet.has(route.pair[0]) || hubSet.has(route.pair[1])) scopes.push('bounded-hub');
      if (highValueKeys.has(routeKey(route))) scopes.push('high-value');
      if (scopes.length === 0) return [];

      const exactEvidence = activeEvidenceByRoute.get(routeKey(route)) ?? [];
      const confirmedNumbers = [...new Set(exactEvidence.map((record) => record.flightNumber))].sort();
      const confirmedSet = new Set(confirmedNumbers);
      const candidateNumbers = [...new Set([
        ...(route.flightNumbers ?? []),
        ...(route.flightNumberCandidates ?? []),
      ])].filter((number) => !confirmedSet.has(number)).sort();
      const numberStatus: FlightNumberCoverageState = confirmedNumbers.length > 0
        ? 'confirmed'
        : candidateNumbers.length > 0 ? 'candidate-only' : 'unknown';
      const confirmedSourceIds = [...new Set(exactEvidence.map((record) => record.sourceId))];
      const hasDemotedConfirmedNumber = (route.flightNumbers ?? []).some((number) => !confirmedSet.has(number));
      const rawCandidateSourceIds = [...new Set([
        ...(hasDemotedConfirmedNumber ? route.flightNumberSourceIds ?? [] : []),
        ...(route.flightNumberCandidateSourceIds ?? []),
      ])];

      return [{
        carrier: route.carrier,
        alliance,
        from: route.pair[0],
        to: route.pair[1],
        carrierIdentity: identityOf(route),
        numberStatus,
        runtimePresent: runtimeKeys.has(routeKey(route)),
        targetScopes: scopes,
        flightNumbers: confirmedNumbers,
        flightNumberCandidates: candidateNumbers,
        sourceIds: route.sourceIds,
        flightNumberSourceIds: confirmedSourceIds,
        flightNumberCandidateSourceIds: rawCandidateSourceIds,
        flightNumberEvidence: evidenceFor(exactEvidence, sourceById),
        flightNumberCandidateEvidence: sourceMetadataFor(rawCandidateSourceIds, sourceById),
        ...(route.effectiveFrom ? { effectiveFrom: route.effectiveFrom } : {}),
        ...(route.effectiveUntil ? { effectiveUntil: route.effectiveUntil } : {}),
      }];
    })
    .sort((a, b) => a.carrier.localeCompare(b.carrier) || a.from.localeCompare(b.from) || a.to.localeCompare(b.to));

  const boundedHubs = ROUTE_FRESHNESS_BENCHMARKS.map((benchmark) => {
    const alliance = HUB_ALLIANCE_BY_BENCHMARK.get(benchmark.id)!;
    const hubSet = new Set(benchmark.airports);
    const rows = ledger.filter((row) => row.alliance === alliance && (hubSet.has(row.from) || hubSet.has(row.to)));
    return { alliance, airports: benchmark.airports, coverage: summarize(rows) };
  });

  return {
    asOf,
    denominator: 'bounded-alliance-flight-number-targets',
    globalCoverage: 'unknown',
    globalCoverageReason: 'GCMP does not have a complete operator-resolved global directional-route denominator for all 60 active alliance members; this report covers only the explicit Taiwan, bounded-hub and high-value audit target set.',
    allianceMemberCount: memberships.length,
    total: summarize(ledger),
    taiwan: summarize(ledger.filter((row) => row.targetScopes.includes('taiwan'))),
    highValue: summarize(ledger.filter((row) => row.targetScopes.includes('high-value'))),
    boundedHubs,
    carriers: memberships
      .map((membership) => ({
        carrier: membership.airline,
        alliance: membership.alliance,
        coverage: summarize(ledger.filter((row) => row.carrier === membership.airline)),
      }))
      .sort((a, b) => a.alliance.localeCompare(b.alliance) || a.carrier.localeCompare(b.carrier)),
    ledger,
  };
}
