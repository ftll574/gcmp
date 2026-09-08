import { addCalendarDays } from '../src/lib/calendar-date.ts';
import { createTdxGateway, TDX_NORMALIZER_VERSION, type TdxSnapshotSummary } from './tdx-schedules.ts';
import type { TdxReplaySnapshot } from './tdx-snapshot.ts';

const TOKEN_PATH = '/auth/realms/TDXConnect/protocol/openid-connect/token';
const DATA_PATH = '/api/basic/v2/Air/GeneralSchedule/International';
const BUDGET = 12;

interface Options {
  clientId?: string | undefined;
  clientSecret?: string | undefined;
  fetchImpl?: typeof fetch;
  now?: () => number;
  onReplaySnapshot?: (snapshot: TdxReplaySnapshot) => void;
}

/** User-invoked acceptance check. No secret files are loaded by this module.
 * Only the CLI loads the local environment; unit tests inject mock fetch.
 * Reports contain HTTP codes and normalized public timetable counts ONLY:
 * never request bodies, headers, tokens, provider errors or raw responses.
 * Uses the real TDX adapter, not the ANA fallback or a paid provider. */
export async function diagnoseTdx(options: Options) {
  const now = options.now ?? Date.now;
  const fetchImpl = options.fetchImpl ?? fetch;
  const today = new Date(now()).toISOString().slice(0, 10);
  const configured = Boolean(options.clientId?.trim() && options.clientSecret?.trim());
  const requests: Array<{ endpoint: 'authentication' | 'timetable'; httpStatus: number | null }> = [];
  const timetableSnapshots: TdxSnapshotSummary[] = [];
  let stop = false;
  const routes: Array<{
    from: string; to: string;
    windows: Array<{
      start: string; end: string; daysWithPublishedFlights: number;
      publishedOccurrences: number; carriers: string[]; flightNumbers: string[];
      sourceValidFrom: string | null; sourceValidUntil: string | null;
      datesWithArrivalDate: number; issues: string[];
      byCarrier: Array<{ carrier: string; flightNumbers: string[]; occurrences: number; days: number }>;
      daysWithTimetableReferences: number; referenceOccurrences: number; referenceFlightNumbers: string[];
      referenceDatesWithArrivalDate: number;
      byAirlineCode: Array<{ airlineCode: string; flightNumbers: string[]; occurrences: number; days: number }>;
    }>;
  }> = [];
  const observedFetch: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== 'https://tdx.transportdata.tw' || ![TOKEN_PATH, DATA_PATH].includes(url.pathname)) {
      throw new Error('Diagnostic endpoint not allowed');
    }
    if (stop || requests.length >= BUDGET) throw new Error('Diagnostic request limit');
    const record: (typeof requests)[number] = {
      endpoint: url.pathname === TOKEN_PATH ? 'authentication' : 'timetable', httpStatus: null,
    };
    requests.push(record);
    try {
      const response = await fetchImpl(input, init);
      record.httpStatus = response.status;
      // Do not repeatedly retry invalid credentials, denied access or quota.
      // A timetable 401 may still use the adapter's one token-refresh retry.
      if ((record.endpoint === 'authentication' && !response.ok) || [403, 429].includes(response.status)) stop = true;
      return response;
    } catch {
      stop = true;
      throw new Error('Diagnostic network failure');
    }
  };
  const gateway = createTdxGateway({ ...options, fetchImpl: observedFetch, dailyBudget: BUDGET,
    onSnapshot: (summary) => timetableSnapshots.push(summary),
  });
  if (configured) {
    for (const [from, to] of [['TPE', 'HKG'], ['HKG', 'TPE'], ['TPE', 'SFO']] as const) {
      if (stop) break;
      const route: (typeof routes)[number] = { from, to, windows: [] };
      // The same route snapshot should be reused across the three windows.
      // These ranges are probes, NOT a guarantee of future data coverage.
      for (const offset of [0, 30, 90]) {
        if (stop) break;
        const start = addCalendarDays(today, offset);
        const end = addCalendarDays(start, 29);
        const result = await gateway.query({ from, to, start, end });
        const flights = result.days.flatMap((day) => day.published ?? []);
        const references = result.days.flatMap((day) => day.references ?? []);
        const observations = [...flights, ...references];
        const first = observations.map((flight) => flight.effectiveFrom).sort()[0] ?? null;
        const last = observations.map((flight) => flight.effectiveUntil).sort().at(-1) ?? null;
        route.windows.push({
          start, end, daysWithPublishedFlights: result.days.filter((day) => day.published?.length).length,
          publishedOccurrences: flights.length,
          carriers: [...new Set(flights.map((flight) => flight.carrier))].sort(),
          flightNumbers: [...new Set(flights.map((flight) => `${flight.carrier}${flight.flightNumber}`))].sort(),
          sourceValidFrom: first, sourceValidUntil: last,
          datesWithArrivalDate: new Set(flights.filter((flight) => flight.arrivalDate).map((flight) => flight.date)).size,
          issues: [...new Set(result.days.flatMap((day) => day.issue ? [day.issue] : []))],
          byCarrier: [...new Set(flights.map((flight) => flight.carrier))].sort().map((carrier) => {
            const own = flights.filter((flight) => flight.carrier === carrier);
            return { carrier, flightNumbers: [...new Set(own.map((flight) => carrier + flight.flightNumber))].sort(),
              occurrences: own.length, days: new Set(own.map((flight) => flight.date)).size };
          }),
          daysWithTimetableReferences: result.days.filter((day) => day.references?.length).length,
          referenceOccurrences: references.length,
          referenceFlightNumbers: [...new Set(references.map((flight) => flight.airlineCode + flight.flightNumber))].sort(),
          referenceDatesWithArrivalDate: new Set(references.filter((flight) => flight.arrivalDate).map((flight) => flight.date)).size,
          byAirlineCode: [...new Set(references.map((flight) => flight.airlineCode))].sort().map((airlineCode) => {
            const own = references.filter((flight) => flight.airlineCode === airlineCode);
            return { airlineCode, flightNumbers: [...new Set(own.map((flight) => airlineCode + flight.flightNumber))].sort(),
              occurrences: own.length, days: new Set(own.map((flight) => flight.date)).size };
          }),
        });
        // A successful HTTP response that cannot be normalized needs review,
        // not repeated attempts across the rest of the diagnostic routes.
        if (result.days.every((day) => ['provider-error', 'budget-exceeded'].includes(day.issue ?? ''))) stop = true;
      }
      routes.push(route);
    }
  }
  const dataAccessible = requests.some((request) => request.endpoint === 'timetable' && request.httpStatus === 200);
  const positives = routes.some((route) => route.windows.some((window) => window.publishedOccurrences > 0));
  const referencesFound = routes.some((route) => route.windows.some((window) => window.referenceOccurrences > 0));
  const verdict = !configured ? 'missing-credentials'
    : requests.some((request) => request.httpStatus === 429) ? 'quota-limited'
    : requests.some((request) => request.endpoint === 'authentication' && request.httpStatus !== null && request.httpStatus >= 400) ? 'authentication-failed'
    : requests.some((request) => request.endpoint === 'timetable' && request.httpStatus === 403) ? 'timetable-access-denied'
    : !dataAccessible ? 'connection-or-response-failed'
    : positives && referencesFound ? 'published-flights-found-partial-operator-acceptance'
    : positives ? 'published-flights-found'
    : referencesFound ? 'timetable-references-found-operator-unverified' : 'endpoint-accessible-no-published-flights';
  return {
    reportVersion: 4, normalizerVersion: TDX_NORMALIZER_VERSION,
    checkedAt: new Date(now()).toISOString(), verdict, configured, dataAccessible,
    operatingCarrierAcceptance: positives && referencesFound ? 'partial'
      : positives ? 'verified-for-returned-positives' : referencesFound ? 'unverified' : 'not-evaluated',
    maximumExternalRequests: BUDGET, requests, routes, timetableSnapshots,
    notes: [
      'No fallback data, award seats or paid alternative was queried.',
      'Empty/partial/stale results are not evidence that a route has no flights.',
      'ValidFrom/ValidUntil summarize returned publications, not guaranteed full route coverage.',
      'AirlineID/flight designators and absence of CodeShare entries do not prove the operating carrier. Only exact identities with separate official operator evidence are promoted; all other TDX references remain unselectable.',
      'byAirlineCode counts unverified reference designators, NOT actual operating flights. byCarrier is reserved for established operating identities.',
      'Snapshot summaryVersion=3 includes missing/null/empty/populated/invalid CodeShare field counts and examples even when there are no aliases.',
      'Timetable examples preserve split fields, ISO weekdays (Monday=1), validity and explicit offsets; null offsets remain unknown.',
      'At most 16 distinct public examples per route and 20 shares per example; codeshareExamples is a subset, not additional evidence. Omitted counts are explicit.',
    ],
  };
}
