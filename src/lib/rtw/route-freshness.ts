import type { Airport } from '../types.ts';
import type { RouteNetworkCatalog, RouteNetworkEntry } from '../schemas/route-network.ts';
import { isCalendarDate } from '../calendar-date.ts';

export type RouteFreshnessState = 'current' | 'stale' | 'unknown';

export interface RouteFreshnessBenchmark {
  readonly id: 'oneworld-showcase-hubs' | 'star-showcase-hubs' | 'skyteam-showcase-hubs';
  readonly airports: ReadonlyArray<string>;
}

export const ROUTE_FRESHNESS_BENCHMARKS: ReadonlyArray<RouteFreshnessBenchmark> = [
  { id: 'oneworld-showcase-hubs', airports: ['HKG', 'LHR', 'JFK', 'LAX', 'NRT'] },
  { id: 'star-showcase-hubs', airports: ['NRT', 'LAX', 'SFO', 'EWR', 'FRA', 'IST', 'SIN'] },
  { id: 'skyteam-showcase-hubs', airports: ['ICN', 'LAX', 'ATL', 'CDG', 'HAN'] },
];

export interface RouteFreshnessSlice {
  readonly trackedDirectionalRoutes: number;
  readonly currentEvidenceRoutes: number;
  readonly staleEvidenceRoutes: number;
  readonly unknownEvidenceRoutes: number;
}

export interface RouteFreshnessReport {
  readonly asOf: string;
  readonly freshnessWindowDays: number;
  readonly denominator: 'active-published-runtime-routes';
  readonly globalCoverage: 'unknown';
  readonly carriers: number;
  readonly routes: RouteFreshnessSlice;
  readonly qualityFlags: {
    readonly duplicateDirectionalRoutes: number;
    readonly crossLayerConflicts: 'unknown-after-merge';
    readonly suspendedRoutes: number;
    readonly identityUnresolvedRoutes: number;
    readonly seasonalOrDatedRoutes: number;
    readonly providerListedOrMarketingOnlySuspects: number;
  };
  readonly sources: {
    readonly referencedSources: number;
    readonly sourcesCheckedAfterAsOf: number;
    readonly sourcesOlderThanFreshnessWindow: number;
    readonly oldestReferencedSourceAgeDays: number;
  };
  readonly taiwan: RouteFreshnessSlice & {
    readonly airportCodes: ReadonlyArray<string>;
    readonly representedAirportCodes: ReadonlyArray<string>;
  };
  readonly hubBenchmarks: ReadonlyArray<RouteFreshnessBenchmark & RouteFreshnessSlice>;
  readonly hubAirports: ReadonlyArray<{ readonly airport: string } & RouteFreshnessSlice>;
  readonly priorityUnknownRoutes: {
    readonly taiwan: ReadonlyArray<{ readonly carrier: string; readonly from: string; readonly to: string }>;
    readonly hubs: ReadonlyArray<{ readonly carrier: string; readonly from: string; readonly to: string }>;
  };
  readonly carriersByFreshness: ReadonlyArray<{
    readonly carrier: string;
    readonly current: number;
    readonly stale: number;
    readonly unknown: number;
  }>;
}

function ageDays(checkedOn: string, asOf: string): number {
  return Math.floor((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${checkedOn}T00:00:00Z`)) / 86_400_000);
}

function activePublished(route: RouteNetworkEntry, asOf: string): boolean {
  return route.status === 'published'
    && (!route.effectiveFrom || route.effectiveFrom <= asOf)
    && (!route.effectiveUntil || route.effectiveUntil >= asOf);
}

function key(route: RouteNetworkEntry): string {
  return `${route.carrier}:${route.pair[0]}-${route.pair[1]}`;
}

function slice(states: ReadonlyArray<RouteFreshnessState>): RouteFreshnessSlice {
  return {
    trackedDirectionalRoutes: states.length,
    currentEvidenceRoutes: states.filter((state) => state === 'current').length,
    staleEvidenceRoutes: states.filter((state) => state === 'stale').length,
    unknownEvidenceRoutes: states.filter((state) => state === 'unknown').length,
  };
}

/**
 * Classify freshness without upgrading discovery evidence into operating proof.
 * Provider-listed rows always remain unknown. Confirmed-operating rows are
 * current only when at least one route source was checked within the bounded
 * freshness window; otherwise they are stale and require review.
 */
export function classifyRouteFreshness(
  route: RouteNetworkEntry,
  sourceCheckedOn: ReadonlyMap<string, string>,
  asOf: string,
  freshnessWindowDays = 30,
): RouteFreshnessState {
  if (!isCalendarDate(asOf)) throw new Error('asOf must be a real YYYY-MM-DD date');
  if (!Number.isInteger(freshnessWindowDays) || freshnessWindowDays < 1) {
    throw new Error('freshnessWindowDays must be a positive integer');
  }
  if (route.carrierIdentity === 'provider-listed') return 'unknown';
  const ages = route.sourceIds
    .map((sourceId) => sourceCheckedOn.get(sourceId))
    .filter((checkedOn): checkedOn is string => checkedOn !== undefined)
    .map((checkedOn) => ageDays(checkedOn, asOf))
    .filter((age) => age >= 0);
  if (ages.some((age) => age <= freshnessWindowDays)) return 'current';
  return 'stale';
}

export function summarizeRouteFreshness(
  network: RouteNetworkCatalog,
  airports: ReadonlyArray<Airport>,
  asOf: string,
  freshnessWindowDays = 30,
  benchmarks: ReadonlyArray<RouteFreshnessBenchmark> = ROUTE_FRESHNESS_BENCHMARKS,
): RouteFreshnessReport {
  if (!isCalendarDate(asOf)) throw new Error('asOf must be a real YYYY-MM-DD date');
  if (!Number.isInteger(freshnessWindowDays) || freshnessWindowDays < 1) {
    throw new Error('freshnessWindowDays must be a positive integer');
  }
  const sourceCheckedOn = new Map(network.sources.map((source) => [source.id, source.checkedOn] as const));
  const active = network.routes.filter((route) => activePublished(route, asOf));
  const stateByKey = new Map(active.map((route) => [
    key(route),
    classifyRouteFreshness(route, sourceCheckedOn, asOf, freshnessWindowDays),
  ] as const));
  const states = active.map((route) => stateByKey.get(key(route))!);

  const routeKeys = active.map(key);
  const duplicateDirectionalRoutes = routeKeys.length - new Set(routeKeys).size;
  const referencedSourceIds = new Set(active.flatMap((route) => route.sourceIds));
  const referencedAges = [...referencedSourceIds].flatMap((sourceId) => {
    const checkedOn = sourceCheckedOn.get(sourceId);
    return checkedOn ? [ageDays(checkedOn, asOf)] : [];
  });

  const taiwanAirportCodes = airports.filter((airport) => airport.country === 'TW').map((airport) => airport.iata).sort();
  const taiwanSet = new Set(taiwanAirportCodes);
  const taiwanRoutes = active.filter((route) => taiwanSet.has(route.pair[0]) || taiwanSet.has(route.pair[1]));
  const representedTaiwan = new Set<string>();
  for (const route of taiwanRoutes) {
    if (taiwanSet.has(route.pair[0])) representedTaiwan.add(route.pair[0]);
    if (taiwanSet.has(route.pair[1])) representedTaiwan.add(route.pair[1]);
  }

  const carriersByFreshness = [...new Set(active.map((route) => route.carrier))]
    .map((carrier) => {
      const carrierStates = active.filter((route) => route.carrier === carrier).map((route) => stateByKey.get(key(route))!);
      return {
        carrier,
        current: carrierStates.filter((state) => state === 'current').length,
        stale: carrierStates.filter((state) => state === 'stale').length,
        unknown: carrierStates.filter((state) => state === 'unknown').length,
      };
    })
    .sort((a, b) => b.unknown - a.unknown || b.stale - a.stale || a.carrier.localeCompare(b.carrier));
  const benchmarkAirportSet = new Set(benchmarks.flatMap((benchmark) => benchmark.airports));
  const unknownRow = (route: RouteNetworkEntry) => ({ carrier: route.carrier, from: route.pair[0], to: route.pair[1] });
  const unknownSort = (a: ReturnType<typeof unknownRow>, b: ReturnType<typeof unknownRow>) =>
    a.carrier.localeCompare(b.carrier) || a.from.localeCompare(b.from) || a.to.localeCompare(b.to);

  return {
    asOf,
    freshnessWindowDays,
    denominator: 'active-published-runtime-routes',
    globalCoverage: 'unknown',
    carriers: new Set(active.map((route) => route.carrier)).size,
    routes: slice(states),
    qualityFlags: {
      duplicateDirectionalRoutes,
      crossLayerConflicts: 'unknown-after-merge',
      suspendedRoutes: network.routes.filter((route) => route.status === 'suspended').length,
      identityUnresolvedRoutes: network.routes.filter((route) => route.status === 'identity-unresolved').length,
      seasonalOrDatedRoutes: network.routes.filter((route) => route.effectiveFrom || route.effectiveUntil).length,
      providerListedOrMarketingOnlySuspects: active.filter((route) => route.carrierIdentity === 'provider-listed').length,
    },
    sources: {
      referencedSources: referencedAges.length,
      sourcesCheckedAfterAsOf: referencedAges.filter((age) => age < 0).length,
      sourcesOlderThanFreshnessWindow: referencedAges.filter((age) => age > freshnessWindowDays).length,
      oldestReferencedSourceAgeDays: Math.max(0, ...referencedAges),
    },
    taiwan: {
      ...slice(taiwanRoutes.map((route) => stateByKey.get(key(route))!)),
      airportCodes: taiwanAirportCodes,
      representedAirportCodes: [...representedTaiwan].sort(),
    },
    hubBenchmarks: benchmarks.map((benchmark) => {
      const hubSet = new Set(benchmark.airports);
      const hubRoutes = active.filter((route) => hubSet.has(route.pair[0]) || hubSet.has(route.pair[1]));
      return {
        ...benchmark,
        ...slice(hubRoutes.map((route) => stateByKey.get(key(route))!)),
      };
    }),
    hubAirports: [...benchmarkAirportSet]
      .sort()
      .map((airport) => {
        const airportRoutes = active.filter((route) => route.pair[0] === airport || route.pair[1] === airport);
        return {
          airport,
          ...slice(airportRoutes.map((route) => stateByKey.get(key(route))!)),
        };
      }),
    priorityUnknownRoutes: {
      taiwan: taiwanRoutes
        .filter((route) => stateByKey.get(key(route)) === 'unknown')
        .map(unknownRow)
        .sort(unknownSort),
      hubs: active
        .filter((route) => stateByKey.get(key(route)) === 'unknown'
          && (benchmarkAirportSet.has(route.pair[0]) || benchmarkAirportSet.has(route.pair[1])))
        .map(unknownRow)
        .sort(unknownSort)
        .slice(0, 100),
    },
    carriersByFreshness,
  };
}
