import type { LiveRouteResponse } from '../schemas/live-routes.ts';
import type { RouteNetworkSource } from '../schemas/route-network.ts';
import type { NextLegDestination, NextLegOption } from './next-leg-discovery.ts';

function sourceFor(routeUrl: string, checkedAt: string, from: string, to: string, carrier: string): RouteNetworkSource {
  return {
    id: `air-routes-live-${carrier.toLowerCase()}-${from.toLowerCase()}-${to.toLowerCase()}`,
    url: routeUrl,
    checkedOn: checkedAt.slice(0, 10),
    note: 'Live scheduled-passenger carrier listing. Carrier may be marketing/codeshare; dated evidence is required to confirm the operating carrier.',
  };
}

export function mergeLiveNextLegDestinations(
  current: ReadonlyArray<NextLegDestination>,
  live: LiveRouteResponse | null,
  eligibleCarriers: ReadonlySet<string>,
  knownAirports: ReadonlySet<string>,
): ReadonlyArray<NextLegDestination> {
  if (!live) return current;
  const destinations = new Map<string, NextLegOption[]>(
    current.map((destination) => [destination.iata, [...destination.options]]),
  );
  for (const route of live.routes) {
    if (route.from !== live.origin || !knownAirports.has(route.to)) continue;
    const options = destinations.get(route.to) ?? [];
    for (const listed of route.carriers) {
      if (!eligibleCarriers.has(listed.code) || options.some((option) => option.carrier === listed.code)) continue;
      const option: NextLegOption = {
        carrier: listed.code,
        from: route.from,
        to: route.to,
        flightNumbers: [],
        candidateFlightNumbers: [],
        scheduleStatus: 'unknown',
        networkSources: [sourceFor(route.sourceUrl, live.checkedAt, route.from, route.to, listed.code)],
        schedules: [],
        flightNumberSources: [],
        routeFlightNumberSources: [],
        candidateFlightNumberSources: [],
        routeWindow: null,
        identityStatus: 'provider-listed',
      };
      options.push(option);
    }
    if (options.length > 0) destinations.set(route.to, options.sort((a, b) => a.carrier.localeCompare(b.carrier)));
  }
  return [...destinations.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([iata, options]) => ({ iata, options }));
}
