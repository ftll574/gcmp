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

function mergeRouteNumbers(
  lower: RouteNetworkCatalog['routes'][number],
  higher: RouteNetworkCatalog['routes'][number],
): RouteNetworkCatalog['routes'][number] {
  const confirmed = [...new Set([...(lower.flightNumbers ?? []), ...(higher.flightNumbers ?? [])])].sort();
  const confirmedSet = new Set(confirmed);
  const candidates = [...new Set([
    ...(lower.flightNumberCandidates ?? []),
    ...(higher.flightNumberCandidates ?? []),
  ])].filter((number) => !confirmedSet.has(number)).sort();
  return {
    ...higher,
    ...(confirmed.length > 0 ? { flightNumbers: confirmed } : {}),
    ...(confirmed.length > 0 ? {
      flightNumberSourceIds: [...new Set([
        ...(lower.flightNumberSourceIds ?? []),
        ...(higher.flightNumberSourceIds ?? []),
      ])],
    } : {}),
    ...(candidates.length > 0 ? { flightNumberCandidates: candidates } : {}),
    ...(candidates.length > 0 ? {
      flightNumberCandidateSourceIds: [...new Set([
        ...(lower.flightNumberCandidateSourceIds ?? []),
        ...(higher.flightNumberCandidateSourceIds ?? []),
      ])],
    } : {}),
  };
}

/** Apply number-only evidence to an already-established route graph. Unlike
 * the normal route merge, this must never resurrect a route that disappeared
 * from the current graph. */
export function mergeRouteNumberEvidence(
  network: RouteNetworkCatalog,
  evidence: RouteNetworkCatalog | null,
): RouteNetworkCatalog {
  if (!evidence) return network;
  if (evidence.version !== network.version) {
    throw new Error(`Route-number version mismatch: ${network.version} vs ${evidence.version}`);
  }
  const sources = new Map(network.sources.map((source) => [source.id, source] as const));
  for (const source of evidence.sources) {
    const existing = sources.get(source.id);
    if (existing && sourceKey(existing) !== sourceKey(source)) throw new Error(`Conflicting route-network source ${source.id}`);
    if (!existing) sources.set(source.id, source);
  }
  const routes = new Map<string, RouteNetworkCatalog['routes'][number]>(
    network.routes.map((route) => [`${route.carrier}:${route.pair[0]}-${route.pair[1]}`, route]),
  );
  for (const row of evidence.routes) {
    const key = `${row.carrier}:${row.pair[0]}-${row.pair[1]}`;
    const existing = routes.get(key);
    if (!existing) throw new Error(`Flight-number evidence references missing route ${key}`);
    const merged = mergeRouteNumbers(row, existing);
    routes.set(key, row.status === 'identity-unresolved'
      ? {
          ...merged,
          status: 'identity-unresolved',
          sourceIds: [...new Set([...existing.sourceIds, ...row.sourceIds])],
        }
      : merged);
  }
  return RouteNetworkCatalogSchema.parse({
    ...network,
    sources: [...sources.values()],
    routes: [...routes.values()],
  });
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

  const routes = new Map<string, RouteNetworkCatalog['routes'][number]>(
    observed.routes.map((route) => [`${route.carrier}:${route.pair[0]}-${route.pair[1]}`, route]),
  );
  for (const route of curated.routes) {
    const key = `${route.carrier}:${route.pair[0]}-${route.pair[1]}`;
    const lower = routes.get(key);
    routes.set(key, lower ? mergeRouteNumbers(lower, route) : route);
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
