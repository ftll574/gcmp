import { z } from 'zod';

const CarrierSchema = z.object({
  iata: z.string().min(1).max(3),
  name: z.string().optional(),
}).passthrough();

const RouteSchema = z.object({
  iata: z.string().min(1).max(4),
  carriers: z.array(CarrierSchema).default([]),
}).passthrough();

const AirportSchema = z.object({
  iata: z.string().min(1).max(4),
  routes: z.array(RouteSchema).default([]),
}).passthrough();

const DatasetSchema = z.record(z.string(), AirportSchema);

export interface StaticRouteCandidate {
  carrier: string;
  from: string;
  to: string;
}

export function extractStaticRouteCandidates(raw: unknown, options: {
  eligibleCarriers: ReadonlySet<string>;
  knownAirports: ReadonlySet<string>;
}) {
  const dataset = DatasetSchema.parse(raw);
  const routes = new Map<string, StaticRouteCandidate>();
  let airports = 0;
  let routeRelationships = 0;
  let outsideAirportCatalog = 0;

  for (const [key, airport] of Object.entries(dataset)) {
    const from = airport.iata.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(from) || key.trim().toUpperCase() !== from) continue;
    airports++;
    for (const route of airport.routes) {
      const to = route.iata.trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(to) || from === to) continue;
      routeRelationships++;
      if (!options.knownAirports.has(from) || !options.knownAirports.has(to)) {
        outsideAirportCatalog++;
        continue;
      }
      for (const carrier of route.carriers) {
        const code = carrier.iata.trim().toUpperCase();
        if (!options.eligibleCarriers.has(code)) continue;
        routes.set(`${code}:${from}-${to}`, { carrier: code, from, to });
      }
    }
  }

  return {
    routes: [...routes.values()].sort((a, b) =>
      a.carrier.localeCompare(b.carrier) || a.from.localeCompare(b.from) || a.to.localeCompare(b.to)),
    stats: { airports, routeRelationships, outsideAirportCatalog, targetCarrierRoutes: routes.size },
  };
}
