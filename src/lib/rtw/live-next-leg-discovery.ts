import { airportCodeOn, airportIdentityKey, isKnownAirport, sameAirport } from '../airport-identity.ts';
import { canUsePassengerRoute } from './passenger-route-use.ts';
import type { LiveRouteResponse } from '../schemas/live-routes.ts';
import type { RouteNetworkSource } from '../schemas/route-network.ts';
import type { NextLegDestination, NextLegOption } from './next-leg-discovery.ts';
import type { PassengerRouteUseCatalog } from '../schemas/passenger-route-use.ts';

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
  context?: { referenceDate: string; productId?: string | undefined; passengerUseCatalog?: PassengerRouteUseCatalog | undefined },
): ReadonlyArray<NextLegDestination> {
  const safeCurrent = current.map(destination => ({ ...destination, options: destination.options.filter(option => !sameAirport(option.from, option.to) && canUsePassengerRoute(option.carrier, option.from, option.to, context?.referenceDate ?? live?.checkedAt.slice(0, 10) ?? new Date().toISOString().slice(0, 10), context?.productId, option.carrierEntityKey, context?.passengerUseCatalog)) })).filter(destination => destination.options.length > 0);
  if (!live) return safeCurrent;
  const destinations = new Map<string, NextLegOption[]>(
    safeCurrent.map((destination) => [destination.iata, [...destination.options]]),
  );
  const destinationCodes = new Map(safeCurrent.map(destination => [airportIdentityKey(destination.iata), destination.iata]));
  for (const route of live.routes) {
    if (!sameAirport(route.from, live.origin) || sameAirport(route.from, route.to) || !isKnownAirport(route.to, knownAirports)) continue;
    const physicalKey = airportIdentityKey(route.to);
    const destinationCode = destinationCodes.get(physicalKey) ?? airportCodeOn(route.to, context?.referenceDate);
    const options = destinations.get(destinationCode) ?? [];
    for (const listed of route.carriers) {
      if (!eligibleCarriers.has(listed.code)) continue;
      // Live rows expose IATA only. They cannot be attached to or promoted as
      // a qualified entity option without matching entity evidence.
      if (options.some(option => option.carrier === listed.code && option.carrierEntityKey)) continue;
      if (!canUsePassengerRoute(listed.code, route.from, route.to, context?.referenceDate ?? live.checkedAt.slice(0, 10), context?.productId, undefined, context?.passengerUseCatalog)) continue;
      const liveSignal = {
        liveWeeklySchedule: listed.weeklySchedule,
        liveSeasonalityLabel: route.seasonalityLabel,
        liveSeasonalNote: listed.seasonalNote,
      } as const;
      const existing = options.findIndex((option) => option.carrier === listed.code && !option.carrierEntityKey);
      if (existing >= 0) {
        options[existing] = { ...options[existing]!, ...liveSignal };
        continue;
      }
      const option: NextLegOption = {
        carrier: listed.code,
        from: route.from,
        to: destinationCode,
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
        ...liveSignal,
      };
      options.push(option);
    }
    if (options.length > 0) {
      destinationCodes.set(physicalKey, destinationCode);
      destinations.set(destinationCode, options.sort((a, b) => a.carrier.localeCompare(b.carrier)));
    }
  }
  return [...destinations.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([iata, options]) => ({ iata, options }));
}
