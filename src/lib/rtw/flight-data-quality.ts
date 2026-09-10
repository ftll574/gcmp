import type { ScheduleCatalog } from '../schemas/flight-schedules.ts';
import type { OfficialScheduleCatalog } from '../schemas/published-schedules.ts';
import type { RouteNetworkCatalog, RouteNetworkEntry } from '../schemas/route-network.ts';
import { isScheduleActiveOn } from './schedule-days.ts';

function routeKey(carrier: string, from: string, to: string): string {
  return `${carrier}:${from}-${to}`;
}

function routeIsActive(route: RouteNetworkEntry, asOf: string): boolean {
  return route.status === 'published'
    && (!route.effectiveFrom || route.effectiveFrom <= asOf)
    && (!route.effectiveUntil || route.effectiveUntil >= asOf);
}

function percent(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Number(((numerator / denominator) * 100).toFixed(3));
}

function ageDays(checkedOn: string, asOf: string): number {
  return Math.max(0, Math.floor((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${checkedOn}T00:00:00Z`)) / 86_400_000));
}

export interface FlightDataCarrierQuality {
  readonly carrier: string;
  readonly activePublishedRoutes: number;
  readonly confirmedOperatingRoutes: number;
  readonly providerListedOnlyRoutes: number;
  readonly confirmedFlightNumberRoutes: number;
  readonly candidateOnlyFlightNumberRoutes: number;
  readonly activeDatedScheduleRoutes: number;
  readonly activeDatedCoveragePercent: number;
}

export interface FlightDataQualityReport {
  readonly asOf: string;
  readonly denominator: 'active-published-runtime-routes';
  readonly routeEvidence: {
    readonly activePublishedRoutes: number;
    readonly confirmedOperatingRoutes: number;
    readonly providerListedOnlyRoutes: number;
    readonly confirmedFlightNumberRoutes: number;
    readonly confirmedOperatingFlightNumberRoutes: number;
    readonly candidateOnlyFlightNumberRoutes: number;
  };
  readonly datedEvidence: {
    readonly catalogMatchedRoutes: number;
    readonly catalogCoveragePercent: number;
    readonly activeScheduleCatalogRoutes: number;
    readonly activeOfficialServiceRoutes: number;
    readonly activeDatedScheduleRoutes: number;
    readonly activeDatedCoveragePercent: number;
  };
  readonly freshness: {
    readonly referencedRouteSources: number;
    readonly routeSourcesOlderThan7Days: number;
    readonly routeSourcesOlderThan30Days: number;
    readonly oldestRouteSourceAgeDays: number;
    readonly officialSources: number;
    readonly officialSourcesFreshForAsOf: number;
    readonly officialSourcesExpiredForAsOf: number;
  };
  readonly carriers: ReadonlyArray<FlightDataCarrierQuality>;
}

/**
 * Evidence-quality audit over the runtime route denominator. Route discovery,
 * flight-number hints and date/operator proof deliberately remain separate:
 * a large route catalog cannot make dated coverage look complete.
 */
export function summarizeFlightDataQuality(
  network: RouteNetworkCatalog,
  schedules: ScheduleCatalog,
  official: OfficialScheduleCatalog,
  asOf: string,
): FlightDataQualityReport {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || Number.isNaN(Date.parse(`${asOf}T00:00:00Z`))) {
    throw new Error('asOf must be a real YYYY-MM-DD date');
  }

  const routes = network.routes.filter((route) => routeIsActive(route, asOf));
  const routeKeys = new Set(routes.map((route) => routeKey(route.carrier, route.pair[0], route.pair[1])));
  const catalogDatedKeys = new Set<string>();
  const activeScheduleKeys = new Set<string>();
  for (const row of schedules.entries) {
    if (row.status === 'suspended') continue;
    const key = routeKey(row.carrier, row.pair[0], row.pair[1]);
    catalogDatedKeys.add(key);
    if (isScheduleActiveOn(row, asOf)) activeScheduleKeys.add(key);
  }

  const asOfStart = Date.parse(`${asOf}T00:00:00Z`);
  const asOfEnd = asOfStart + 86_400_000 - 1;
  const sourceFresh = (sourceId: string): boolean => {
    const source = official.sources[sourceId];
    if (!source) return false;
    const checkedAt = Date.parse(source.checkedAt);
    return checkedAt <= asOfEnd && Date.parse(source.reviewBy) > asOfStart;
  };
  const activeOfficialKeys = new Set<string>();
  for (const row of official.services) {
    const key = routeKey(row.carrier, row.from, row.to);
    catalogDatedKeys.add(key);
    if (row.effectiveFrom <= asOf && row.effectiveUntil >= asOf && sourceFresh(row.sourceId)) activeOfficialKeys.add(key);
  }

  const catalogMatched = new Set([...catalogDatedKeys].filter((key) => routeKeys.has(key)));
  const activeDatedKeys = new Set([...activeScheduleKeys, ...activeOfficialKeys].filter((key) => routeKeys.has(key)));

  const referencedSourceIds = new Set(routes.flatMap((route) => [
    ...route.sourceIds,
    ...(route.flightNumberSourceIds ?? []),
    ...(route.flightNumberCandidateSourceIds ?? []),
  ]));
  const sourceById = new Map(network.sources.map((source) => [source.id, source] as const));
  const routeSourceAges = [...referencedSourceIds].flatMap((id) => {
    const source = sourceById.get(id);
    return source ? [ageDays(source.checkedOn, asOf)] : [];
  });
  const officialSources = Object.values(official.sources);

  const carriers = [...new Set(routes.map((route) => route.carrier))].map((carrier) => {
    const rows = routes.filter((route) => route.carrier === carrier);
    const dated = rows.filter((route) => activeDatedKeys.has(routeKey(route.carrier, route.pair[0], route.pair[1]))).length;
    return {
      carrier,
      activePublishedRoutes: rows.length,
      confirmedOperatingRoutes: rows.filter((route) => route.carrierIdentity !== 'provider-listed').length,
      providerListedOnlyRoutes: rows.filter((route) => route.carrierIdentity === 'provider-listed').length,
      confirmedFlightNumberRoutes: rows.filter((route) => (route.flightNumbers?.length ?? 0) > 0).length,
      candidateOnlyFlightNumberRoutes: rows.filter((route) => !(route.flightNumbers?.length) && (route.flightNumberCandidates?.length ?? 0) > 0).length,
      activeDatedScheduleRoutes: dated,
      activeDatedCoveragePercent: percent(dated, rows.length),
    } satisfies FlightDataCarrierQuality;
  }).sort((a, b) => a.activeDatedCoveragePercent - b.activeDatedCoveragePercent
    || b.activePublishedRoutes - a.activePublishedRoutes
    || a.carrier.localeCompare(b.carrier));

  const activePublishedRoutes = routes.length;
  return {
    asOf,
    denominator: 'active-published-runtime-routes',
    routeEvidence: {
      activePublishedRoutes,
      confirmedOperatingRoutes: routes.filter((route) => route.carrierIdentity !== 'provider-listed').length,
      providerListedOnlyRoutes: routes.filter((route) => route.carrierIdentity === 'provider-listed').length,
      confirmedFlightNumberRoutes: routes.filter((route) => (route.flightNumbers?.length ?? 0) > 0).length,
      confirmedOperatingFlightNumberRoutes: routes.filter((route) => route.carrierIdentity !== 'provider-listed' && (route.flightNumbers?.length ?? 0) > 0).length,
      candidateOnlyFlightNumberRoutes: routes.filter((route) => !(route.flightNumbers?.length) && (route.flightNumberCandidates?.length ?? 0) > 0).length,
    },
    datedEvidence: {
      catalogMatchedRoutes: catalogMatched.size,
      catalogCoveragePercent: percent(catalogMatched.size, activePublishedRoutes),
      activeScheduleCatalogRoutes: [...activeScheduleKeys].filter((key) => routeKeys.has(key)).length,
      activeOfficialServiceRoutes: [...activeOfficialKeys].filter((key) => routeKeys.has(key)).length,
      activeDatedScheduleRoutes: activeDatedKeys.size,
      activeDatedCoveragePercent: percent(activeDatedKeys.size, activePublishedRoutes),
    },
    freshness: {
      referencedRouteSources: routeSourceAges.length,
      routeSourcesOlderThan7Days: routeSourceAges.filter((age) => age > 7).length,
      routeSourcesOlderThan30Days: routeSourceAges.filter((age) => age > 30).length,
      oldestRouteSourceAgeDays: Math.max(0, ...routeSourceAges),
      officialSources: officialSources.length,
      officialSourcesFreshForAsOf: officialSources.filter((source) => {
        const checkedAt = Date.parse(source.checkedAt);
        return checkedAt <= asOfEnd && Date.parse(source.reviewBy) > asOfStart;
      }).length,
      officialSourcesExpiredForAsOf: officialSources.filter((source) => Date.parse(source.reviewBy) <= asOfStart).length,
    },
    carriers,
  };
}
