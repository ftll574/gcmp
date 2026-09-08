import { RouteNetworkCatalogSchema, type CarrierRouteUniverse, type RouteNetworkCatalog } from '../schemas/route-network.ts';

function sourceKey(source: RouteNetworkCatalog['sources'][number]): string {
  return JSON.stringify(source);
}

function mergeUniverse(
  left: CarrierRouteUniverse | undefined,
  right: CarrierRouteUniverse,
): CarrierRouteUniverse {
  if (!left) return right;
  if (right.asOf > left.asOf) return right;
  if (right.asOf < left.asOf) return left;
  if (left.scope !== right.scope) return left.scope === 'complete' ? left : right;
  if (left.scope === 'complete') {
    if (left.directionalRouteDenominator !== right.directionalRouteDenominator) {
      throw new Error(`Conflicting complete route denominators for ${left.carrier}`);
    }
    return {
      ...left,
      sourceIds: [...new Set([...left.sourceIds, ...right.sourceIds])],
      note: left.note === right.note ? left.note : `${left.note} ${right.note}`,
    };
  }
  return {
    ...left,
    sourceIds: [...new Set([...left.sourceIds, ...right.sourceIds])],
    note: left.note === right.note ? left.note : `${left.note} ${right.note}`,
  };
}

/**
 * Overlay a high-recall observed/corroborated route layer underneath the
 * curated catalog.
 *
 *   observed candidates ─┐
 *                        ├─ key by carrier + directional airport pair
 *   curated evidence ────┘  curated always wins (including suspensions)
 *
 * This intentionally does not turn an observed route into schedule/weekday
 * evidence. Both inputs must already satisfy the route-network schema.
 */
export function mergeRouteNetworkCatalogs(
  curated: RouteNetworkCatalog,
  observed: RouteNetworkCatalog | null,
): RouteNetworkCatalog {
  if (!observed) return curated;
  if (observed.version !== curated.version) {
    throw new Error(`Route-network version mismatch: ${curated.version} vs ${observed.version}`);
  }

  const sources = new Map(curated.sources.map((source) => [source.id, source] as const));
  for (const source of observed.sources) {
    const existing = sources.get(source.id);
    if (existing && sourceKey(existing) !== sourceKey(source)) {
      throw new Error(`Conflicting route-network source ${source.id}`);
    }
    if (!existing) sources.set(source.id, source);
  }

  const routes = new Map(observed.routes.map((route) => [`${route.carrier}:${route.pair[0]}-${route.pair[1]}`, route] as const));
  for (const route of curated.routes) {
    routes.set(`${route.carrier}:${route.pair[0]}-${route.pair[1]}`, route);
  }

  const universes = new Map<string, CarrierRouteUniverse>();
  for (const universe of observed.carrierUniverses) universes.set(universe.carrier, universe);
  for (const universe of curated.carrierUniverses) {
    universes.set(universe.carrier, mergeUniverse(universes.get(universe.carrier), universe));
  }

  return RouteNetworkCatalogSchema.parse({
    version: curated.version,
    coverage: 'curated-not-complete',
    sources: [...sources.values()],
    carrierUniverses: [...universes.values()].sort((a, b) => a.carrier.localeCompare(b.carrier)),
    routes: [...routes.values()].sort((a, b) =>
      a.carrier.localeCompare(b.carrier)
      || a.pair[0].localeCompare(b.pair[0])
      || a.pair[1].localeCompare(b.pair[1])),
  });
}
