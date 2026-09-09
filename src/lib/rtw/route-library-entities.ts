import { distanceNm } from '../calc/haversine.ts';
import type { ContinentId } from '../schemas/country-continent.ts';
import type { RouteNetworkCatalog, RouteNetworkEntry, RouteNetworkSource } from '../schemas/route-network.ts';
import type { Airport } from '../types.ts';

export type RouteLibraryEntitySelection =
  | { readonly kind: 'airport'; readonly id: string }
  | { readonly kind: 'airline'; readonly id: string }
  | { readonly kind: 'route'; readonly id: string };

export interface RouteLibraryCarrierRoute {
  readonly carrier: string;
  readonly name: string;
  readonly identity: 'operating' | 'provider-listed';
  readonly confirmedNumbers: ReadonlyArray<string>;
  readonly candidateNumbers: ReadonlyArray<string>;
  readonly sources: ReadonlyArray<RouteNetworkSource>;
}

export interface RouteLibraryRouteCard {
  readonly from: Airport;
  readonly to: Airport;
  readonly carriers: ReadonlyArray<RouteLibraryCarrierRoute>;
  readonly distanceNm: number;
}

export interface AirportEntityProfile {
  readonly airport: Airport;
  readonly outgoingRoutes: ReadonlyArray<RouteLibraryRouteCard>;
  readonly incomingRouteCount: number;
  readonly destinationCount: number;
  readonly airlineCount: number;
  readonly countryCount: number;
  readonly confirmedRouteCount: number;
}

export interface AirlineEntityProfile {
  readonly carrier: string;
  readonly name: string;
  readonly routes: ReadonlyArray<RouteLibraryRouteCard>;
  readonly airportCount: number;
  readonly countryCount: number;
  readonly confirmedRouteCount: number;
  readonly operatingRouteCount: number;
  readonly topHubs: ReadonlyArray<{ readonly airport: Airport; readonly connections: number }>;
}

export interface RouteEntityProfile {
  readonly route: RouteLibraryRouteCard;
}

export interface RouteLibraryFingerprint {
  readonly routes: ReadonlyArray<RouteLibraryRouteCard>;
  readonly hubs: ReadonlyArray<{ readonly airport: Airport; readonly connections: number }>;
  readonly coreHubs: ReadonlyArray<{ readonly airport: Airport; readonly connections: number }>;
}

export interface RouteLibrarySearchResult {
  readonly key: string;
  readonly selection: RouteLibraryEntitySelection;
  readonly kind: 'airport' | 'airline' | 'route' | 'flight';
  readonly title: string;
  readonly subtitle: string;
}

export interface BuildRouteLibraryEntityInput {
  readonly network: RouteNetworkCatalog;
  readonly airports: ReadonlyMap<string, Airport>;
  readonly carrierNames: ReadonlyMap<string, string>;
  readonly memberCodes?: ReadonlySet<string> | null | undefined;
}

function publishedRows(input: BuildRouteLibraryEntityInput): ReadonlyArray<RouteNetworkEntry> {
  return input.network.routes.filter((route) => route.status === 'published'
    && (!input.memberCodes || input.memberCodes.has(route.carrier)));
}

function carriersForPair(
  rows: ReadonlyArray<RouteNetworkEntry>,
  network: RouteNetworkCatalog,
  carrierNames: ReadonlyMap<string, string>,
): ReadonlyArray<RouteLibraryCarrierRoute> {
  const sourceById = new Map(network.sources.map((source) => [source.id, source] as const));
  return rows.map((row) => {
    const sourceIds = new Set([
      ...row.sourceIds,
      ...(row.flightNumberSourceIds ?? []),
      ...(row.flightNumberCandidateSourceIds ?? []),
    ]);
    return {
      carrier: row.carrier,
      name: carrierNames.get(row.carrier) ?? row.carrier,
      identity: row.carrierIdentity ?? 'operating',
      confirmedNumbers: row.flightNumbers ?? [],
      candidateNumbers: row.flightNumberCandidates ?? [],
      sources: [...sourceIds].map((id) => sourceById.get(id)).filter((source): source is RouteNetworkSource => source !== undefined),
    };
  }).sort((a, b) => {
    if (a.identity !== b.identity) return a.identity === 'operating' ? -1 : 1;
    return a.carrier.localeCompare(b.carrier);
  });
}

function buildPairCards(input: BuildRouteLibraryEntityInput, rows: ReadonlyArray<RouteNetworkEntry>): ReadonlyArray<RouteLibraryRouteCard> {
  const grouped = new Map<string, RouteNetworkEntry[]>();
  for (const row of rows) {
    const key = `${row.pair[0]}-${row.pair[1]}`;
    const bucket = grouped.get(key) ?? [];
    bucket.push(row);
    grouped.set(key, bucket);
  }
  return [...grouped.values()].flatMap((pairRows) => {
    const first = pairRows[0];
    if (!first) return [];
    const from = input.airports.get(first.pair[0]);
    const to = input.airports.get(first.pair[1]);
    if (!from || !to) return [];
    return [{
      from,
      to,
      carriers: carriersForPair(pairRows, input.network, input.carrierNames),
      distanceNm: Math.round(distanceNm(from, to)),
    }];
  });
}

/**
 * Build a bounded visual fingerprint for a large airline/alliance network.
 * The ranking rewards hub-to-hub strength and long-haul reach, while the
 * endpoint quota prevents one mega-hub from consuming the entire overview.
 */
export function buildRouteLibraryFingerprint(
  input: BuildRouteLibraryEntityInput,
  limit = 120,
): RouteLibraryFingerprint {
  const rows = publishedRows(input);
  const directedPairs = new Map<string, RouteNetworkEntry[]>();
  for (const row of rows) {
    const key = `${row.pair[0]}-${row.pair[1]}`;
    const bucket = directedPairs.get(key) ?? [];
    bucket.push(row);
    directedPairs.set(key, bucket);
  }
  const degree = new Map<string, number>();
  for (const pairRows of directedPairs.values()) {
    const first = pairRows[0];
    if (!first) continue;
    degree.set(first.pair[0], (degree.get(first.pair[0]) ?? 0) + 1);
    degree.set(first.pair[1], (degree.get(first.pair[1]) ?? 0) + 1);
  }

  const hubs = [...degree.entries()]
    .map(([iata, connections]) => ({ airport: input.airports.get(iata), connections }))
    .filter((row): row is { airport: Airport; connections: number } => row.airport !== undefined)
    .sort((a, b) => b.connections - a.connections || a.airport.iata.localeCompare(b.airport.iata));
  const coreHubs = hubs.slice(0, 16);

  const bestDirection = new Map<string, { readonly rows: ReadonlyArray<RouteNetworkEntry>; readonly from: Airport; readonly to: Airport; readonly distanceNm: number }>();
  for (const pairRows of directedPairs.values()) {
    const first = pairRows[0];
    if (!first) continue;
    const from = input.airports.get(first.pair[0]);
    const to = input.airports.get(first.pair[1]);
    if (!from || !to) continue;
    const key = [from.iata, to.iata].sort().join('-');
    const candidate = { rows: pairRows, from, to, distanceNm: Math.round(distanceNm(from, to)) };
    const previous = bestDirection.get(key);
    if (!previous) {
      bestDirection.set(key, candidate);
      continue;
    }
    const candidateConfirmed = pairRows.some((row) => (row.flightNumbers?.length ?? 0) > 0) ? 1 : 0;
    const previousConfirmed = previous.rows.some((row) => (row.flightNumbers?.length ?? 0) > 0) ? 1 : 0;
    if (candidateConfirmed > previousConfirmed || (candidateConfirmed === previousConfirmed && pairRows.length > previous.rows.length)) {
      bestDirection.set(key, candidate);
    }
  }

  const scored = [...bestDirection.values()].map((candidate) => {
    const fromDegree = degree.get(candidate.from.iata) ?? 1;
    const toDegree = degree.get(candidate.to.iata) ?? 1;
    const hubStrength = Math.sqrt(fromDegree * toDegree);
    const distanceWeight = 1 + Math.min(candidate.distanceNm / 3_500, 1.7);
    const carrierWeight = 1 + Math.min(candidate.rows.length - 1, 3) * 0.08;
    return { candidate, score: hubStrength * distanceWeight * carrierWeight };
  }).sort((a, b) => b.score - a.score
    || b.candidate.distanceNm - a.candidate.distanceNm
    || `${a.candidate.from.iata}-${a.candidate.to.iata}`.localeCompare(`${b.candidate.from.iata}-${b.candidate.to.iata}`));

  const endpointCount = new Map<string, number>();
  const endpointQuota = Math.max(8, Math.ceil(limit / 10));
  const selected: typeof scored = [];
  for (const row of scored) {
    if (selected.length >= limit) break;
    const fromCount = endpointCount.get(row.candidate.from.iata) ?? 0;
    const toCount = endpointCount.get(row.candidate.to.iata) ?? 0;
    if (fromCount >= endpointQuota || toCount >= endpointQuota) continue;
    selected.push(row);
    endpointCount.set(row.candidate.from.iata, fromCount + 1);
    endpointCount.set(row.candidate.to.iata, toCount + 1);
  }

  if (selected.length < Math.min(limit, scored.length)) {
    const selectedIds = new Set(selected.map((row) => [row.candidate.from.iata, row.candidate.to.iata].sort().join('-')));
    for (const row of scored) {
      if (selected.length >= limit) break;
      const id = [row.candidate.from.iata, row.candidate.to.iata].sort().join('-');
      if (selectedIds.has(id)) continue;
      selected.push(row);
      selectedIds.add(id);
    }
  }

  const selectedRows = selected.flatMap((row) => row.candidate.rows);
  return { routes: buildPairCards(input, selectedRows), hubs, coreHubs };
}

export function buildAirportEntityProfile(input: BuildRouteLibraryEntityInput, iata: string): AirportEntityProfile | null {
  const airport = input.airports.get(iata.toUpperCase());
  if (!airport) return null;
  const rows = publishedRows(input);
  const outgoingRows = rows.filter((row) => row.pair[0] === airport.iata);
  const incomingRouteCount = new Set(rows.filter((row) => row.pair[1] === airport.iata).map((row) => row.pair.join('-'))).size;
  const outgoingRoutes = [...buildPairCards(input, outgoingRows)].sort((a, b) =>
    b.carriers.length - a.carriers.length || a.to.city.localeCompare(b.to.city));
  const airlines = new Set(outgoingRows.map((row) => row.carrier));
  const countries = new Set(outgoingRoutes.map((route) => route.to.country));
  return {
    airport,
    outgoingRoutes,
    incomingRouteCount,
    destinationCount: outgoingRoutes.length,
    airlineCount: airlines.size,
    countryCount: countries.size,
    confirmedRouteCount: outgoingRoutes.filter((route) => route.carriers.some((carrier) => carrier.confirmedNumbers.length > 0)).length,
  };
}

export function buildAirlineEntityProfile(input: BuildRouteLibraryEntityInput, carrier: string): AirlineEntityProfile | null {
  const code = carrier.toUpperCase();
  const rows = publishedRows(input).filter((row) => row.carrier === code);
  if (rows.length === 0) return null;
  const routes = buildPairCards(input, rows).map((route) => ({
    ...route,
    carriers: route.carriers.filter((row) => row.carrier === code),
  }));
  const airportsUsed = new Set<string>();
  const countries = new Set<string>();
  const degree = new Map<string, number>();
  for (const route of routes) {
    airportsUsed.add(route.from.iata);
    airportsUsed.add(route.to.iata);
    countries.add(route.from.country);
    countries.add(route.to.country);
    degree.set(route.from.iata, (degree.get(route.from.iata) ?? 0) + 1);
    degree.set(route.to.iata, (degree.get(route.to.iata) ?? 0) + 1);
  }
  const topHubs = [...degree.entries()]
    .map(([iata, connections]) => ({ airport: input.airports.get(iata), connections }))
    .filter((row): row is { airport: Airport; connections: number } => row.airport !== undefined)
    .sort((a, b) => b.connections - a.connections || a.airport.iata.localeCompare(b.airport.iata))
    .slice(0, 10);
  return {
    carrier: code,
    name: input.carrierNames.get(code) ?? code,
    routes,
    airportCount: airportsUsed.size,
    countryCount: countries.size,
    confirmedRouteCount: rows.filter((row) => (row.flightNumbers?.length ?? 0) > 0).length,
    operatingRouteCount: rows.filter((row) => (row.carrierIdentity ?? 'operating') === 'operating').length,
    topHubs,
  };
}

export function buildRouteEntityProfile(input: BuildRouteLibraryEntityInput, id: string): RouteEntityProfile | null {
  const match = /^([A-Z]{3})-([A-Z]{3})$/i.exec(id.trim());
  if (!match) return null;
  const from = match[1]!.toUpperCase();
  const to = match[2]!.toUpperCase();
  const rows = publishedRows(input).filter((row) => row.pair[0] === from && row.pair[1] === to);
  const route = buildPairCards(input, rows)[0];
  return route ? { route } : null;
}

export function routeLibraryEntityContinent(
  airport: Airport,
  countryContinents?: ReadonlyMap<string, ContinentId> | null,
  airportContinentOverrides?: ReadonlyMap<string, ContinentId> | null,
): ContinentId | 'unmapped' {
  return airportContinentOverrides?.get(airport.iata) ?? countryContinents?.get(airport.country) ?? 'unmapped';
}

export function searchRouteLibraryEntities(
  input: BuildRouteLibraryEntityInput & { readonly query: string; readonly locale?: 'en' | 'zh-TW' },
): ReadonlyArray<RouteLibrarySearchResult> {
  const query = input.query.trim();
  if (!query) return [];
  const upper = query.toUpperCase().replace(/\s+/g, ' ');
  const results: RouteLibrarySearchResult[] = [];
  const seen = new Set<string>();
  const add = (row: RouteLibrarySearchResult): void => {
    if (seen.has(row.key) || results.length >= 12) return;
    seen.add(row.key);
    results.push(row);
  };

  const addAirport = (airport: Airport): void => add({
    key: `airport:${airport.iata}`,
    selection: { kind: 'airport', id: airport.iata },
    kind: 'airport',
    title: `${airport.iata} · ${airport.city}`,
    subtitle: `${airport.name} · ${airport.country}`,
  });
  const addAirline = (carrier: string, name: string): void => add({
    key: `airline:${carrier}`,
    selection: { kind: 'airline', id: carrier },
    kind: 'airline',
    title: `${carrier} · ${name}`,
    subtitle: input.locale === 'zh-TW' ? '航空公司航網' : 'Airline network',
  });

  const routeMatch = /^([A-Z]{3})\s*(?:-|→|>|TO|\s)\s*([A-Z]{3})$/.exec(upper);
  if (routeMatch && input.airports.has(routeMatch[1]!) && input.airports.has(routeMatch[2]!)) {
    const id = `${routeMatch[1]}-${routeMatch[2]}`;
    const profile = buildRouteEntityProfile(input, id);
    if (profile) add({
      key: `route:${id}`,
      selection: { kind: 'route', id },
      kind: 'route',
      title: `${routeMatch[1]} → ${routeMatch[2]}`,
      subtitle: `${profile.route.from.city} → ${profile.route.to.city} · ${profile.route.carriers.length} airlines`,
    });
  }

  const exactAirport = input.airports.get(upper);
  if (exactAirport) addAirport(exactAirport);
  const exactAirlineName = input.carrierNames.get(upper);
  if (exactAirlineName) addAirline(upper, exactAirlineName);

  if (/^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/.test(upper)) {
    for (const row of publishedRows(input)) {
      if (!(row.flightNumbers ?? []).includes(upper) && !(row.flightNumberCandidates ?? []).includes(upper)) continue;
      const id = row.pair.join('-');
      add({
        key: `flight:${upper}:${id}`,
        selection: { kind: 'route', id },
        kind: 'flight',
        title: `${upper} · ${row.pair[0]} → ${row.pair[1]}`,
        subtitle: input.carrierNames.get(row.carrier) ?? row.carrier,
      });
    }
  }

  const airportMatches = [...input.airports.values()]
    .filter((airport) => airport.iata.startsWith(upper)
      || airport.city.toUpperCase().includes(upper)
      || airport.name.toUpperCase().includes(upper))
    .filter((airport) => airport.iata !== upper)
    .sort((a, b) => {
      const rank = (airport: Airport): number => {
        if (airport.iata.startsWith(upper)) return 0;
        if (airport.city.toUpperCase().startsWith(upper)) return 1;
        if (airport.name.toUpperCase().startsWith(upper)) return 2;
        if (airport.city.toUpperCase().includes(upper)) return 3;
        return 4;
      };
      return rank(a) - rank(b) || a.iata.localeCompare(b.iata);
    })
    .slice(0, 6);
  for (const airport of airportMatches) addAirport(airport);

  const airlineMatches = [...input.carrierNames.entries()]
    .filter(([carrier, name]) => carrier !== upper && (carrier.includes(upper) || name.toUpperCase().includes(upper)))
    .sort(([carrierA, nameA], [carrierB, nameB]) => {
      const rank = (carrier: string, name: string): number => {
        if (carrier.startsWith(upper)) return 0;
        if (name.toUpperCase().startsWith(upper)) return 1;
        return 2;
      };
      return rank(carrierA, nameA) - rank(carrierB, nameB) || carrierA.localeCompare(carrierB);
    });
  for (const [carrier, name] of airlineMatches) addAirline(carrier, name);
  return results;
}
