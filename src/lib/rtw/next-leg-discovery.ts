import type { ScheduleEntry } from '../schemas/flight-schedules.ts';
import type { LiveRouteWeeklySchedule } from '../schemas/live-routes.ts';
import type { NetworkGapEntry } from '../schemas/network-gaps.ts';
import type {
  FlightNumberReference,
  OfficialScheduleCatalog,
  OfficialService,
  PublicationSource,
} from '../schemas/published-schedules.ts';
import type { RouteNetworkCatalog, RouteNetworkEntry, RouteNetworkSource } from '../schemas/route-network.ts';
import { isScheduleActiveOn, isoWeekday, operatingDaysForDate } from './schedule-days.ts';

export type NextLegScheduleStatus = 'covered' | 'weekday-mismatch' | 'unknown' | 'outside-window';

export interface NextLegOption {
  readonly carrier: string;
  readonly from: string;
  readonly to: string;
  /**
   * Published / observed flight designators attached to the directional
   * schedule rows (for example BR024). These remain schedule references, not
   * seat availability claims. Empty means the route is sourced but this
   * catalog does not currently know a flight number for it.
   */
  readonly flightNumbers: ReadonlyArray<string>;
  /** Route-level standing/marketing designators that are useful for lookup but
   * are not persisted until date/operator evidence is stronger. */
  readonly candidateFlightNumbers: ReadonlyArray<string>;
  readonly scheduleStatus: NextLegScheduleStatus;
  readonly networkSources: ReadonlyArray<RouteNetworkSource>;
  readonly schedules: ReadonlyArray<ScheduleEntry>;
  readonly flightNumberSources: ReadonlyArray<PublicationSource>;
  readonly routeFlightNumberSources: ReadonlyArray<RouteNetworkSource>;
  readonly candidateFlightNumberSources: ReadonlyArray<RouteNetworkSource>;
  readonly routeWindow: { readonly from?: string | undefined; readonly until?: string | undefined } | null;
  /** Fresh current-week listing from the additive live route provider. It may
   * include marketing/codeshare service, so it is display/research evidence
   * only and never upgrades scheduleStatus or operating identity. */
  readonly liveWeeklySchedule?: ReadonlyArray<LiveRouteWeeklySchedule> | undefined;
  readonly liveSeasonalityLabel?: string | null | undefined;
  readonly liveSeasonalNote?: string | null | undefined;
  /** Undefined / confirmed-operating is backed by the existing operating-carrier
   * evidence pipeline. provider-listed means a live route source listed this
   * airline on the route, but dated evidence has not yet confirmed operation. */
  readonly identityStatus?: 'confirmed-operating' | 'provider-listed';
}

export interface NextLegDestination {
  readonly iata: string;
  readonly options: ReadonlyArray<NextLegOption>;
}

/**
 * UI projection of the current source-backed discovery step. The guide is
 * intentionally only one physical nonstop hop deep: it never fabricates a
 * connection or whole itinerary. Consumers such as the map can visualize the
 * same ordered origin -> destination choices shown by the route selector.
 */
export interface NextLegMapGuide {
  readonly origin: string;
  readonly destinations: ReadonlyArray<NextLegDestination>;
}

/** Convert a schedule-catalog designator such as BR024 / CX473 to the
 * `Leg.flightNumber` suffix stored in shared URLs. Returns null rather than
 * guessing when a catalog value does not match the selected operating
 * carrier or the supported flight-number grammar. */
export function flightNumberSuffix(carrier: string, designator: string): string | null {
  const normalizedCarrier = carrier.trim().toUpperCase();
  const normalized = designator.trim().toUpperCase().replace(/\s+/g, '');
  const suffix = normalized.startsWith(normalizedCarrier)
    ? normalized.slice(normalizedCarrier.length)
    : normalized;
  if (normalized !== suffix && !normalized.startsWith(normalizedCarrier)) return null;
  return /^\d{1,4}[A-Z]?$/.test(suffix) ? suffix : null;
}

interface DiscoveryInputs {
  readonly network: RouteNetworkCatalog | null;
  readonly schedules: ReadonlyArray<ScheduleEntry>;
  readonly eligibleCarriers: ReadonlySet<string>;
  readonly referenceDate: string;
  /** Optional UI optimization: when supplied, materialize only this origin's
   * outgoing buckets. Omitted callers retain the full multi-origin index. */
  readonly origin?: string;
  readonly officialSchedules?: OfficialScheduleCatalog;
  readonly evidenceNow?: number;
  readonly networkGaps?: ReadonlyArray<NetworkGapEntry> | null;
  readonly knownAirports?: ReadonlySet<string>;
}

function inWindow(entry: RouteNetworkEntry, date: string): boolean {
  return (!entry.effectiveFrom || date >= entry.effectiveFrom) && (!entry.effectiveUntil || date <= entry.effectiveUntil);
}

function hasNetworkGap(gaps: ReadonlyArray<NetworkGapEntry>, carrier: string, from: string, to: string, date: string): boolean {
  const month = date.slice(0, 7);
  return gaps.some((gap) => {
    if (gap.carrier !== carrier) return false;
    if (!((gap.pair[0] === from && gap.pair[1] === to) || (gap.pair[0] === to && gap.pair[1] === from))) return false;
    const since = gap.since.length === 4 ? `${gap.since}-01` : gap.since;
    const until = gap.until === null ? null : gap.until.length === 4 ? `${gap.until}-01` : gap.until;
    return month >= since && (until === null || month <= until);
  });
}

/**
 * Evidence pipeline (does not mutate routes or generate whole itineraries):
 * observations + schedules -> ordered carrier/from/to buckets
 * -> product eligibility + airport integrity + suspension/gap checks
 * -> schedule status on referenceDate -> origin -> destination -> operators.
 * No reverse edges or weekdays are invented. Operators remain separate.
 */
export function buildNextLegIndex({
  network,
  schedules,
  eligibleCarriers,
  referenceDate,
  origin,
  officialSchedules,
  evidenceNow = Date.now(),
  networkGaps,
  knownAirports,
}: DiscoveryInputs): ReadonlyMap<string, ReadonlyArray<NextLegDestination>> {
  interface Bucket {
    carrier: string;
    from: string;
    to: string;
    route?: RouteNetworkEntry;
    schedules: ScheduleEntry[];
    officialServices: OfficialService[];
    flightNumberReferences: FlightNumberReference[];
  }
  const buckets = new Map<string, Bucket>();
  const sources = new Map(network?.sources.map((source) => [source.id, source]) ?? []);
  function bucket(carrier: string, from: string, to: string): Bucket | null {
    if (origin && from !== origin) return null;
    if (!eligibleCarriers.has(carrier) || from === to) return null;
    if (knownAirports && (!knownAirports.has(from) || !knownAirports.has(to))) return null;
    const key = `${carrier}:${from}-${to}`;
    let result = buckets.get(key);
    if (!result) {
      result = { carrier, from, to, schedules: [], officialServices: [], flightNumberReferences: [] };
      buckets.set(key, result);
    }
    return result;
  }
  for (const route of network?.routes ?? []) {
    const item = bucket(route.carrier, route.pair[0], route.pair[1]);
    if (item) item.route = route;
  }
  for (const schedule of schedules) bucket(schedule.carrier, schedule.pair[0], schedule.pair[1])?.schedules.push(schedule);
  for (const service of officialSchedules?.services ?? []) {
    bucket(service.carrier, service.from, service.to)?.officialServices.push(service);
  }
  for (const reference of officialSchedules?.flightNumberReferences ?? []) {
    bucket(reference.carrier, reference.from, reference.to)?.flightNumberReferences.push(reference);
  }

  const origins = new Map<string, Map<string, NextLegOption[]>>();
  for (const item of buckets.values()) {
    if (hasNetworkGap(networkGaps ?? [], item.carrier, item.from, item.to, referenceDate)) continue;
    if (item.route?.status === 'identity-unresolved') continue;
    if (item.route?.status === 'suspended' && inWindow(item.route, referenceDate)) continue;
    // An explicit suspension takes precedence over an undated observation.
    if (item.schedules.some((row) => row.status === 'suspended' && isScheduleActiveOn({ ...row, status: 'operating' }, referenceDate))) continue;
    const positiveSchedules = item.schedules.filter((row) => row.status !== 'suspended');
    const freshSource = (sourceId: string): PublicationSource | null => {
      const source = officialSchedules?.sources[sourceId];
      if (!source) return null;
      if (Date.parse(source.checkedAt) > evidenceNow + 60000 || Date.parse(source.reviewBy) <= evidenceNow) return null;
      return source;
    };
    const activeOfficialServices = item.officialServices.filter((row) =>
      freshSource(row.sourceId) !== null && referenceDate >= row.effectiveFrom && referenceDate <= row.effectiveUntil,
    );
    const officialRunsToday = activeOfficialServices.some((row) =>
      !row.removedDates.includes(referenceDate) &&
      (row.addedDates.includes(referenceDate) || row.daysOfWeek.includes(isoWeekday(referenceDate))),
    );
    const activeReferences = item.flightNumberReferences.filter((row) => freshSource(row.sourceId) !== null);
    const flightNumberSources = [...new Map([
      ...activeOfficialServices.flatMap((row) => {
        const source = freshSource(row.sourceId);
        return source ? [[source.url, source] as const] : [];
      }),
      ...activeReferences.flatMap((row) => {
        const source = freshSource(row.sourceId);
        return source ? [[source.url, source] as const] : [];
      }),
    ]).values()];
    const networkSources = item.route?.status === 'published'
      ? item.route.sourceIds.flatMap((id) => { const source = sources.get(id); return source ? [source] : []; }) : [];
    if (
      networkSources.length === 0 &&
      positiveSchedules.length === 0 &&
      activeOfficialServices.length === 0 &&
      activeReferences.length === 0
    ) continue;
    const days = operatingDaysForDate(positiveSchedules, item.carrier, item.from, item.to, referenceDate);
    const routeOutside = item.route?.status === 'published' && !inWindow(item.route, referenceDate);
    const scheduleStatus: NextLegScheduleStatus = officialRunsToday
      ? 'covered'
      : days !== null
        ? days.has(isoWeekday(referenceDate)) ? 'covered' : 'weekday-mismatch'
        : activeOfficialServices.length > 0
          ? 'weekday-mismatch'
          : positiveSchedules.length > 0 || item.officialServices.length > 0 || routeOutside
            ? 'outside-window'
            : 'unknown';
    let destinations = origins.get(item.from);
    if (!destinations) { destinations = new Map(); origins.set(item.from, destinations); }
    const options = destinations.get(item.to) ?? [];
    const departureByDesignator = new Map(activeOfficialServices.flatMap((row) =>
      row.departureTime ? [[`${row.carrier}${row.flightNumber}`, row.departureTime] as const] : [],
    ));
    const providerListedOnly = item.route?.carrierIdentity === 'provider-listed'
      && positiveSchedules.length === 0
      && activeOfficialServices.length === 0
      && activeReferences.length === 0;
    const routeFlightNumberSources = (item.route?.flightNumberSourceIds ?? [])
      .flatMap((id) => { const source = sources.get(id); return source ? [source] : []; });
    const candidateFlightNumberSources = (item.route?.flightNumberCandidateSourceIds ?? [])
      .flatMap((id) => { const source = sources.get(id); return source ? [source] : []; });
    const routeConfirmedNumbers = providerListedOnly ? [] : item.route?.flightNumbers ?? [];
    const confirmedNumbers = [...new Set([
      ...routeConfirmedNumbers,
      ...positiveSchedules.flatMap((row) => row.flightNumbers ?? []),
      ...activeOfficialServices.map((row) => `${row.carrier}${row.flightNumber}`),
      ...activeReferences.flatMap((row) => row.flightNumbers.map((number) => `${row.carrier}${number}`)),
    ])];
    const confirmedNumberSet = new Set(confirmedNumbers);
    const candidateFlightNumbers = [...new Set([
      ...(item.route?.flightNumberCandidates ?? []),
      ...(providerListedOnly ? item.route?.flightNumbers ?? [] : []),
    ])].filter((number) => !confirmedNumberSet.has(number)).sort();
    options.push({
      carrier: item.carrier, from: item.from, to: item.to, scheduleStatus,
      flightNumbers: confirmedNumbers
        .sort((a, b) => {
          const departureA = departureByDesignator.get(a);
          const departureB = departureByDesignator.get(b);
          if (departureA && departureB && departureA !== departureB) return departureA.localeCompare(departureB);
          if (departureA) return -1;
          if (departureB) return 1;
          return a.localeCompare(b);
        }),
      candidateFlightNumbers,
      networkSources, schedules: positiveSchedules, flightNumberSources,
      routeFlightNumberSources,
      candidateFlightNumberSources,
      routeWindow: item.route ? { from: item.route.effectiveFrom, until: item.route.effectiveUntil } : null,
      ...(providerListedOnly ? { identityStatus: 'provider-listed' as const } : {}),
    });
    destinations.set(item.to, options);
  }
  return new Map([...origins.entries()]
    .sort(([a], [b]) => a === b ? 0 : a === 'TPE' ? -1 : b === 'TPE' ? 1 : a.localeCompare(b))
    .map(([origin, destinations]) => [origin, [...destinations.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([iata, options]) => ({ iata, options: options.sort((a, b) => a.carrier.localeCompare(b.carrier)) }))]));
}
