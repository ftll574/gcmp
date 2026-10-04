import type { RouteNetworkCatalog } from '../../src/lib/schemas/route-network.ts';

/** Synthetic operator proof for planner interaction tests only; never production data. */
const UI_ROUTE_KEYS = new Set([
  'BR:TPE-SFO', 'LH:SFO-FRA', 'LH:FRA-MUC', 'BR:MUC-TPE',
  'CX:TPE-HKG', 'AY:HKG-HEL', 'AY:HEL-LHR', 'BA:LHR-JFK',
  'AA:JFK-LAX', 'CX:LAX-HKG', 'CX:HKG-TPE', 'CX:SFO-HKG',
]);

export function syntheticOperatingNetwork(catalog: RouteNetworkCatalog): RouteNetworkCatalog {
  const sourceId = 'synthetic-ui-operator-proof';
  return {
    ...catalog,
    sources: [...catalog.sources, {
      id: sourceId,
      url: 'https://example.com/gcmp-ui-test-operator',
      checkedOn: '2026-09-30',
      note: 'Synthetic operator proof for UI tests only; not airline evidence.',
    }],
    routes: catalog.routes.map((route) => UI_ROUTE_KEYS.has(`${route.carrier}:${route.pair[0]}-${route.pair[1]}`)
      ? { ...route, carrierIdentity: 'operating', sourceIds: [...route.sourceIds, sourceId] }
      : route),
  };
}
