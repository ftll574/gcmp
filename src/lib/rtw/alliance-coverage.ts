import type { AllianceCatalog } from '../schemas/alliance.ts';
import type { ScheduleCatalog } from '../schemas/flight-schedules.ts';
import type { OfficialScheduleCatalog } from '../schemas/published-schedules.ts';
import type { RouteNetworkCatalog } from '../schemas/route-network.ts';

export type CoverageAlliance = 'oneworld' | 'star' | 'skyteam';

export interface CarrierCoverageSummary {
  carrier: string;
  routeUniverseScope: 'untracked' | 'partial' | 'complete';
  directionalRouteDenominator: number | null;
  knownDirectionalRoutes: number;
  confirmedOperatingDirectionalRoutes: number;
  providerListedOnlyDirectionalRoutes: number;
  knownDirectionalRoutesWithScheduleEvidence: number;
  knownRouteScheduleCoveragePercent: number;
}

export interface AllianceCoverageSummary {
  alliance: CoverageAlliance;
  asOf: string;
  globalRouteUniverseKnown: false;
  globalRouteCoveragePercent: null;
  memberAirlines: number;
  memberAirlinesWithRouteEvidence: number;
  memberAirlineCoveragePercent: number;
  memberAirlinesWithConfirmedOperatingEvidence: number;
  memberAirlineConfirmedOperatingCoveragePercent: number;
  memberCarriersWithPartialRouteUniverse: number;
  memberCarriersWithCompleteRouteUniverse: number;
  carriersWithCompleteRouteUniverse: ReadonlyArray<string>;
  knownDirectionalRoutes: number;
  confirmedOperatingDirectionalRoutes: number;
  providerListedOnlyDirectionalRoutes: number;
  knownDirectionalRoutesWithScheduleEvidence: number;
  knownRouteScheduleCoveragePercent: number;
  carriersWithoutRouteEvidence: ReadonlyArray<string>;
  carriers: ReadonlyArray<CarrierCoverageSummary>;
}

export interface AllianceRouteEvidence {
  carrier: string;
  from: string;
  to: string;
  hasScheduleEvidence: boolean;
  identityStatus: 'confirmed-operating' | 'provider-listed';
}

function activeOn(date: string, from?: string, until?: string | null): boolean {
  return (!from || date >= from) && (!until || date <= until);
}

function percent(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 1000) / 10;
}

function routeKey(carrier: string, from: string, to: string): string {
  return `${carrier}:${from}-${to}`;
}

function carrierFromRouteKey(key: string): string {
  return key.slice(0, key.indexOf(':'));
}

export function collectAllianceRouteEvidence(
  allianceCatalog: AllianceCatalog,
  routeNetwork: RouteNetworkCatalog,
  scheduleCatalog: ScheduleCatalog,
  alliance: CoverageAlliance,
  asOf: string,
  officialScheduleCatalog?: OfficialScheduleCatalog,
): ReadonlyArray<AllianceRouteEvidence> {
  const members = allianceCatalog.memberships
    .filter((item) => item.alliance === alliance && item.status === 'member' && activeOn(asOf, item.effectiveFrom, item.effectiveTo))
    .map((item) => item.airline);
  const memberSet = new Set(members);
  const evidence = new Map<string, AllianceRouteEvidence>();
  const add = (
    carrier: string,
    from: string,
    to: string,
    hasScheduleEvidence: boolean,
    identityStatus: AllianceRouteEvidence['identityStatus'],
  ) => {
    if (!memberSet.has(carrier)) return;
    const key = routeKey(carrier, from, to);
    const current = evidence.get(key);
    evidence.set(key, {
      carrier,
      from,
      to,
      hasScheduleEvidence: hasScheduleEvidence || current?.hasScheduleEvidence === true,
      identityStatus: identityStatus === 'confirmed-operating' || current?.identityStatus === 'confirmed-operating'
        ? 'confirmed-operating'
        : 'provider-listed',
    });
  };

  for (const route of routeNetwork.routes) {
    if (route.status !== 'published' || !activeOn(asOf, route.effectiveFrom, route.effectiveUntil)) continue;
    add(
      route.carrier,
      route.pair[0],
      route.pair[1],
      false,
      route.carrierIdentity === 'provider-listed' ? 'provider-listed' : 'confirmed-operating',
    );
  }
  for (const entry of scheduleCatalog.entries) {
    if (entry.status === 'suspended' || entry.confidence !== 'chart-verified' || !activeOn(asOf, entry.effectiveFrom, entry.effectiveUntil)) continue;
    add(entry.carrier, entry.pair[0], entry.pair[1], true, 'confirmed-operating');
  }
  for (const entry of officialScheduleCatalog?.services ?? []) {
    if (!activeOn(asOf, entry.effectiveFrom, entry.effectiveUntil)) continue;
    add(entry.carrier, entry.from, entry.to, true, 'confirmed-operating');
  }
  for (const entry of officialScheduleCatalog?.flightNumberReferences ?? []) {
    const source = officialScheduleCatalog?.sources[entry.sourceId];
    if (!source || source.checkedAt.slice(0, 10) > asOf || source.reviewBy.slice(0, 10) <= asOf) continue;
    // A published designator reference can establish that the airline lists
    // the route, but not necessarily that the member airline operates it.
    add(entry.carrier, entry.from, entry.to, false, 'provider-listed');
  }
  return [...evidence.values()].sort((a, b) => a.carrier.localeCompare(b.carrier) || a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
}

export function summarizeAllianceCoverage(
  allianceCatalog: AllianceCatalog,
  routeNetwork: RouteNetworkCatalog,
  scheduleCatalog: ScheduleCatalog,
  alliance: CoverageAlliance,
  asOf: string,
  officialScheduleCatalog?: OfficialScheduleCatalog,
): AllianceCoverageSummary {
  const members = allianceCatalog.memberships
    .filter((item) => item.alliance === alliance && item.status === 'member' && activeOn(asOf, item.effectiveFrom, item.effectiveTo))
    .map((item) => item.airline);
  const memberSet = new Set(members);
  const carrierUniversesByCarrier = new Map<string, RouteNetworkCatalog['carrierUniverses'][number]>();
  for (const universe of routeNetwork.carrierUniverses) {
    if (!memberSet.has(universe.carrier) || universe.asOf > asOf) continue;
    const current = carrierUniversesByCarrier.get(universe.carrier);
    if (!current || current.asOf < universe.asOf) carrierUniversesByCarrier.set(universe.carrier, universe);
  }
  const carrierUniverses = [...carrierUniversesByCarrier.values()];
  const completeUniverseCarriers = carrierUniverses
    .filter((universe) => universe.scope === 'complete')
    .map((universe) => universe.carrier)
    .sort();

  const routeEvidence = collectAllianceRouteEvidence(
    allianceCatalog,
    routeNetwork,
    scheduleCatalog,
    alliance,
    asOf,
    officialScheduleCatalog,
  );
  const knownRoutes = new Set(routeEvidence.map((route) => routeKey(route.carrier, route.from, route.to)));
  const confirmedOperatingRoutes = new Set(routeEvidence
    .filter((route) => route.identityStatus === 'confirmed-operating')
    .map((route) => routeKey(route.carrier, route.from, route.to)));
  const providerListedOnlyRoutes = new Set(routeEvidence
    .filter((route) => route.identityStatus === 'provider-listed')
    .map((route) => routeKey(route.carrier, route.from, route.to)));
  const scheduled = new Set(routeEvidence.filter((route) => route.hasScheduleEvidence).map((route) => routeKey(route.carrier, route.from, route.to)));
  const routeCarriers = new Set([...knownRoutes].map(carrierFromRouteKey));
  const confirmedOperatingCarriers = new Set([...confirmedOperatingRoutes].map(carrierFromRouteKey));
  const knownRoutesByCarrier = new Map<string, number>();
  const confirmedOperatingRoutesByCarrier = new Map<string, number>();
  const providerListedOnlyRoutesByCarrier = new Map<string, number>();
  const scheduledRoutesByCarrier = new Map<string, number>();
  for (const key of knownRoutes) {
    const carrier = carrierFromRouteKey(key);
    knownRoutesByCarrier.set(carrier, (knownRoutesByCarrier.get(carrier) ?? 0) + 1);
  }
  for (const key of confirmedOperatingRoutes) {
    const carrier = carrierFromRouteKey(key);
    confirmedOperatingRoutesByCarrier.set(carrier, (confirmedOperatingRoutesByCarrier.get(carrier) ?? 0) + 1);
  }
  for (const key of providerListedOnlyRoutes) {
    const carrier = carrierFromRouteKey(key);
    providerListedOnlyRoutesByCarrier.set(carrier, (providerListedOnlyRoutesByCarrier.get(carrier) ?? 0) + 1);
  }
  for (const key of scheduled) {
    const carrier = carrierFromRouteKey(key);
    scheduledRoutesByCarrier.set(carrier, (scheduledRoutesByCarrier.get(carrier) ?? 0) + 1);
  }
  const carriers = members.map((carrier): CarrierCoverageSummary => {
    const universe = carrierUniversesByCarrier.get(carrier);
    const knownDirectionalRoutes = knownRoutesByCarrier.get(carrier) ?? 0;
    const confirmedOperatingDirectionalRoutes = confirmedOperatingRoutesByCarrier.get(carrier) ?? 0;
    const providerListedOnlyDirectionalRoutes = providerListedOnlyRoutesByCarrier.get(carrier) ?? 0;
    const knownDirectionalRoutesWithScheduleEvidence = scheduledRoutesByCarrier.get(carrier) ?? 0;
    return {
      carrier,
      routeUniverseScope: universe?.scope ?? 'untracked',
      directionalRouteDenominator: universe?.scope === 'complete' ? (universe.directionalRouteDenominator ?? null) : null,
      knownDirectionalRoutes,
      confirmedOperatingDirectionalRoutes,
      providerListedOnlyDirectionalRoutes,
      knownDirectionalRoutesWithScheduleEvidence,
      knownRouteScheduleCoveragePercent: percent(knownDirectionalRoutesWithScheduleEvidence, knownDirectionalRoutes),
    };
  }).sort((a, b) => a.knownDirectionalRoutes - b.knownDirectionalRoutes || a.carrier.localeCompare(b.carrier));

  return {
    alliance,
    asOf,
    // route-network/current.json explicitly says curated-not-complete. Until a
    // complete alliance route denominator exists, a global percentage would
    // be false precision and must remain unknown.
    globalRouteUniverseKnown: false,
    globalRouteCoveragePercent: null,
    memberAirlines: members.length,
    memberAirlinesWithRouteEvidence: routeCarriers.size,
    memberAirlineCoveragePercent: percent(routeCarriers.size, members.length),
    memberAirlinesWithConfirmedOperatingEvidence: confirmedOperatingCarriers.size,
    memberAirlineConfirmedOperatingCoveragePercent: percent(confirmedOperatingCarriers.size, members.length),
    memberCarriersWithPartialRouteUniverse: carrierUniverses.filter((universe) => universe.scope === 'partial').length,
    memberCarriersWithCompleteRouteUniverse: completeUniverseCarriers.length,
    carriersWithCompleteRouteUniverse: completeUniverseCarriers,
    knownDirectionalRoutes: knownRoutes.size,
    confirmedOperatingDirectionalRoutes: confirmedOperatingRoutes.size,
    providerListedOnlyDirectionalRoutes: providerListedOnlyRoutes.size,
    knownDirectionalRoutesWithScheduleEvidence: scheduled.size,
    knownRouteScheduleCoveragePercent: percent(scheduled.size, knownRoutes.size),
    carriersWithoutRouteEvidence: members.filter((carrier) => !routeCarriers.has(carrier)).sort(),
    carriers,
  };
}

export function summarizeTargetAllianceCoverage(
  allianceCatalog: AllianceCatalog,
  routeNetwork: RouteNetworkCatalog,
  scheduleCatalog: ScheduleCatalog,
  asOf: string,
  officialScheduleCatalog?: OfficialScheduleCatalog,
): ReadonlyArray<AllianceCoverageSummary> {
  return [
    summarizeAllianceCoverage(allianceCatalog, routeNetwork, scheduleCatalog, 'oneworld', asOf, officialScheduleCatalog),
    summarizeAllianceCoverage(allianceCatalog, routeNetwork, scheduleCatalog, 'star', asOf, officialScheduleCatalog),
    summarizeAllianceCoverage(allianceCatalog, routeNetwork, scheduleCatalog, 'skyteam', asOf, officialScheduleCatalog),
  ];
}
