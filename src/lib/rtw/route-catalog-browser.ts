import type { ScheduleEntry } from '../schemas/flight-schedules.ts';
import type { ContinentId } from '../schemas/country-continent.ts';
import type { RouteNetworkCatalog } from '../schemas/route-network.ts';
import type { Airport } from '../types.ts';

export type RouteCatalogGroupMode = 'from' | 'to';
export type RouteCatalogContinent = ContinentId | 'unmapped';

/** Minimal publication shape consumed by the browser. Kept structural so the
 * browser stays independent from the dated-schedule subsystem's schema. */
export interface RouteBrowserOfficialSource {
  readonly name: string;
  readonly url: string;
  readonly checkedAt: string;
}

export interface RouteBrowserOfficialService {
  readonly id: string;
  readonly carrier: string;
  readonly flightNumber: string;
  readonly from: string;
  readonly to: string;
  readonly effectiveFrom: string;
  readonly effectiveUntil?: string | undefined;
  readonly daysOfWeek: ReadonlyArray<number>;
  readonly addedDates: ReadonlyArray<string>;
  readonly departureTime?: string | undefined;
  readonly arrivalTime?: string | undefined;
  readonly arrivalDayOffset?: number | undefined;
  readonly sourceId: string;
}

export interface RouteBrowserFlightNumberReference {
  readonly id: string;
  readonly carrier: string;
  readonly from: string;
  readonly to: string;
  readonly flightNumbers: ReadonlyArray<string>;
  readonly sourceId: string;
}

export interface RouteBrowserOfficialCatalog {
  readonly sources: Readonly<Record<string, RouteBrowserOfficialSource>>;
  readonly services: ReadonlyArray<RouteBrowserOfficialService>;
  readonly flightNumberReferences?: ReadonlyArray<RouteBrowserFlightNumberReference> | undefined;
}

export interface RouteCatalogSourceView {
  readonly url: string;
  readonly label: string;
  readonly note?: string | undefined;
  readonly checkedOn?: string | undefined;
}

export interface RouteCatalogEvidenceView {
  readonly id: string;
  readonly kind: 'route' | 'weekly-schedule' | 'official-service' | 'flight-number-reference' | 'flight-number-candidate';
  readonly flightNumbers: ReadonlyArray<string>;
  readonly candidateFlightNumbers: ReadonlyArray<string>;
  readonly daysOfWeek: ReadonlyArray<number>;
  readonly addedDates: ReadonlyArray<string>;
  readonly effectiveFrom?: string | undefined;
  readonly effectiveUntil?: string | undefined;
  readonly departureTime?: string | undefined;
  readonly arrivalTime?: string | undefined;
  readonly arrivalDayOffset?: number | undefined;
  readonly source: RouteCatalogSourceView | null;
}

export interface RouteCatalogCarrierView {
  readonly carrier: string;
  readonly identity: 'operating' | 'provider-listed';
  readonly flightNumbers: ReadonlyArray<string>;
  readonly candidateFlightNumbers: ReadonlyArray<string>;
  readonly evidence: ReadonlyArray<RouteCatalogEvidenceView>;
}

export interface RouteCatalogPairView {
  readonly from: string;
  readonly to: string;
  readonly fromAirport: Airport | null;
  readonly toAirport: Airport | null;
  readonly carriers: ReadonlyArray<RouteCatalogCarrierView>;
  readonly flightCount: number;
}

export interface RouteCatalogAirportGroup {
  readonly airport: Airport | null;
  readonly iata: string;
  readonly routes: ReadonlyArray<RouteCatalogPairView>;
  readonly routeCount: number;
  readonly carrierCount: number;
  readonly flightCount: number;
}

export interface RouteCatalogCountryGroup {
  readonly country: string;
  readonly airports: ReadonlyArray<RouteCatalogAirportGroup>;
  readonly routeCount: number;
  readonly carrierCount: number;
  readonly flightCount: number;
}

export interface RouteCatalogContinentGroup {
  readonly continent: RouteCatalogContinent;
  readonly countries: ReadonlyArray<RouteCatalogCountryGroup>;
  readonly airportCount: number;
  readonly routeCount: number;
  readonly carrierCount: number;
  readonly flightCount: number;
}

interface MutableCarrier {
  carrier: string;
  identity: 'operating' | 'provider-listed';
  flightNumbers: Set<string>;
  candidateFlightNumbers: Set<string>;
  evidence: RouteCatalogEvidenceView[];
}

interface MutablePair {
  from: string;
  to: string;
  carriers: Map<string, MutableCarrier>;
}

const CONTINENT_ORDER: ReadonlyArray<RouteCatalogContinent> = [
  'asia',
  'europe',
  'north-america',
  'south-america',
  'oceania',
  'africa',
  'antarctica',
  'unmapped',
];

function fullFlightNumber(carrier: string, flightNumber: string): string {
  const normalized = flightNumber.toUpperCase().replace(/\s+/g, '');
  return normalized.startsWith(carrier) ? normalized : `${carrier}${normalized}`;
}

function compareFlightNumbers(a: string, b: string): number {
  const split = (value: string): readonly [string, number, string] => {
    const match = /^([A-Z0-9]{2,3})(\d+)([A-Z]?)$/.exec(value);
    if (!match) return [value, Number.MAX_SAFE_INTEGER, ''];
    return [match[1]!, Number(match[2]), match[3] ?? ''];
  };
  const aa = split(a);
  const bb = split(b);
  return aa[0].localeCompare(bb[0]) || aa[1] - bb[1] || aa[2].localeCompare(bb[2]);
}

function sourceFromPublication(source: RouteBrowserOfficialSource | undefined): RouteCatalogSourceView | null {
  if (!source) return null;
  return {
    url: source.url,
    label: source.name,
    checkedOn: source.checkedAt.slice(0, 10),
  };
}

function pairBucket(pairs: Map<string, MutablePair>, from: string, to: string): MutablePair {
  const key = `${from}-${to}`;
  let pair = pairs.get(key);
  if (!pair) {
    pair = { from, to, carriers: new Map() };
    pairs.set(key, pair);
  }
  return pair;
}

function carrierBucket(pair: MutablePair, carrier: string, identity: 'operating' | 'provider-listed'): MutableCarrier {
  let row = pair.carriers.get(carrier);
  if (!row) {
    row = { carrier, identity, flightNumbers: new Set(), candidateFlightNumbers: new Set(), evidence: [] };
    pair.carriers.set(carrier, row);
  } else if (identity === 'operating') {
    row.identity = 'operating';
  }
  return row;
}

function evidenceKey(row: RouteCatalogEvidenceView): string {
  return [
    row.kind,
    row.id,
    row.flightNumbers.join(','),
    row.candidateFlightNumbers.join(','),
    row.daysOfWeek.join(','),
    row.addedDates.join(','),
    row.effectiveFrom ?? '',
    row.effectiveUntil ?? '',
    row.departureTime ?? '',
    row.arrivalTime ?? '',
    row.source?.url ?? '',
  ].join('|');
}

function pushEvidence(carrier: MutableCarrier, evidence: RouteCatalogEvidenceView): void {
  const key = evidenceKey(evidence);
  if (!carrier.evidence.some((row) => evidenceKey(row) === key)) carrier.evidence.push(evidence);
  evidence.flightNumbers.forEach((flight) => carrier.flightNumbers.add(flight));
  evidence.candidateFlightNumbers.forEach((flight) => {
    if (!carrier.flightNumbers.has(flight)) carrier.candidateFlightNumbers.add(flight);
  });
  evidence.flightNumbers.forEach((flight) => carrier.candidateFlightNumbers.delete(flight));
}

export interface BuildRouteCatalogPairsInput {
  readonly routeNetwork?: RouteNetworkCatalog | null | undefined;
  readonly schedules?: ReadonlyArray<ScheduleEntry> | null | undefined;
  readonly officialSchedules?: RouteBrowserOfficialCatalog | null | undefined;
  readonly memberCodes: ReadonlySet<string>;
  readonly airports?: ReadonlyMap<string, Airport> | null | undefined;
}

/**
 * Merge route-level, weekly-schedule and official-publication evidence into a
 * pair-first browser model. This never upgrades a provider-listed route to an
 * operating claim unless schedule/publication evidence for that exact carrier
 * and directional pair exists.
 */
export function buildRouteCatalogPairs(input: BuildRouteCatalogPairsInput): ReadonlyArray<RouteCatalogPairView> {
  const pairs = new Map<string, MutablePair>();
  const routeSources = new Map(input.routeNetwork?.sources.map((source) => [source.id, source] as const) ?? []);
  // The runtime route graph is the current-state authority. A newer
  // correction may retire or de-attribue a route while an older weekly/
  // official flight-number reference still exists. Do not let those older
  // auxiliary layers resurrect an explicitly non-published carrier+pair.
  const blockedRouteKeys = new Set(
    (input.routeNetwork?.routes ?? [])
      .filter((route) => route.status !== 'published')
      .map((route) => `${route.carrier}:${route.pair[0]}-${route.pair[1]}`),
  );
  const blocked = (carrier: string, from: string, to: string): boolean =>
    blockedRouteKeys.has(`${carrier}:${from}-${to}`);

  for (const route of input.routeNetwork?.routes ?? []) {
    if (route.status !== 'published' || !input.memberCodes.has(route.carrier)) continue;
    const pair = pairBucket(pairs, route.pair[0], route.pair[1]);
    const carrier = carrierBucket(pair, route.carrier, route.carrierIdentity ?? 'operating');
    for (const sourceId of route.sourceIds) {
      const source = routeSources.get(sourceId);
      pushEvidence(carrier, {
        id: `route:${route.carrier}:${route.pair[0]}-${route.pair[1]}:${sourceId}`,
        kind: 'route',
        flightNumbers: [],
        candidateFlightNumbers: [],
        daysOfWeek: [],
        addedDates: [],
        effectiveFrom: route.effectiveFrom,
        effectiveUntil: route.effectiveUntil,
        source: source ? {
          url: source.url,
          label: source.note,
          note: source.note,
          checkedOn: source.checkedOn,
        } : null,
      });
    }
    for (const sourceId of route.flightNumberSourceIds ?? []) {
      const source = routeSources.get(sourceId);
      pushEvidence(carrier, {
        id: `route-number:${route.carrier}:${route.pair[0]}-${route.pair[1]}:${sourceId}`,
        kind: 'flight-number-reference',
        flightNumbers: route.flightNumbers ?? [],
        candidateFlightNumbers: [],
        daysOfWeek: [], addedDates: [],
        source: source ? { url: source.url, label: source.note, note: source.note, checkedOn: source.checkedOn } : null,
      });
    }
    for (const sourceId of route.flightNumberCandidateSourceIds ?? []) {
      const source = routeSources.get(sourceId);
      pushEvidence(carrier, {
        id: `route-number-candidate:${route.carrier}:${route.pair[0]}-${route.pair[1]}:${sourceId}`,
        kind: 'flight-number-candidate',
        flightNumbers: [],
        candidateFlightNumbers: route.flightNumberCandidates ?? [],
        daysOfWeek: [], addedDates: [],
        source: source ? { url: source.url, label: source.note, note: source.note, checkedOn: source.checkedOn } : null,
      });
    }
  }

  for (const schedule of input.schedules ?? []) {
    if (schedule.status === 'suspended' || !input.memberCodes.has(schedule.carrier)
      || blocked(schedule.carrier, schedule.pair[0], schedule.pair[1])) continue;
    const pair = pairBucket(pairs, schedule.pair[0], schedule.pair[1]);
    const carrier = carrierBucket(pair, schedule.carrier, 'operating');
    const flights = (schedule.flightNumbers ?? []).map((number) => fullFlightNumber(schedule.carrier, number));
    pushEvidence(carrier, {
      id: `weekly:${schedule.carrier}:${schedule.pair[0]}-${schedule.pair[1]}:${schedule.seasonStart ?? ''}:${schedule.seasonEnd ?? ''}`,
      kind: 'weekly-schedule',
      flightNumbers: flights,
      candidateFlightNumbers: [],
      daysOfWeek: schedule.daysOfWeek,
      addedDates: [],
      effectiveFrom: schedule.effectiveFrom,
      effectiveUntil: schedule.effectiveUntil ?? undefined,
      source: schedule.sourceUrls[0] ? {
        url: schedule.sourceUrls[0],
        label: schedule.confidence === 'chart-verified' ? 'Verified schedule source' : 'Schedule reference',
      } : null,
    });
  }

  const official = input.officialSchedules;
  for (const service of official?.services ?? []) {
    if (!input.memberCodes.has(service.carrier) || blocked(service.carrier, service.from, service.to)) continue;
    const pair = pairBucket(pairs, service.from, service.to);
    const carrier = carrierBucket(pair, service.carrier, 'operating');
    pushEvidence(carrier, {
      id: `official:${service.id}`,
      kind: 'official-service',
      flightNumbers: [fullFlightNumber(service.carrier, service.flightNumber)],
      candidateFlightNumbers: [],
      daysOfWeek: service.daysOfWeek,
      addedDates: service.addedDates,
      effectiveFrom: service.effectiveFrom,
      effectiveUntil: service.effectiveUntil,
      departureTime: service.departureTime,
      arrivalTime: service.arrivalTime,
      arrivalDayOffset: service.arrivalDayOffset,
      source: sourceFromPublication(official?.sources[service.sourceId]),
    });
  }

  for (const reference of official?.flightNumberReferences ?? []) {
    if (!input.memberCodes.has(reference.carrier) || blocked(reference.carrier, reference.from, reference.to)) continue;
    const pair = pairBucket(pairs, reference.from, reference.to);
    const carrier = carrierBucket(pair, reference.carrier, 'operating');
    pushEvidence(carrier, {
      id: `reference:${reference.id}`,
      kind: 'flight-number-reference',
      flightNumbers: reference.flightNumbers.map((number) => fullFlightNumber(reference.carrier, number)),
      candidateFlightNumbers: [],
      daysOfWeek: [],
      addedDates: [],
      source: sourceFromPublication(official?.sources[reference.sourceId]),
    });
  }

  return [...pairs.values()]
    .map((pair): RouteCatalogPairView => {
      const carriers = [...pair.carriers.values()]
        .map((carrier): RouteCatalogCarrierView => ({
          carrier: carrier.carrier,
          identity: carrier.identity,
          flightNumbers: [...carrier.flightNumbers].sort(compareFlightNumbers),
          candidateFlightNumbers: [...carrier.candidateFlightNumbers]
            .filter((flight) => !carrier.flightNumbers.has(flight))
            .sort(compareFlightNumbers),
          evidence: [...carrier.evidence].sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id)),
        }))
        .sort((a, b) => a.carrier.localeCompare(b.carrier));
      return {
        from: pair.from,
        to: pair.to,
        fromAirport: input.airports?.get(pair.from) ?? null,
        toAirport: input.airports?.get(pair.to) ?? null,
        carriers,
        flightCount: new Set(carriers.flatMap((carrier) => [...carrier.flightNumbers, ...carrier.candidateFlightNumbers])).size,
      };
    })
    .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
}

export interface GroupRouteCatalogInput {
  readonly pairs: ReadonlyArray<RouteCatalogPairView>;
  readonly mode: RouteCatalogGroupMode;
  readonly countryContinents?: ReadonlyMap<string, ContinentId> | null | undefined;
  readonly airportContinentOverrides?: ReadonlyMap<string, ContinentId> | null | undefined;
}

function continentOf(
  iata: string,
  airport: Airport | null,
  countryContinents: ReadonlyMap<string, ContinentId> | null | undefined,
  overrides: ReadonlyMap<string, ContinentId> | null | undefined,
): RouteCatalogContinent {
  return overrides?.get(iata) ?? (airport ? countryContinents?.get(airport.country) : undefined) ?? 'unmapped';
}

export function groupRouteCatalog(input: GroupRouteCatalogInput): ReadonlyArray<RouteCatalogContinentGroup> {
  const continents = new Map<RouteCatalogContinent, Map<string, Map<string, RouteCatalogPairView[]>>>();
  for (const pair of input.pairs) {
    const iata = input.mode === 'from' ? pair.from : pair.to;
    const airport = input.mode === 'from' ? pair.fromAirport : pair.toAirport;
    const continent = continentOf(iata, airport, input.countryContinents, input.airportContinentOverrides);
    const country = airport?.country ?? 'unmapped';
    let countries = continents.get(continent);
    if (!countries) {
      countries = new Map();
      continents.set(continent, countries);
    }
    let airports = countries.get(country);
    if (!airports) {
      airports = new Map();
      countries.set(country, airports);
    }
    const routes = airports.get(iata) ?? [];
    routes.push(pair);
    airports.set(iata, routes);
  }

  return [...continents.entries()]
    .map(([continent, countries]): RouteCatalogContinentGroup => {
      const countryGroups = [...countries.entries()]
        .map(([country, airports]): RouteCatalogCountryGroup => {
          const airportGroups = [...airports.entries()]
            .map(([iata, routes]): RouteCatalogAirportGroup => {
              const carrierCodes = new Set(routes.flatMap((route) => route.carriers.map((carrier) => carrier.carrier)));
              return {
                iata,
                airport: (input.mode === 'from' ? routes[0]?.fromAirport : routes[0]?.toAirport) ?? null,
                routes: [...routes].sort((a, b) => {
                  const aa = input.mode === 'from' ? a.to : a.from;
                  const bb = input.mode === 'from' ? b.to : b.from;
                  return aa.localeCompare(bb);
                }),
                routeCount: routes.length,
                carrierCount: carrierCodes.size,
                flightCount: new Set(routes.flatMap((route) => route.carriers.flatMap((carrier) => [...carrier.flightNumbers, ...carrier.candidateFlightNumbers]))).size,
              };
            })
            .sort((a, b) => a.iata.localeCompare(b.iata));
          return {
            country,
            airports: airportGroups,
            routeCount: airportGroups.reduce((sum, airport) => sum + airport.routeCount, 0),
            carrierCount: new Set(airportGroups.flatMap((airport) => airport.routes.flatMap((route) => route.carriers.map((carrier) => carrier.carrier)))).size,
            flightCount: new Set(airportGroups.flatMap((airport) => airport.routes.flatMap((route) => route.carriers.flatMap((carrier) => [...carrier.flightNumbers, ...carrier.candidateFlightNumbers])))).size,
          };
        })
        .sort((a, b) => a.country.localeCompare(b.country));
      const allAirports = countryGroups.flatMap((country) => country.airports);
      return {
        continent,
        countries: countryGroups,
        airportCount: allAirports.length,
        routeCount: allAirports.reduce((sum, airport) => sum + airport.routeCount, 0),
        carrierCount: new Set(allAirports.flatMap((airport) => airport.routes.flatMap((route) => route.carriers.map((carrier) => carrier.carrier)))).size,
        flightCount: new Set(allAirports.flatMap((airport) => airport.routes.flatMap((route) => route.carriers.flatMap((carrier) => [...carrier.flightNumbers, ...carrier.candidateFlightNumbers])))).size,
      };
    })
    .sort((a, b) => CONTINENT_ORDER.indexOf(a.continent) - CONTINENT_ORDER.indexOf(b.continent));
}
