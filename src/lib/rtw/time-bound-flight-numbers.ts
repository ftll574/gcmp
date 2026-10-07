import type { RouteNetworkEntry, RouteNetworkSource } from '../schemas/route-network.ts';

export interface RouteFlightNumberFreshness {
  readonly current: ReadonlyArray<string>;
  readonly stale: ReadonlyArray<string>;
  readonly passed: ReadonlyArray<string>;
  readonly candidates: ReadonlyArray<string>;
}

/** A snapshot-backed designator is current only while a listed occurrence and its source remain current. */
export function routeFlightNumberFreshness(
  route: RouteNetworkEntry,
  sources: ReadonlyMap<string, RouteNetworkSource>,
  now = Date.now(),
): RouteFlightNumberFreshness {
  const datedByNumber = new Map<string, NonNullable<RouteNetworkEntry['timeBoundFlightNumbers']>[number][]>();
  for (const evidence of route.timeBoundFlightNumbers ?? []) {
    datedByNumber.set(evidence.flightNumber, [...(datedByNumber.get(evidence.flightNumber) ?? []), evidence]);
  }
  const current: string[] = [];
  const stale: string[] = [];
  const passed: string[] = [];
  for (const number of route.flightNumbers ?? []) {
    const evidenceRows = datedByNumber.get(number);
    if (!evidenceRows?.length) {
      current.push(number);
      continue;
    }
    const sourceStates = evidenceRows.map((evidence) => {
      const cutoff = Date.parse(sources.get(evidence.sourceId)?.freshUntilUTC ?? '');
      const sourceFresh = Number.isFinite(cutoff) && now < cutoff;
      const occurrences = evidence.occurrencesUTC.map((value) => ({ schedule: Date.parse(value), expires: Date.parse(value) }));
      return {
        sourceFresh,
        current: sourceFresh && occurrences.some(({ schedule, expires }) => Number.isFinite(schedule) && Number.isFinite(expires) && now < expires && schedule <= cutoff),
      };
    });
    if (sourceStates.some((state) => state.current)) {
      current.push(number);
      continue;
    }
    if (!sourceStates.some((state) => state.sourceFresh)) {
      stale.push(number);
      continue;
    }
    passed.push(number);
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

/** Avinor schedule times are UTC; Planner needs the departure's Europe/Oslo calendar date. */
export function avinorOslDepartureDate(occurrenceUTC: string): string | null {
  const timestamp = Date.parse(occurrenceUTC);
  if (!Number.isFinite(timestamp)) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Oslo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year && values.month && values.day ? `${values.year}-${values.month}-${values.day}` : null;
}
