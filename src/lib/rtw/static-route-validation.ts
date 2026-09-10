import type { LiveRouteResponse } from '../schemas/live-routes.ts';
import { RouteNetworkCatalogSchema, type RouteNetworkCatalog } from '../schemas/route-network.ts';
import type { StaticRouteCandidate } from './static-route-research.ts';

export type StaticRouteValidationStatus =
  | 'confirmed-current'
  | 'carrier-not-listed'
  | 'route-not-listed'
  | 'unresolved';

export interface StaticRouteValidationResult extends StaticRouteCandidate {
  readonly status: StaticRouteValidationStatus;
  readonly listedCarriers: readonly string[];
}

export function validateStaticRouteCandidates(
  candidates: ReadonlyArray<StaticRouteCandidate>,
  responsesByOrigin: ReadonlyMap<string, LiveRouteResponse>,
): StaticRouteValidationResult[] {
  return candidates.map((candidate) => {
    const response = responsesByOrigin.get(candidate.from);
    if (!response) return { ...candidate, status: 'unresolved', listedCarriers: [] };
    const pair = response.routes.find((route) => route.from === candidate.from && route.to === candidate.to);
    if (!pair) return { ...candidate, status: 'route-not-listed', listedCarriers: [] };
    const listedCarriers = [...new Set(pair.carriers.map((carrier) => carrier.code))].sort();
    return {
      ...candidate,
      status: listedCarriers.includes(candidate.carrier) ? 'confirmed-current' : 'carrier-not-listed',
      listedCarriers,
    };
  });
}

export function buildValidatedStaticRouteCatalog(options: {
  validation: ReadonlyArray<StaticRouteValidationResult>;
  responsesByOrigin: ReadonlyMap<string, LiveRouteResponse>;
  version: string;
}): RouteNetworkCatalog {
  const confirmed = options.validation.filter((row) => row.status === 'confirmed-current');
  const sourceById = new Map<string, RouteNetworkCatalog['sources'][number]>();
  const routes = confirmed.map((row) => {
    const response = options.responsesByOrigin.get(row.from);
    if (!response) throw new Error(`Missing validation response for ${row.from}`);
    const sourceId = `air-routes-validated-${row.from.toLowerCase()}-${response.checkedAt.slice(0, 10).replaceAll('-', '')}`;
    if (!sourceById.has(sourceId)) {
      sourceById.set(sourceId, {
        id: sourceId,
        url: 'https://air-routes.com/developers',
        checkedOn: response.checkedAt.slice(0, 10),
        note: `Targeted current scheduled-passenger route validation for ${row.from}. Exact carrier-route matches remain provider-listed until operating identity is independently established.`,
      });
    }
    return {
      carrier: row.carrier,
      pair: [row.from, row.to] as [string, string],
      service: 'nonstop' as const,
      status: 'published' as const,
      carrierIdentity: 'provider-listed' as const,
      sourceIds: [sourceId],
    };
  });
  return RouteNetworkCatalogSchema.parse({
    version: options.version,
    coverage: 'curated-not-complete',
    sources: [...sourceById.values()].sort((a, b) => a.id.localeCompare(b.id)),
    carrierUniverses: [],
    routes: routes.sort((a, b) => a.carrier.localeCompare(b.carrier)
      || a.pair[0].localeCompare(b.pair[0]) || a.pair[1].localeCompare(b.pair[1])),
  });
}
