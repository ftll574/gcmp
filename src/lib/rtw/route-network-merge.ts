import {routeSourceReviewWindow} from './route-date-semantics.ts';
import { z } from 'zod';
import { carrierIdentityKey, carrierRouteKey } from '../carrier-identity.ts';
import { RouteNetworkSourceSchema, RouteNetworkCatalogSchema, type CarrierRouteUniverse, type RouteNetworkCatalog } from '../schemas/route-network.ts';

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
  // Route/operator proof cannot promote unrelated provider or number-only designators.
  const lowerUnverified = higher.carrierIdentity === 'operating' && lower.carrierIdentity !== 'operating';
  const confirmed = [...new Set([...(lowerUnverified ? [] : lower.flightNumbers ?? []), ...(higher.flightNumbers ?? [])])].sort();
  const confirmedSet = new Set(confirmed);
  const candidates = [...new Set([
    ...(lowerUnverified ? lower.flightNumbers ?? [] : []),
    ...(lower.flightNumberCandidates ?? []),
    ...(higher.flightNumberCandidates ?? []),
  ])].filter((number) => !confirmedSet.has(number)).sort();
  // Replace both tiers completely: spreading higher would retain a candidate
  // list even when deduplication moved its last designator into confirmed.
  const route = { ...higher };
  delete route.flightNumbers;
  delete route.flightNumberSourceIds;
  delete route.flightNumberCandidates;
  delete route.flightNumberCandidateSourceIds;
  return {
    ...route,
    ...(confirmed.length > 0 ? { flightNumbers: confirmed } : {}),
    ...(confirmed.length > 0 ? {
      flightNumberSourceIds: [...new Set([
        ...(lowerUnverified ? [] : lower.flightNumberSourceIds ?? []),
        ...(higher.flightNumberSourceIds ?? []),
      ])],
    } : {}),
    ...(candidates.length > 0 ? { flightNumberCandidates: candidates } : {}),
    ...(candidates.length > 0 ? {
      flightNumberCandidateSourceIds: [...new Set([
        ...(lowerUnverified ? lower.flightNumberSourceIds ?? [] : []),
        ...(lower.flightNumberCandidateSourceIds ?? []),
        ...(higher.flightNumberCandidateSourceIds ?? []),
      ])],
    } : {}),
  };
}

/** Reapply the operating-evidence gate to cached observational number layers.
 * Official number evidence with different semantics is left intact. Aggregated
 * mixed-source tiers cannot be separated safely without per-number provenance. */
export function enforceObservedNumberOperatingGate(network: RouteNetworkCatalog): RouteNetworkCatalog {
  const gated = (id: string) => id === 'flight-numbers-adsbiq-recent-20260908'
    || (id.startsWith('flightsfrom-') && network.sources.some(source => source.id === id
      && /already.*operating-carrier evidence/i.test(source.note ?? '')));
  return {
    ...network,
    routes: network.routes.map(route => {
      const sourceIds = route.flightNumberSourceIds ?? [];
      if (route.carrierIdentity === 'operating' || !route.flightNumbers?.length
        || !sourceIds.length || !sourceIds.every(gated)) return route;
      const { flightNumbers, flightNumberSourceIds, ...rest } = route;
      return {
        ...rest,
        flightNumberCandidates: [...new Set([...(rest.flightNumberCandidates ?? []), ...flightNumbers])].sort(),
        flightNumberCandidateSourceIds: [...new Set([...(rest.flightNumberCandidateSourceIds ?? []), ...(flightNumberSourceIds ?? [])])],
      };
    }),
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
    network.routes.map((route) => [carrierRouteKey(route, ...route.pair), route]),
  );
  for (const row of evidence.routes) {
    const key = carrierRouteKey(row, ...row.pair);
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
  return RouteNetworkCatalogSchema.parse(enforceObservedNumberOperatingGate({
    ...network,
    sources: [...sources.values()],
    routes: [...routes.values()],
  }));
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
    observed.routes.map((route) => [carrierRouteKey(route, ...route.pair), route]),
  );
  for (const route of curated.routes) {
    const key = carrierRouteKey(route, ...route.pair);
    const lower = routes.get(key);
    // Missing identity cannot erase a known provider-only limitation. Never
    // inherit operating proof from a lower-priority observation, and keep
    // number-only overlays independent from this route identity decision.
    const inheritedListing = (!route.carrierIdentity || route.carrierIdentity === 'unknown')
      && lower?.carrierIdentity === 'provider-listed';
    routes.set(key, lower ? {
      ...mergeRouteNumbers(lower, route),
      carrierIdentity: inheritedListing ? 'provider-listed' : route.carrierIdentity ?? 'unknown',
      sourceIds: inheritedListing ? [...new Set([...route.sourceIds, ...lower.sourceIds])] : route.sourceIds,
    } : route);
  }

  const universes = new Map<string, CarrierRouteUniverse>();
  for (const universe of observed.carrierUniverses) universes.set(carrierIdentityKey(universe), universe);
  for (const universe of curated.carrierUniverses) {
    const key = carrierIdentityKey(universe);
    universes.set(key, mergeUniverse(universes.get(key), universe));
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


const RouteNumberQuarantinesSchema = z.object({
  version: z.literal(1),
  sources: z.array(RouteNetworkSourceSchema),
  entries: z.array(z.object({
    carrier: z.string().regex(/^[A-Z0-9]{2,3}$/),
    pair: z.tuple([z.string().regex(/^[A-Z]{3}$/), z.string().regex(/^[A-Z]{3}$/)]),
    flightNumber: z.string().regex(/^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/),
    effectiveFrom: z.iso.date(), effectiveUntil: z.iso.date(),
    sourceIds: z.array(z.string()).min(1), reason: z.string().min(1),
  }).strict()),
}).strict();

/** Current artifact quarantine after every number overlay. Preserve raw layers
 * and dated historical rows that do not overlap the official conflict window. */
export function applyRouteNumberQuarantines(network: RouteNetworkCatalog, input: unknown): RouteNetworkCatalog {
  const rules = RouteNumberQuarantinesSchema.parse(input);
  const sources = new Map(network.sources.map(source => [source.id, source]));
  for (const source of rules.sources) {
    const existing = sources.get(source.id);
    if (existing && sourceKey(existing) !== sourceKey(source)) throw new Error(`Conflicting quarantine source ${source.id}`);
    sources.set(source.id, source);
  }
  for (const rule of rules.entries) {
    if (rule.effectiveFrom > rule.effectiveUntil || !rule.flightNumber.startsWith(rule.carrier)
      || rule.sourceIds.some(id => !sources.has(id))) throw new Error('Invalid flight-number quarantine evidence');
  }
  const routes = network.routes.map(route => {
    const generatedReview=routeSourceReviewWindow(route,sources);
    const matches = rules.entries.filter(rule => rule.carrier === route.carrier
      && rule.pair[0] === route.pair[0] && rule.pair[1] === route.pair[1]
      && (generatedReview?'0000-01-01':route.effectiveFrom ?? '0000-01-01') <= rule.effectiveUntil
      && (generatedReview?'9999-12-31':route.effectiveUntil ?? '9999-12-31') >= rule.effectiveFrom);
    if (!matches.length) return route;
    const blocked = new Set(matches.map(rule => rule.flightNumber));
    const confirmed = (route.flightNumbers ?? []).filter(number => !blocked.has(number));
    const candidates = (route.flightNumberCandidates ?? []).filter(number => !blocked.has(number));
    const clean = { ...route };
    delete clean.flightNumbers; delete clean.flightNumberSourceIds;
    delete clean.flightNumberCandidates; delete clean.flightNumberCandidateSourceIds;
    return {
      ...clean,
      ...(route.status === 'published' && confirmed.length === 0 && candidates.length === 0
        ? { status: 'identity-unresolved' as const }
        : {}),
      ...(confirmed.length ? { flightNumbers: confirmed, flightNumberSourceIds: route.flightNumberSourceIds } : {}),
      ...(candidates.length ? { flightNumberCandidates: candidates, flightNumberCandidateSourceIds: route.flightNumberCandidateSourceIds } : {}),
      sourceIds: [...new Set([...route.sourceIds, ...matches.flatMap(rule => rule.sourceIds)])],
    };
  });
  return RouteNetworkCatalogSchema.parse({ ...network, sources: [...sources.values()], routes });
}

/** Restore accepted public runtime rows before applying current quarantine.
 * Preservation must never reintroduce a blocked designator. */
export function preserveRuntimeRoutesThenQuarantine(
  network: RouteNetworkCatalog,
  preservationInput: unknown,
  quarantineInput: unknown,
): RouteNetworkCatalog {
  const preservation = RouteNetworkCatalogSchema.parse(preservationInput);
  const sources = new Map(network.sources.map((source) => [source.id, source] as const));
  for (const source of preservation.sources) {
    const prior = sources.get(source.id);
    if (prior && sourceKey(prior) !== sourceKey(source)) throw new Error(`Conflicting preservation source ${source.id}`);
    if (!prior) sources.set(source.id, source);
  }
  const routes = new Map(network.routes.map((route) => [carrierRouteKey(route, ...route.pair), route] as const));
  for (const route of preservation.routes) {
    const key = carrierRouteKey(route, ...route.pair);
    if (!routes.has(key)) throw new Error(`Preservation references missing route ${key}`);
    routes.set(key, route);
  }
  // Preserve accepted descriptor order. New, non-preservation sources remain deterministic after it.
  const orderedSources = [...preservation.sources, ...network.sources.filter((source) => !preservation.sources.some((item) => item.id === source.id))];
  return applyRouteNumberQuarantines({ ...network, sources: orderedSources, routes: [...routes.values()] }, quarantineInput);
}
