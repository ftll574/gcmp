import type { RouteNetworkCatalog, RouteNetworkEntry } from '../schemas/route-network.ts';
import { isCalendarDate } from '../calendar-date.ts';
import { ROUTE_FRESHNESS_BENCHMARKS } from './route-freshness.ts';

export type FlightNumberCoverageState = 'confirmed' | 'candidate-only' | 'missing';
export type RouteCarrierIdentity = 'operating' | 'provider-listed';
export type AllianceId = 'oneworld' | 'star' | 'skyteam';

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
  readonly missing: number;
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
  readonly flightNumbers: ReadonlyArray<string>;
  readonly flightNumberCandidates: ReadonlyArray<string>;
  readonly sourceIds: ReadonlyArray<string>;
  readonly flightNumberSourceIds: ReadonlyArray<string>;
  readonly flightNumberCandidateSourceIds: ReadonlyArray<string>;
  readonly effectiveFrom?: string;
  readonly effectiveUntil?: string;
}

export interface FlightNumberCoverageReport {
  readonly asOf: string;
  readonly denominator: 'active-published-runtime-alliance-routes';
  readonly globalCoverage: 'unknown';
  readonly globalCoverageReason: string;
  readonly allianceMemberCount: number;
  readonly total: FlightNumberCoverageSlice;
  readonly taiwan: FlightNumberCoverageSlice;
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

function numberStateOf(route: RouteNetworkEntry): FlightNumberCoverageState {
  if ((route.flightNumbers?.length ?? 0) > 0) return 'confirmed';
  if ((route.flightNumberCandidates?.length ?? 0) > 0) return 'candidate-only';
  return 'missing';
}

function summarize(rows: ReadonlyArray<FlightNumberCoverageLedgerRow>): FlightNumberCoverageSlice {
  return {
    trackedDirectionalRoutes: rows.length,
    confirmed: rows.filter((row) => row.numberStatus === 'confirmed').length,
    candidateOnly: rows.filter((row) => row.numberStatus === 'candidate-only').length,
    missing: rows.filter((row) => row.numberStatus === 'missing').length,
    operating: rows.filter((row) => row.carrierIdentity === 'operating').length,
    providerListed: rows.filter((row) => row.carrierIdentity === 'provider-listed').length,
    operatingCandidateOnly: rows.filter((row) => row.carrierIdentity === 'operating' && row.numberStatus === 'candidate-only').length,
    providerListedCandidateOnly: rows.filter((row) => row.carrierIdentity === 'provider-listed' && row.numberStatus === 'candidate-only').length,
  };
}

const HUB_ALLIANCE_BY_BENCHMARK = new Map<string, AllianceId>([
  ['oneworld-showcase-hubs', 'oneworld'],
  ['star-showcase-hubs', 'star'],
  ['skyteam-showcase-hubs', 'skyteam'],
]);

export function summarizeFlightNumberCoverage(
  network: RouteNetworkCatalog,
  alliances: AllianceCatalogLike,
  airports: ReadonlyArray<AirportLike>,
  asOf: string,
): FlightNumberCoverageReport {
  if (!isCalendarDate(asOf)) throw new Error(`Invalid asOf date: ${asOf}`);

  const memberships = activeMemberships(alliances, asOf);
  const allianceByCarrier = new Map(memberships.map((row) => [row.airline, row.alliance] as const));
  const taiwanAirports = new Set(airports.filter((airport) => airport.country === 'TW').map((airport) => airport.iata));

  const ledger = network.routes
    .filter((route) => isActiveOn(route, asOf) && allianceByCarrier.has(route.carrier))
    .map((route): FlightNumberCoverageLedgerRow => ({
      carrier: route.carrier,
      alliance: allianceByCarrier.get(route.carrier)!,
      from: route.pair[0],
      to: route.pair[1],
      carrierIdentity: identityOf(route),
      numberStatus: numberStateOf(route),
      flightNumbers: route.flightNumbers ?? [],
      flightNumberCandidates: route.flightNumberCandidates ?? [],
      sourceIds: route.sourceIds,
      flightNumberSourceIds: route.flightNumberSourceIds ?? [],
      flightNumberCandidateSourceIds: route.flightNumberCandidateSourceIds ?? [],
      ...(route.effectiveFrom ? { effectiveFrom: route.effectiveFrom } : {}),
      ...(route.effectiveUntil ? { effectiveUntil: route.effectiveUntil } : {}),
    }))
    .sort((a, b) => a.carrier.localeCompare(b.carrier) || a.from.localeCompare(b.from) || a.to.localeCompare(b.to));

  const boundedHubs = ROUTE_FRESHNESS_BENCHMARKS.map((benchmark) => {
    const alliance = HUB_ALLIANCE_BY_BENCHMARK.get(benchmark.id)!;
    const hubSet = new Set(benchmark.airports);
    const rows = ledger.filter((row) => row.alliance === alliance && (hubSet.has(row.from) || hubSet.has(row.to)));
    return { alliance, airports: benchmark.airports, coverage: summarize(rows) };
  });

  return {
    asOf,
    denominator: 'active-published-runtime-alliance-routes',
    globalCoverage: 'unknown',
    globalCoverageReason: 'GCMP does not have a complete operator-resolved global directional-route denominator for all 60 active alliance members; catalog percentages describe the active runtime catalog only.',
    allianceMemberCount: memberships.length,
    total: summarize(ledger),
    taiwan: summarize(ledger.filter((row) => taiwanAirports.has(row.from) || taiwanAirports.has(row.to))),
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
