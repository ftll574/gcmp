import type { RouteNetworkEntry, RouteNetworkSource } from '../schemas/route-network.ts';

export interface RouteFlightNumberFreshness {
  readonly current: ReadonlyArray<string>;
  readonly stale: ReadonlyArray<string>;
  readonly passed: ReadonlyArray<string>;
  readonly candidates: ReadonlyArray<string>;
}

/** A snapshot-backed designator is current only before its source's exact UTC cutoff. */
export function routeFlightNumberFreshness(
  route: RouteNetworkEntry,
  sources: ReadonlyMap<string, RouteNetworkSource>,
  now = Date.now(),
): RouteFlightNumberFreshness {
  const datedByNumber = new Map((route.timeBoundFlightNumbers ?? []).map((evidence) => [evidence.flightNumber, evidence] as const));
  const current: string[] = [];
  const stale: string[] = [];
  const passed: string[] = [];
  for (const number of route.flightNumbers ?? []) {
    const evidence = datedByNumber.get(number);
    if (!evidence) {
      current.push(number);
      continue;
    }
    const cutoff = Date.parse(sources.get(evidence.sourceId)?.freshUntilUTC ?? '');
    if (!Number.isFinite(cutoff) || now >= cutoff) {
      stale.push(number);
      continue;
    }
    if (evidence.occurrencesUTC.some((occurrence) => now < Date.parse(occurrence) && Date.parse(occurrence) <= cutoff)) {
      current.push(number);
    } else {
      passed.push(number);
    }
  }
  const candidates = [...new Set([...(route.flightNumberCandidates ?? []), ...stale, ...passed])]
    .filter((number) => !current.includes(number));
  return { current, stale, passed, candidates };
}

export function nextEvidenceDeadline(
  sources: ReadonlyArray<RouteNetworkSource>,
  occurrenceTimesUTC: ReadonlyArray<string> = [],
): ReadonlyArray<string> {
  return [...sources.flatMap((source) => source.freshUntilUTC ? [source.freshUntilUTC] : []), ...occurrenceTimesUTC];
}

/** Avinor's OSL departure row is UTC; the planner's departsOn field is a local calendar date. */
export function avinorOslDepartureDate(occurrenceUTC: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Oslo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(occurrenceUTC));
  const part = (type: 'year' | 'month' | 'day'): string => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
