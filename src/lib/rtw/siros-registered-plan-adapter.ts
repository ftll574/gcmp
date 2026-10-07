import { carrierRouteKey } from '../carrier-identity.ts';
import { RouteNetworkCatalogSchema, type RegisteredPlan, type RouteNetworkCatalog } from '../schemas/route-network.ts';
import type { SiroRegisteredPlanOverlay } from '../schemas/siros-registered-plan-overlay.ts';

export interface SiroRegisteredPlanMergeStats {
  readonly associationGroups: number;
  readonly candidateAssociations: number;
  readonly confirmedOverlaps: number;
  readonly existingRouteKeys: number;
  readonly newIdentityAssociations: number;
  readonly planProfilesAdded: number;
  readonly planProfilesMatched: number;
  readonly sourceRows: number;
  readonly totalRegisteredPlanRows: number;
}

function profileKey(plan: RegisteredPlan): string {
  // This is the reviewed SIROS profile comparison: a registration ID and
  // exact operator/entity, designator, inclusive period, weekdays, UTC clocks,
  // unknown arrival day, stage and conflict state describe one plan fact.
  return JSON.stringify([
    String(plan.registrationId),
    plan.registeredOperator,
    plan.carrierEntityKey ?? null,
    String(plan.flightNumberRaw),
    plan.effectiveFrom,
    plan.effectiveUntil,
    plan.weekdays,
    plan.departureUTC,
    plan.arrivalUTC,
    plan.arrivalDayOffset,
    plan.stageNumber ?? null,
    plan.versionConflict ?? false,
  ]);
}

function sourceRowKey(row: NonNullable<RegisteredPlan['sourceRowLineage']>[number]): string {
  return `${row.sourceId}:${row.sourceRow}`;
}

function assertSameRouteEvidence(before: RouteNetworkCatalog['routes'][number], after: RouteNetworkCatalog['routes'][number]): void {
  for (const field of [
    'carrier', 'carrierEntityKey', 'pair', 'service', 'status', 'carrierIdentity',
    'routeEvidence', 'routeEvidenceScope', 'flightNumbers', 'flightNumberCandidates',
    'timeBoundFlightNumbers', 'effectiveFrom', 'effectiveUntil',
  ] as const) {
    if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) {
      throw new Error(`SIROS registered-plan adapter changed route evidence field ${field} for ${carrierRouteKey(before, ...before.pair)}`);
    }
  }
}

/** Enrich exact existing routes with registered-plan evidence and source-row lineage only. */
export function applySiroRegisteredPlanOverlay(
  base: RouteNetworkCatalog,
  overlay: SiroRegisteredPlanOverlay,
): { readonly catalog: RouteNetworkCatalog; readonly stats: SiroRegisteredPlanMergeStats } {
  const routeByKey = new Map(base.routes.map((route) => [carrierRouteKey(route, ...route.pair), route] as const));
  if (routeByKey.size !== base.routes.length) throw new Error('SIROS adapter requires unique baseline route identities');

  const associations = new Set<string>();
  const sourceRows = new Set<string>();
  let candidateAssociations = 0;
  let newIdentityAssociations = 0;
  let confirmedOverlaps = 0;

  for (const association of overlay.associations) {
    if (associations.has(association.key)) throw new Error(`Duplicate SIROS association ${association.key}`);
    associations.add(association.key);
    if (association.tier === 'existing-candidate') candidateAssociations += 1;
    else newIdentityAssociations += 1;
    const [carrier, identity, directedPair, designator] = association.key.split('|');
    const [from, to] = directedPair?.split('>') ?? [];
    if (!carrier || !identity || !from || !to || !designator) throw new Error(`Malformed SIROS association key ${association.key}`);
    const key = carrierRouteKey({ carrier, ...(identity !== carrier ? { carrierEntityKey: identity } : {}) }, from, to);
    const route = routeByKey.get(key);
    if (!route) throw new Error(`SIROS registered-plan association points to a missing route: ${association.key}`);
    if ((route.flightNumbers ?? []).includes(designator)) confirmedOverlaps += 1;
  }

  if (overlay.routes.length !== 386 || new Set(overlay.routes.map((route) => carrierRouteKey(route, ...route.pair))).size !== overlay.routes.length) {
    throw new Error('SIROS overlay route-key count or uniqueness changed');
  }

  const sourceById = new Map(base.sources.map((source) => [source.id, source] as const));
  const existingSource = sourceById.get(overlay.source.id);
  if (existingSource && JSON.stringify(existingSource) !== JSON.stringify(overlay.source)) {
    throw new Error(`SIROS source ID conflicts with existing source ${overlay.source.id}`);
  }

  let planProfilesAdded = 0;
  let planProfilesMatched = 0;
  const overlayRoutesByKey = new Map(overlay.routes.map((candidate) => [carrierRouteKey(candidate, ...candidate.pair), candidate] as const));
  const routes = base.routes.map((route) => {
    const routeKey = carrierRouteKey(route, ...route.pair);
    const addition = overlayRoutesByKey.get(routeKey);
    if (!addition) return route;
    if (addition.carrier !== route.carrier || addition.carrierEntityKey !== route.carrierEntityKey
      || addition.pair[0] !== route.pair[0] || addition.pair[1] !== route.pair[1]) {
      throw new Error(`SIROS route identity does not exactly match runtime route ${routeKey}`);
    }
    const plans = [...(route.registeredPlans ?? [])];
    const profileIndexes = new Map<string, number>();
    plans.forEach((plan, index) => {
      const profile = profileKey(plan);
      if (!profileIndexes.has(profile)) profileIndexes.set(profile, index);
    });

    for (const candidate of addition.registeredPlans) {
      for (const row of candidate.sourceRowLineage ?? []) {
        const key = sourceRowKey(row);
        if (sourceRows.has(key)) throw new Error(`SIROS source row is attached more than once: ${key}`);
        sourceRows.add(key);
      }
      const existingIndex = profileIndexes.get(profileKey(candidate));
      if (existingIndex === undefined) {
        profileIndexes.set(profileKey(candidate), plans.length);
        plans.push(candidate);
        planProfilesAdded += 1;
        continue;
      }

      const previous = plans[existingIndex]!;
      if (previous.registeredOperatorICAO && candidate.registeredOperatorICAO
        && previous.registeredOperatorICAO !== candidate.registeredOperatorICAO) {
        throw new Error(`SIROS raw operator code conflicts with existing registration profile ${previous.registrationId}`);
      }
      const lineageByKey = new Map((previous.sourceRowLineage ?? []).map((row) => [sourceRowKey(row), row] as const));
      for (const row of candidate.sourceRowLineage ?? []) lineageByKey.set(sourceRowKey(row), row);
      plans[existingIndex] = {
        ...previous,
        sourceRowLineage: [...lineageByKey.values()].sort((left, right) => left.sourceRow - right.sourceRow),
      };
      planProfilesMatched += 1;
    }

    const sourceIds = route.sourceIds.includes(overlay.source.id)
      ? route.sourceIds
      : [...route.sourceIds, overlay.source.id];
    return { ...route, sourceIds, registeredPlans: plans };
  });

  if (sourceRows.size !== 14997) throw new Error(`SIROS source-row lineage count changed: ${sourceRows.size}`);
  if (candidateAssociations !== 57 || newIdentityAssociations !== 1390 || confirmedOverlaps !== 0) {
    throw new Error(`SIROS association classes changed: candidates=${candidateAssociations}; new=${newIdentityAssociations}; confirmed=${confirmedOverlaps}`);
  }
  if (planProfilesMatched < 2575) throw new Error(`Expected the reviewed registered-plan lineage matches, received ${planProfilesMatched}`);

  const catalog = RouteNetworkCatalogSchema.parse({
    ...base,
    sources: existingSource ? base.sources : [...base.sources, overlay.source],
    routes,
  });
  if (catalog.routes.length !== base.routes.length) throw new Error('SIROS registered-plan adapter changed route-entry count');
  const afterByKey = new Map(catalog.routes.map((route) => [carrierRouteKey(route, ...route.pair), route] as const));
  for (const route of base.routes) {
    const after = afterByKey.get(carrierRouteKey(route, ...route.pair));
    if (!after) throw new Error(`SIROS registered-plan adapter removed route ${carrierRouteKey(route, ...route.pair)}`);
    assertSameRouteEvidence(route, after);
  }

  return {
    catalog,
    stats: {
      associationGroups: associations.size,
      candidateAssociations,
      confirmedOverlaps,
      existingRouteKeys: overlay.routes.length,
      newIdentityAssociations,
      planProfilesAdded,
      planProfilesMatched,
      sourceRows: sourceRows.size,
      totalRegisteredPlanRows: catalog.routes.reduce((total, route) => total + (route.registeredPlans?.length ?? 0), 0),
    },
  };
}
