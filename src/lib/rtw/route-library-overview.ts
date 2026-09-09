import type { ContinentId } from '../schemas/country-continent.ts';
import type { RouteNetworkCatalog, RouteNetworkEntry } from '../schemas/route-network.ts';
import type { Airport } from '../types.ts';

export type RouteLibraryContinent = ContinentId | 'unmapped';

export interface RouteLibraryCarrierStat {
  readonly carrier: string;
  readonly name: string;
  readonly routes: number;
  readonly confirmedRoutes: number;
}

export interface RouteLibraryHubStat {
  readonly iata: string;
  readonly city: string;
  readonly country: string;
  readonly connections: number;
}

export interface RouteLibraryContinentStat {
  readonly continent: RouteLibraryContinent;
  readonly routes: number;
}

export interface RouteLibraryRepresentativeRoute {
  readonly from: Airport;
  readonly to: Airport;
  readonly score: number;
}

export interface RouteLibraryOverviewModel {
  readonly routeCount: number;
  readonly airportCount: number;
  readonly carrierCount: number;
  readonly operatingCount: number;
  readonly providerListedCount: number;
  readonly confirmedNumberCount: number;
  readonly candidateOnlyCount: number;
  readonly topCarriers: ReadonlyArray<RouteLibraryCarrierStat>;
  readonly topHubs: ReadonlyArray<RouteLibraryHubStat>;
  readonly continents: ReadonlyArray<RouteLibraryContinentStat>;
  readonly representativeRoutes: ReadonlyArray<RouteLibraryRepresentativeRoute>;
}

const CONTINENT_ORDER: ReadonlyArray<RouteLibraryContinent> = [
  'asia', 'europe', 'north-america', 'south-america', 'oceania', 'africa', 'antarctica', 'unmapped',
];

export interface BuildRouteLibraryOverviewInput {
  readonly network: RouteNetworkCatalog;
  readonly memberCodes: ReadonlySet<string>;
  readonly airports: ReadonlyMap<string, Airport>;
  readonly carrierNames?: ReadonlyMap<string, string> | null | undefined;
  readonly countryContinents?: ReadonlyMap<string, ContinentId> | null | undefined;
  readonly airportContinentOverrides?: ReadonlyMap<string, ContinentId> | null | undefined;
}

function routeIsConfirmed(route: RouteNetworkEntry): boolean {
  return (route.flightNumbers?.length ?? 0) > 0;
}

export function buildRouteLibraryOverview(input: BuildRouteLibraryOverviewInput): RouteLibraryOverviewModel {
  const routes = input.network.routes.filter((route) => route.status === 'published' && input.memberCodes.has(route.carrier));
  const airportsUsed = new Set<string>();
  const carrierCounts = new Map<string, { routes: number; confirmed: number }>();
  const hubDegree = new Map<string, number>();
  const continentCounts = new Map<RouteLibraryContinent, number>();
  let operatingCount = 0;
  let providerListedCount = 0;
  let confirmedNumberCount = 0;
  let candidateOnlyCount = 0;

  const continentOf = (iata: string): RouteLibraryContinent => {
    const override = input.airportContinentOverrides?.get(iata);
    if (override) return override;
    const airport = input.airports.get(iata);
    return airport ? input.countryContinents?.get(airport.country) ?? 'unmapped' : 'unmapped';
  };

  for (const route of routes) {
    const [from, to] = route.pair;
    airportsUsed.add(from);
    airportsUsed.add(to);
    hubDegree.set(from, (hubDegree.get(from) ?? 0) + 1);
    hubDegree.set(to, (hubDegree.get(to) ?? 0) + 1);
    const carrier = carrierCounts.get(route.carrier) ?? { routes: 0, confirmed: 0 };
    carrier.routes += 1;
    if (routeIsConfirmed(route)) carrier.confirmed += 1;
    carrierCounts.set(route.carrier, carrier);
    if (route.carrierIdentity === 'provider-listed') providerListedCount += 1;
    else operatingCount += 1;
    if (routeIsConfirmed(route)) confirmedNumberCount += 1;
    else if ((route.flightNumberCandidates?.length ?? 0) > 0) candidateOnlyCount += 1;
    const continent = continentOf(from);
    continentCounts.set(continent, (continentCounts.get(continent) ?? 0) + 1);
  }

  const topCarriers = [...carrierCounts.entries()]
    .map(([carrier, counts]) => ({
      carrier,
      name: input.carrierNames?.get(carrier) ?? carrier,
      routes: counts.routes,
      confirmedRoutes: counts.confirmed,
    }))
    .sort((a, b) => b.routes - a.routes || a.carrier.localeCompare(b.carrier))
    .slice(0, 10);

  const topHubs = [...hubDegree.entries()]
    .map(([iata, connections]) => {
      const airport = input.airports.get(iata);
      return airport ? { iata, city: airport.city || airport.name, country: airport.country, connections } : null;
    })
    .filter((hub): hub is RouteLibraryHubStat => hub !== null)
    .sort((a, b) => b.connections - a.connections || a.iata.localeCompare(b.iata))
    .slice(0, 10);

  const continents = CONTINENT_ORDER
    .map((continent) => ({ continent, routes: continentCounts.get(continent) ?? 0 }))
    .filter((row) => row.routes > 0);

  const uniquePairs = new Set<string>();
  const representativeRoutes = [...routes]
    .sort((a, b) => {
      const scoreA = (hubDegree.get(a.pair[0]) ?? 0) + (hubDegree.get(a.pair[1]) ?? 0);
      const scoreB = (hubDegree.get(b.pair[0]) ?? 0) + (hubDegree.get(b.pair[1]) ?? 0);
      return scoreB - scoreA;
    })
    .flatMap((route) => {
      const from = input.airports.get(route.pair[0]);
      const to = input.airports.get(route.pair[1]);
      if (!from || !to) return [];
      const pairKey = [from.iata, to.iata].sort().join('-');
      if (uniquePairs.has(pairKey)) return [];
      uniquePairs.add(pairKey);
      return [{ from, to, score: (hubDegree.get(from.iata) ?? 0) + (hubDegree.get(to.iata) ?? 0) }];
    })
    .slice(0, 180);

  return {
    routeCount: routes.length,
    airportCount: airportsUsed.size,
    carrierCount: carrierCounts.size,
    operatingCount,
    providerListedCount,
    confirmedNumberCount,
    candidateOnlyCount,
    topCarriers,
    topHubs,
    continents,
    representativeRoutes,
  };
}
