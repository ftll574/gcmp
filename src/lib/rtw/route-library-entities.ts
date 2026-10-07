import { sameAirport, airportIdentityPairKey } from '../airport-identity.ts';
import { distanceNm } from '../calc/haversine.ts';
import type { ContinentId } from '../schemas/country-continent.ts';
import type { RouteNetworkCatalog, RouteNetworkEntry, RouteNetworkSource } from '../schemas/route-network.ts';
import type { Airport } from '../types.ts';
import type { LandingShowcaseCatalog } from '../schemas/landing-showcase.ts';
import { carrierIdentityKey } from '../carrier-identity.ts';
import { routeFlightNumberFreshness } from './time-bound-flight-numbers.ts';

export type RouteLibraryEntitySelection =
  | { readonly kind: 'airport'; readonly id: string }
  | { readonly kind: 'airline'; readonly id: string }
  | { readonly kind: 'route'; readonly id: string };

export interface RouteLibraryCarrierRoute {
  readonly carrier: string;
  readonly carrierEntityKey?: string;
  readonly name: string;
  readonly identity: 'operating' | 'provider-listed' | 'unknown';
  readonly scheduledEndpointPair?: boolean;
  readonly confirmedNumbers: ReadonlyArray<string>;
  readonly referenceNumbers: ReadonlyArray<string>;
  readonly datedFlightNumbers: ReadonlyArray<{
    readonly flightNumber: string;
    readonly occurrencesUTC: ReadonlyArray<string>;
    readonly freshUntilUTC: string;
    readonly candidateWindow?: NonNullable<RouteNetworkEntry['timeBoundFlightNumbers']>[number]['candidateWindow'];
    readonly plannerUse?: NonNullable<RouteNetworkEntry['timeBoundFlightNumbers']>[number]['plannerUse'];
    readonly occurrenceDetails: ReadonlyArray<{
      readonly scheduleTimeUTC: string;
      readonly expiresAtUTC: string;
    readonly sourceId: string;
    readonly freshUntilUTC: string;
      readonly candidateKey?: string;
      readonly sourceAirport?: string;
      readonly sourceOperatingCarrierIATA?: string;
      readonly arrDepRaw?: string;
      readonly carrierEntityName?: string | null;
      readonly carrierEntityNameMapping?: 'unique-trusted-name' | 'not-present-in-curated-registry' | 'unresolved-not-supplied-by-source-record';
      readonly oldCandidateWindowConflict?: boolean;
      readonly oldCandidateWindowConflictOccurrenceCount?: number;
      readonly oldCandidateWindowEffectiveFrom?: string | null;
      readonly oldCandidateWindowEffectiveUntil?: string | null;
      readonly oldCandidateWindowRelationship?: string;
      readonly oldCandidateWindowSource?: string;
      readonly sourceRow?: number;
      readonly sourceUniqueID?: string;
      readonly statusCode?: string;
      readonly viaAirportRaw?: string;
      readonly viaAirports?: ReadonlyArray<string>;
    }>;
  }>;
  readonly candidateNumbers: ReadonlyArray<string>;
  readonly staleNumbers: ReadonlyArray<string>;
  readonly sources: ReadonlyArray<RouteNetworkSource>;
  readonly sourcePairs: ReadonlyArray<readonly [string, string]>;
  readonly registeredPlans: NonNullable<RouteNetworkEntry['registeredPlans']>;
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
  readonly carrierEntityKey?: string;
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

/** A small, explicitly illustrative map graph assembled only from the
 * source-checked legs in the existing landing showcase artifact. It is not a
 * substitute for the complete route catalog used by search and profiles. */
export function buildLandingShowcaseFingerprint(
  catalog: LandingShowcaseCatalog,
  airports: ReadonlyMap<string, Airport>,
  memberCodes?: ReadonlySet<string> | null,
): RouteLibraryFingerprint {
  const routesByDirection = new Map<string, RouteLibraryRouteCard>();
  for (const showcase of catalog.showcases) {
    for (const leg of showcase.legs) {
      if (memberCodes && !memberCodes.has(leg.carrier)) continue;
      const from = airports.get(leg.from);
      const to = airports.get(leg.to);
      if (!from || !to) continue;
      const key = `${from.iata}-${to.iata}`;
      const current = routesByDirection.get(key);
      const carrierKey = `${leg.carrier}:${leg.carrierName}`;
      const currentCarrier = current?.carriers.find(carrier => `${carrier.carrier}:${carrier.name}` === carrierKey);
      const carrier: RouteLibraryCarrierRoute = currentCarrier
        ? { ...currentCarrier, candidateNumbers: [...new Set([...currentCarrier.candidateNumbers, leg.flightNumber])], sourcePairs: [...currentCarrier.sourcePairs, [from.iata, to.iata] as const] }
        : {
            carrier: leg.carrier,
            name: leg.carrierName,
            identity: leg.carrierIdentity,
            confirmedNumbers: [],
            referenceNumbers: [],
            datedFlightNumbers: [],
            candidateNumbers: [leg.flightNumber],
            staleNumbers: [],
            sources: [],
            sourcePairs: [[from.iata, to.iata]],
            registeredPlans: [],
          };
      routesByDirection.set(key, {
        from,
        to,
        distanceNm: leg.distanceNm,
        carriers: currentCarrier
          ? current!.carriers.map(row => `${row.carrier}:${row.name}` === carrierKey ? carrier : row)
          : [...(current?.carriers ?? []), carrier],
      });
    }
  }
  const routes = [...routesByDirection.values()];
  const degrees = new Map<string, number>();
  for (const route of routes) {
    degrees.set(route.from.iata, (degrees.get(route.from.iata) ?? 0) + 1);
    degrees.set(route.to.iata, (degrees.get(route.to.iata) ?? 0) + 1);
  }
  const hubs = [...degrees.entries()]
    .map(([iata, connections]) => ({ airport: airports.get(iata), connections }))
    .filter((row): row is { airport: Airport; connections: number } => row.airport !== undefined)
    .sort((a, b) => b.connections - a.connections || a.airport.iata.localeCompare(b.airport.iata));
  return { routes, hubs, coreHubs: hubs.slice(0, 16) };
}

export interface RouteLibrarySearchResult {
  readonly key: string;
  readonly selection: RouteLibraryEntitySelection;
  readonly kind: 'airport' | 'airline' | 'route' | 'flight';
  readonly title: string;
  readonly subtitle: string;
}

/** Search only the flight/route examples that were loaded for the map preview.
 * Flight numbers stay explicitly marked as candidates; selecting one opens the
 * normal route detail, which resolves its complete evidence from route shards.
 */
export function searchLandingShowcaseEntities(
  catalog: LandingShowcaseCatalog | null | undefined,
  airports: ReadonlyMap<string, Airport>,
  query: string,
  memberCodes?: ReadonlySet<string> | null,
  locale: 'en' | 'zh-TW' = 'en',
): ReadonlyArray<RouteLibrarySearchResult> {
  if (!catalog || !query.trim()) return [];
  const upper = query.trim().toUpperCase().replace(/\s+/g, ' ');
  const results: RouteLibrarySearchResult[] = [];
  const seen = new Set<string>();
  const add = (result: RouteLibrarySearchResult): void => {
    if (seen.has(result.key) || results.length >= 12) return;
    seen.add(result.key);
    results.push(result);
  };
  const routeMatch = /^([A-Z]{3})\s*(?:-|→|>|TO|\s)\s*([A-Z]{3})$/.exec(upper);
  if (routeMatch && airports.has(routeMatch[1]!) && airports.has(routeMatch[2]!)) {
    const from = routeMatch[1]!;
    const to = routeMatch[2]!;
    const found = catalog.showcases.some(showcase => showcase.legs.some(leg =>
      leg.from === from && leg.to === to && (!memberCodes || memberCodes.has(leg.carrier))));
    if (found) add({
      key: `route:${from}-${to}`,
      selection: { kind: 'route', id: `${from}-${to}` },
      kind: 'route',
      title: `${from} → ${to}`,
      subtitle: locale === 'zh-TW' ? '有來源的行程示例 · 航線詳情會顯示候選營運者' : 'Sourced journey example · candidate operators shown in route details',
    });
  }
  if (!/^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/.test(upper)) return results;
  const flightResults: RouteLibrarySearchResult[] = [];
  const flightResultKeys = new Set<string>();
  for (const showcase of catalog.showcases) {
    for (const leg of showcase.legs) {
      if (memberCodes && !memberCodes.has(leg.carrier)) continue;
      const flightNumber = leg.flightNumber.toUpperCase();
      if (!flightNumber.startsWith(upper)) continue;
      const from = airports.get(leg.from);
      const to = airports.get(leg.to);
      if (!from || !to) continue;
      const key = `flight:${flightNumber}:${leg.from}-${leg.to}`;
      if (flightResultKeys.has(key)) continue;
      flightResultKeys.add(key);
      flightResults.push({
        key,
        selection: { kind: 'route', id: `${leg.from}-${leg.to}` },
        kind: 'flight',
        title: `${flightNumber} · ${leg.from} → ${leg.to}`,
        subtitle: locale === 'zh-TW' ? `${leg.carrier} · 示例候選班號，尚未確認` : `${leg.carrier} · Candidate in sourced journey example`,
      });
    }
  }
  flightResults.sort((a, b) => {
    const numberA = a.title.split(' · ')[0] ?? '';
    const numberB = b.title.split(' · ')[0] ?? '';
    return Number(numberB === upper) - Number(numberA === upper)
      || numberA.length - numberB.length
      || a.title.localeCompare(b.title);
  });
  for (const result of flightResults) add(result);
  return results;
}

export interface BuildRouteLibraryEntityInput {
  readonly network: RouteNetworkCatalog;
  readonly airports: ReadonlyMap<string, Airport>;
  readonly carrierNames: ReadonlyMap<string, string>;
  readonly memberCodes?: ReadonlySet<string> | null | undefined;
  readonly evidenceNow?: number | undefined;
}

function publishedRows(input: BuildRouteLibraryEntityInput): ReadonlyArray<RouteNetworkEntry> {
  const sourceById = new Map(input.network.sources.map((source) => [source.id, source] as const));
  return input.network.routes.filter((route) => route.status === 'published'
    && (!input.memberCodes || input.memberCodes.has(route.carrier))
    && (route.service !== 'scheduled-endpoint-pair'
      || routeFlightNumberFreshness(route, sourceById, input.evidenceNow).current.length > 0));
}

function carriersForPair(
  rows: ReadonlyArray<RouteNetworkEntry>,
  sourceById: ReadonlyMap<string, RouteNetworkSource>,
  carrierNames: ReadonlyMap<string, string>,
  evidenceNow = Date.now(),
): ReadonlyArray<RouteLibraryCarrierRoute> {
  const groups = new Map<string, RouteNetworkEntry[]>();
  for (const row of rows) { const key = carrierIdentityKey(row); groups.set(key, [...(groups.get(key) ?? []), row]); }
  return [...groups.values()].map((group) => {
    const row = group.find(row => row.carrierIdentity === 'operating') ?? group.find(row => row.carrierIdentity === 'provider-listed') ?? group[0]!;
    const sourceIds = new Set([
      ...group.flatMap(row => row.sourceIds),
      ...group.flatMap(row => row.flightNumberSourceIds ?? []),
      ...group.flatMap(row => row.flightNumberCandidateSourceIds ?? []),
      ...group.flatMap(row => (row.timeBoundFlightNumbers ?? []).map(evidence => evidence.sourceId)),
    ]);
    const numberStates = group.map(row => routeFlightNumberFreshness(row, sourceById, evidenceNow));
    const verifiedNumbers = new Set<string>();
    const referenceNumbers = new Set<string>();
    group.forEach((route, index) => {
      const operatorVerified = route.carrierIdentity === 'operating' && !route.carrierEntityKey;
      for (const number of numberStates[index]?.current ?? []) {
        (operatorVerified ? verifiedNumbers : referenceNumbers).add(number);
      }
    });
    for (const number of verifiedNumbers) referenceNumbers.delete(number);
    const datedByNumber = new Map<string, {
      flightNumber: string;
      occurrencesUTC: string[];
      freshUntilUTC: string;
      candidateWindow?: NonNullable<RouteNetworkEntry['timeBoundFlightNumbers']>[number]['candidateWindow'];
      plannerUse?: NonNullable<RouteNetworkEntry['timeBoundFlightNumbers']>[number]['plannerUse'];
      occurrenceDetails: RouteLibraryCarrierRoute['datedFlightNumbers'][number]['occurrenceDetails'][number][];
    }>();
    for (const route of group) {
      for (const evidence of route.timeBoundFlightNumbers ?? []) {
        const freshUntilUTC = sourceById.get(evidence.sourceId)?.freshUntilUTC;
        if (!freshUntilUTC) continue;
        const previous = datedByNumber.get(evidence.flightNumber);
        const snapshotAirport = /^avinor-xml-public-(?:batch-)?([a-z]{3})-\d{8}$/.exec(evidence.sourceId)?.[1]?.toUpperCase();
        const endpointDirection = snapshotAirport === route.pair[0]
          ? 'D'
          : snapshotAirport === route.pair[1] ? 'A' : undefined;
        const detailedTimes = new Set((evidence.occurrenceDetails ?? []).map((occurrence) => occurrence.scheduleTimeUTC));
        const occurrenceDetails: RouteLibraryCarrierRoute['datedFlightNumbers'][number]['occurrenceDetails'] = [
          ...(evidence.occurrenceDetails ?? []).map((occurrence) => ({
              ...occurrence,
              sourceId: evidence.sourceId,
              freshUntilUTC,
            })),
          ...evidence.occurrencesUTC.filter((scheduleTimeUTC) => !detailedTimes.has(scheduleTimeUTC)).map((scheduleTimeUTC) => ({
              scheduleTimeUTC,
              expiresAtUTC: scheduleTimeUTC,
              sourceId: evidence.sourceId,
              freshUntilUTC,
              ...(snapshotAirport ? { sourceAirport: snapshotAirport } : {}),
              ...(endpointDirection ? { arrDepRaw: endpointDirection } : {}),
            })),
        ];
        datedByNumber.set(evidence.flightNumber, {
          flightNumber: evidence.flightNumber,
          occurrencesUTC: [...new Set([...(previous?.occurrencesUTC ?? []), ...evidence.occurrencesUTC])].sort(),
          freshUntilUTC: previous && Date.parse(previous.freshUntilUTC) > Date.parse(freshUntilUTC) ? previous.freshUntilUTC : freshUntilUTC,
          ...(evidence.candidateWindow ? { candidateWindow: evidence.candidateWindow } : previous?.candidateWindow ? { candidateWindow: previous.candidateWindow } : {}),
          ...(evidence.plannerUse ? { plannerUse: evidence.plannerUse } : previous?.plannerUse ? { plannerUse: previous.plannerUse } : {}),
          occurrenceDetails: [...(previous?.occurrenceDetails ?? []), ...occurrenceDetails]
            .filter((occurrence, index, all) => all.findIndex((candidate) => candidate.sourceId === occurrence.sourceId
              && candidate.scheduleTimeUTC === occurrence.scheduleTimeUTC
              && candidate.sourceRow === occurrence.sourceRow) === index)
            .sort((a, b) => a.scheduleTimeUTC.localeCompare(b.scheduleTimeUTC) || a.sourceId.localeCompare(b.sourceId)),
        });
      }
    }
    return {
      carrier: row.carrier,
      ...(row.carrierEntityKey ? { carrierEntityKey: row.carrierEntityKey } : {}),
      name: row.carrierEntityName ?? carrierNames.get(row.carrier) ?? row.carrier,
      identity: row.carrierIdentity ?? 'unknown',
      scheduledEndpointPair: group.some((route) => route.service === 'scheduled-endpoint-pair'),
      confirmedNumbers: [...verifiedNumbers].sort(),
      referenceNumbers: [...referenceNumbers].sort(),
      datedFlightNumbers: [...datedByNumber.values()].sort((a, b) => a.flightNumber.localeCompare(b.flightNumber)),
      candidateNumbers: [...new Set(numberStates.flatMap(state => state.candidates))],
      staleNumbers: [...new Set(numberStates.flatMap(state => state.stale))],
      sourcePairs: group.map(row => row.pair),
      registeredPlans: group.flatMap(row => row.registeredPlans ?? []),
      sources: [...sourceIds].map((id) => sourceById.get(id)).filter((source): source is RouteNetworkSource => source !== undefined),
    };
  }).sort((a, b) => {
    if (a.identity !== b.identity) return a.identity === 'operating' ? -1 : 1;
    return a.carrier.localeCompare(b.carrier);
  });
}

function buildPairCards(input: BuildRouteLibraryEntityInput, rows: ReadonlyArray<RouteNetworkEntry>): ReadonlyArray<RouteLibraryRouteCard> {
  const sourceById = new Map(input.network.sources.map((source) => [source.id, source] as const));
  const grouped = new Map<string, RouteNetworkEntry[]>();
  for (const row of rows) {
    const key = airportIdentityPairKey(row.pair[0], row.pair[1]);
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
      carriers: carriersForPair(pairRows, sourceById, input.carrierNames, input.evidenceNow),
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
  const sourceById = new Map(input.network.sources.map(source => [source.id, source] as const));
  const directedPairs = new Map<string, RouteNetworkEntry[]>();
  for (const row of rows) {
    const key = airportIdentityPairKey(row.pair[0], row.pair[1]);
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
    const candidateConfirmed = pairRows.some((row) => routeFlightNumberFreshness(row, sourceById, input.evidenceNow).current.length > 0) ? 1 : 0;
    const previousConfirmed = previous.rows.some((row) => routeFlightNumberFreshness(row, sourceById, input.evidenceNow).current.length > 0) ? 1 : 0;
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
  const outgoingRows = rows.filter((row) => sameAirport(row.pair[0], airport.iata));
  const incomingRouteCount = new Set(rows.filter((row) => sameAirport(row.pair[1], airport.iata)).map((row) => airportIdentityPairKey(row.pair[0], row.pair[1]))).size;
  const outgoingRoutes = buildPairCards(input, outgoingRows).map(route => ({ ...route, from: airport })).sort((a, b) =>
    b.carriers.length - a.carriers.length || a.to.city.localeCompare(b.to.city));
  const airlines = new Set(outgoingRows.map((row) => carrierIdentityKey(row)));
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
  const selection = carrier.includes('+') ? carrier : carrier.toUpperCase();
  const matches = publishedRows(input).filter((row) => row.carrier === selection || row.carrierEntityKey === selection);
  const identities = new Set(matches.map(carrierIdentityKey));
  if (identities.size > 1 && !matches.some(row => row.carrierEntityKey === selection)) return null;
  const rows = matches.filter(row => carrierIdentityKey(row) === selection);
  if (rows.length === 0) return null;
  const sourceById = new Map(input.network.sources.map(source => [source.id, source] as const));
  const code = rows[0]!.carrier;
  const entityKey = rows[0]!.carrierEntityKey;
  const routes = buildPairCards(input, rows).map((route) => ({
    ...route,
    carriers: route.carriers.filter((row) => (row.carrierEntityKey ?? row.carrier) === selection),
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
    ...(entityKey ? { carrierEntityKey: entityKey } : {}),
    name: rows[0]!.carrierEntityName ?? input.carrierNames.get(code) ?? code,
    routes,
    airportCount: airportsUsed.size,
    countryCount: countries.size,
    confirmedRouteCount: rows.filter((row) => row.carrierIdentity === 'operating' && !row.carrierEntityKey
      && routeFlightNumberFreshness(row, sourceById, input.evidenceNow).current.length > 0).length,
    operatingRouteCount: rows.filter((row) => (row.carrierIdentity ?? 'unknown') === 'operating').length,
    topHubs,
  };
}

export function buildRouteEntityProfile(input: BuildRouteLibraryEntityInput, id: string): RouteEntityProfile | null {
  const match = /^([A-Z]{3})-([A-Z]{3})$/i.exec(id.trim());
  if (!match) return null;
  const from = match[1]!.toUpperCase();
  const to = match[2]!.toUpperCase();
  const rows = publishedRows(input).filter((row) => sameAirport(row.pair[0], from) && sameAirport(row.pair[1], to));
  const route = buildPairCards(input, rows)[0];
  return route ? { route: { ...route, from: input.airports.get(from) ?? route.from, to: input.airports.get(to) ?? route.to } } : null;
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
  const sourceById = new Map(input.network.sources.map(source => [source.id, source] as const));
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
  const addAirline = (carrier: string, name: string, titleCode = carrier, subtitle?: string): void => add({
    key: `airline:${carrier}`,
    selection: { kind: 'airline', id: carrier },
    kind: 'airline',
    title: `${titleCode} · ${name}`,
    subtitle: subtitle ?? (input.locale === 'zh-TW' ? '航空公司航網' : 'Airline network'),
  });

  const qualifiedQuery = query;
  if (/^[A-Z]{2}\+[A-Z0-9]{3}\+[a-z0-9]+(?:-[a-z0-9]+)*$/.test(qualifiedQuery)) {
    const entity = input.network.routes.find(row => row.status === 'published' && row.carrierEntityKey === qualifiedQuery);
    if (entity) addAirline(qualifiedQuery, entity.carrierEntityName ?? qualifiedQuery, entity.carrier,
      `IATA ${entity.carrier} · ICAO ${qualifiedQuery.split('+')[1]} · ${qualifiedQuery.split('+')[0]}`);
  }

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
  if (/^[A-Z0-9]{2,3}$/.test(upper)) {
    const matchingCodeRoutes = publishedRows(input).filter((row) => row.carrier === upper);
    const identities = new Set(matchingCodeRoutes.map((row) => carrierIdentityKey(row)));
    if (identities.size === 1) {
      const matching = matchingCodeRoutes[0]!;
      addAirline(matching.carrierEntityKey ?? matching.carrier,
        matching.carrierEntityName ?? input.carrierNames.get(matching.carrier) ?? matching.carrier,
        matching.carrier,
        input.locale === 'zh-TW' ? '以來源代碼識別的航網' : 'Route network identified by source code');
    }
  }

  if (/^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/.test(upper)) {
    const flightResults: RouteLibrarySearchResult[] = [];
    for (const row of publishedRows(input)) {
      const numberState = routeFlightNumberFreshness(row, sourceById, input.evidenceNow);
      const operatorVerified = row.carrierIdentity === 'operating' && !row.carrierEntityKey;
      const confirmed = operatorVerified ? numberState.current.filter(number => number.startsWith(upper)) : [];
      const references = operatorVerified ? [] : numberState.current.filter(number => number.startsWith(upper));
      const candidates = numberState.candidates.filter(number => number.startsWith(upper));
      const stale = numberState.stale;
      for (const number of [...new Set([...confirmed, ...references, ...candidates])]) {
        const id = row.pair.join('-');
        const isConfirmed = confirmed.includes(number);
        const isReference = references.includes(number);
        flightResults.push({
          key: `flight:${number}:${id}`,
          selection: { kind: 'route', id },
          kind: 'flight',
          title: `${number} · ${row.pair[0]} → ${row.pair[1]}`,
          subtitle: `${input.carrierNames.get(row.carrier) ?? row.carrier} · ${stale.includes(number)
            ? (input.locale === 'zh-TW' ? 'Avinor 快照已過期；不列為目前有效的來源班號' : 'Avinor snapshot expired; excluded from current source-listed numbers')
            : isConfirmed
            ? (input.locale === 'zh-TW' ? '營運者核實班號' : 'Operator-verified flight number')
            : isReference
            ? (input.locale === 'zh-TW' ? '班號參考（營運者未核實）' : 'Flight-number reference (operator not verified)')
            : (input.locale === 'zh-TW' ? '候選班號' : 'Candidate flight number')}`,
        });
      }
    }
    flightResults.sort((a, b) => {
      const numberA = a.title.split(' · ')[0] ?? '';
      const numberB = b.title.split(' · ')[0] ?? '';
      return Number(numberB === upper) - Number(numberA === upper)
        || numberA.length - numberB.length
        || a.title.localeCompare(b.title);
    });
    for (const result of flightResults) add(result);
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
  const entityMatches = [...new Map(input.network.routes.filter(row => row.status === 'published' && row.carrierEntityKey && row.carrierEntityName)
    .map(row => [row.carrierEntityKey!, row] as const)).values()]
    .filter(row => row.carrierEntityKey !== upper && row.carrierEntityName!.toUpperCase().includes(upper))
    .sort((a, b) => a.carrierEntityName!.localeCompare(b.carrierEntityName!) || a.carrierEntityKey!.localeCompare(b.carrierEntityKey!));
  for (const row of entityMatches) addAirline(row.carrierEntityKey!, row.carrierEntityName!, row.carrier,
    `IATA ${row.carrier} · ICAO ${row.carrierEntityKey!.split('+')[1]} · ${row.carrierEntityKey!.split('+')[0]}`);
  return results;
}
