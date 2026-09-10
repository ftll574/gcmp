import { RouteNetworkCatalogSchema, type RouteNetworkCatalog } from '../schemas/route-network.ts';
import type { LiveRouteResponse } from '../schemas/live-routes.ts';

const SOURCE_ID_PREFIX = 'air-routes-global-';

export interface GlobalRouteScanRecord {
  readonly origin: string;
  readonly status: 200 | 404;
  readonly response?: LiveRouteResponse;
}

export function buildGlobalRouteCatalog(options: {
  records: ReadonlyArray<GlobalRouteScanRecord>;
  eligibleCarriers: ReadonlySet<string>;
  knownAirports: ReadonlySet<string>;
  expectedOrigins: ReadonlySet<string>;
  checkedOn: string;
  version: string;
}): RouteNetworkCatalog {
  const sourceId = `${SOURCE_ID_PREFIX}${options.checkedOn.replaceAll('-', '')}`;
  const scannedOrigins = new Set(options.records.map((record) => record.origin));
  const duplicateOrigins = options.records.length !== scannedOrigins.size;
  if (duplicateOrigins) throw new Error('Global route scan contains duplicate origins');

  for (const origin of scannedOrigins) {
    if (!options.expectedOrigins.has(origin)) throw new Error(`Unexpected global route scan origin ${origin}`);
  }

  const routes = new Map<string, RouteNetworkCatalog['routes'][number]>();
  const carrierCounts = new Map<string, number>();
  let unknownDestinations = 0;
  for (const record of options.records) {
    if (record.status === 404) continue;
    if (!record.response || record.response.origin !== record.origin) {
      throw new Error(`Global route scan response mismatch for ${record.origin}`);
    }
    for (const route of record.response.routes) {
      if (!options.knownAirports.has(route.to)) {
        unknownDestinations++;
        continue;
      }
      for (const carrier of route.carriers) {
        if (!options.eligibleCarriers.has(carrier.code)) continue;
        const key = `${carrier.code}:${route.from}-${route.to}`;
        routes.set(key, {
          carrier: carrier.code,
          pair: [route.from, route.to],
          service: 'nonstop',
          status: 'published',
          carrierIdentity: 'provider-listed',
          sourceIds: [sourceId],
        });
      }
    }
  }

  for (const route of routes.values()) {
    carrierCounts.set(route.carrier, (carrierCounts.get(route.carrier) ?? 0) + 1);
  }

  const completeScan = scannedOrigins.size === options.expectedOrigins.size
    && [...options.expectedOrigins].every((origin) => scannedOrigins.has(origin));
  const note = completeScan && unknownDestinations === 0
    ? `Complete scan of all ${options.expectedOrigins.size} GCMP airport codes against air-routes.com current scheduled-passenger destinations. Carrier labels remain provider-listed until operating identity is independently verified.`
    : `Partial scan of ${scannedOrigins.size}/${options.expectedOrigins.size} GCMP airport codes against air-routes.com current scheduled-passenger destinations; ${unknownDestinations} provider destinations were outside the GCMP airport catalog. Carrier labels remain provider-listed.`;

  return RouteNetworkCatalogSchema.parse({
    version: options.version,
    coverage: 'curated-not-complete',
    sources: [{
      id: sourceId,
      url: 'https://air-routes.com/developers',
      checkedOn: options.checkedOn,
      note,
    }],
    carrierUniverses: [...options.eligibleCarriers]
      .filter((carrier) => (carrierCounts.get(carrier) ?? 0) > 0)
      .sort()
      .map((carrier) => ({
        carrier,
        scope: 'partial' as const,
        asOf: options.checkedOn,
        sourceIds: [sourceId],
        note: `air-routes.com scan observed ${carrierCounts.get(carrier) ?? 0} active directional nonstop carrier listings. This provider layer is high-recall discovery evidence, not a claim of globally complete operating-carrier coverage.`,
      })),
    routes: [...routes.values()].sort((a, b) =>
      a.carrier.localeCompare(b.carrier)
      || a.pair[0].localeCompare(b.pair[0])
      || a.pair[1].localeCompare(b.pair[1])),
  });
}
