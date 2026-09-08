import { z } from 'zod';
import { addCalendarDays, datesBetween } from '../src/lib/calendar-date.ts';
import {
  DatedFlightSchema, FlightQuerySchema, FlightQueryResponseSchema,
  type DatedFlight, type DatedScheduleDay, type FlightQuery, type FlightQueryResponse, type ScheduleIssue,
} from '../src/lib/schemas/dated-schedules.ts';

export const SCHEDULE_SOURCE = {
  name: 'Cirium FlightStats Schedules',
  url: 'https://developer.cirium.com/apis/flightstats-apis/schedules',
};
const TTL = 15 * 60 * 1000;
const MAX_RESPONSE_BYTES = 2_000_000;
const Reference = z.object({ fs: z.string().optional(), iata: z.string().optional() }).passthrough();
const Operator = z.object({ carrierFsCode: z.string().optional(), carrier: Reference.optional(), flightNumber: z.string() }).passthrough();
const RawFlight = z.object({
  carrierFsCode: z.string().optional(), carrier: Reference.optional(), flightNumber: z.string(),
  departureAirportFsCode: z.string().optional(), arrivalAirportFsCode: z.string().optional(),
  departureAirport: Reference.optional(), arrivalAirport: Reference.optional(),
  departureTime: z.string(), arrivalTime: z.string(),
  stops: z.number().int().nonnegative(), serviceType: z.string(),
  isCodeshare: z.boolean(), isWetlease: z.boolean().optional(), wetlease: z.boolean().optional(),
  operator: Operator.optional(),
}).passthrough();
const Payload = z.object({
  scheduledFlights: z.array(z.unknown()).max(2000),
  appendix: z.object({ airlines: z.array(Reference).optional(), airports: z.array(Reference).optional() }).passthrough().optional(),
}).passthrough();

export function unknownScheduleDay(date: string, issue: ScheduleIssue, now: number): DatedScheduleDay {
  return { date, complete: false, flights: [], issue,
    checkedAt: new Date(now).toISOString(), expiresAt: new Date(now + TTL).toISOString() };
}

/** Normalize documented identities only. No FS→IATA guesses, marketing-code
 * guesses, invented weekdays, UTC conversions, cargo or through-flight legs.
 * A dropped unresolved passenger row makes negative coverage incomplete. */
export function normalizeCiriumDay(raw: unknown, query: Pick<FlightQuery, 'from' | 'to'>, date: string, now: number): DatedScheduleDay {
  const parsed = Payload.safeParse(raw);
  if (!parsed.success || parsed.data.error) return unknownScheduleDay(date, 'provider-error', now);
  const data = parsed.data;
  const airlines = new Map(data.appendix?.airlines?.map((item) => [item.fs, item.iata]));
  const airports = new Map(data.appendix?.airports?.map((item) => [item.fs, item.iata]));
  const flights = new Map<string, DatedFlight>();
  const conflicts = new Set<string>();
  let complete = !(data.next || data.nextPage || data.truncated);
  for (const value of data.scheduledFlights) {
    const candidate = RawFlight.safeParse(value);
    if (!candidate.success) { complete = false; continue; }
    const row = candidate.data;
    // Only nonstop, scheduled passenger services in this product layer.
    if (row.stops > 0 || !['J', 'S', 'Q', 'R'].includes(row.serviceType)) continue;
    if (row.isWetlease || row.wetlease) { complete = false; continue; }
    const operator = row.isCodeshare ? row.operator : row;
    if (!operator) { complete = false; continue; }
    const carrier = operator.carrier?.iata ?? airlines.get(operator.carrierFsCode);
    const from = row.departureAirport?.iata ?? airports.get(row.departureAirportFsCode);
    const to = row.arrivalAirport?.iata ?? airports.get(row.arrivalAirportFsCode);
    const localPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::[0-5]\d(?:\.\d{1,3})?)?$/;
    if (!localPattern.test(row.departureTime) || !localPattern.test(row.arrivalTime)) { complete = false; continue; }
    const flight = DatedFlightSchema.safeParse({
      carrier, from, to, flightNumber: operator.flightNumber.replace(/^0+(?=\d)/, ''),
      departureLocal: row.departureTime.slice(0, 16), arrivalLocal: row.arrivalTime.slice(0, 16),
    });
    if (!flight.success || from !== query.from || to !== query.to || flight.data.departureLocal.slice(0, 10) !== date) {
      complete = false; continue;
    }
    const key = `${carrier}:${flight.data.flightNumber}:${flight.data.departureLocal}`;
    const previous = flights.get(key);
    if (previous && previous.arrivalLocal !== flight.data.arrivalLocal) { complete = false; conflicts.add(key); }
    flights.set(key, flight.data);
  }
  for (const key of conflicts) flights.delete(key);
  return {
    date, complete, flights: [...flights.values()].sort((a, b) => a.departureLocal.localeCompare(b.departureLocal) || a.carrier.localeCompare(b.carrier)),
    checkedAt: new Date(now).toISOString(), expiresAt: new Date(now + TTL).toISOString(),
    ...(!complete ? { issue: 'partial' as const } : {}),
  };
}

export interface ScheduleGatewayOptions {
  readonly appId?: string | undefined;
  readonly appKey?: string | undefined;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
  /** Hard process-wide UTC-day ceiling. No credential or browser request can bypass it. */
  readonly dailyBudget?: number;
}

export function createScheduleGateway(options: ScheduleGatewayOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const budget = options.dailyBudget ?? 200;
  if (!Number.isInteger(budget) || budget < 1 || budget > 10000) throw new Error('dailyBudget must be 1..10000');
  const configured = Boolean(options.appId && options.appKey);
  const cache = new Map<string, DatedScheduleDay>();
  const pending = new Map<string, Promise<DatedScheduleDay>>();
  const waiters: Array<() => void> = [];
  let active = 0;
  let budgetDate = '';
  let used = 0;

  async function fetchDay(query: FlightQuery, date: string): Promise<DatedScheduleDay> {
    if (active >= 4) await new Promise<void>((resolve) => waiters.push(resolve));
    else active++;
    try {
      const current = now();
      const today = new Date(current).toISOString().slice(0, 10);
      if (budgetDate !== today) { budgetDate = today; used = 0; }
      if (used >= budget) return unknownScheduleDay(date, 'budget-exceeded', current);
      used++;
      const [year, month, day] = date.split('-');
      const url = new URL(`https://api.flightstats.com/flex/schedules/rest/v1/json/from/${query.from}/to/${query.to}/departing/${year}/${Number(month)}/${Number(day)}`);
      url.searchParams.set('codeType', 'IATA');
      url.searchParams.set('extendedOptions', 'useInlinedReferences,useHttpErrors');
      // Header authentication is documented. Never put keys in URLs, logs,
      // returned request objects, client bundles or raw error messages.
      const response = await fetchImpl(url, {
        headers: { appId: options.appId!, appKey: options.appKey!, Accept: 'application/json' },
        signal: AbortSignal.timeout(8000), redirect: 'error',
      });
      if (!response.ok) return unknownScheduleDay(date, 'provider-error', now());
      if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) return unknownScheduleDay(date, 'provider-error', now());
      const reader = response.body?.getReader();
      if (!reader) return unknownScheduleDay(date, 'provider-error', now());
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); return unknownScheduleDay(date, 'provider-error', now()); }
        chunks.push(part.value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      return normalizeCiriumDay(JSON.parse(new TextDecoder().decode(bytes)), query, date, now());
    } catch {
      return unknownScheduleDay(date, 'provider-error', now());
    } finally {
      const next = waiters.shift();
      if (next) next(); // Hand the existing slot directly to the next waiter.
      else active--;
    }
  }

  async function getDay(query: FlightQuery, date: string): Promise<DatedScheduleDay> {
    const current = now();
    if (!configured) return unknownScheduleDay(date, 'not-configured', current);
    const today = new Date(current).toISOString().slice(0, 10);
    // Application safety bound, not a promise about the supplier contract.
    // Allow yesterday UTC because departure-airport local dates can differ.
    if (date < addCalendarDays(today, -1) || date > addCalendarDays(today, 330)) return unknownScheduleDay(date, 'out-of-range', current);
    const key = `${query.from}:${query.to}:${date}`;
    const cached = cache.get(key);
    if (cached && Date.parse(cached.expiresAt) > current) return cached;
    const inFlight = pending.get(key);
    if (inFlight) return inFlight;
    const task = fetchDay(query, date).then((result) => {
      if (cache.size >= 1000) { const oldest = cache.keys().next().value; if (oldest) cache.delete(oldest); }
      cache.set(key, result);
      return result;
    }).finally(() => pending.delete(key));
    pending.set(key, task);
    return task;
  }

  return {
    configured,
    async query(input: unknown): Promise<FlightQueryResponse> {
      const query = FlightQuerySchema.parse(input);
      const dates = datesBetween(query.start, query.end);
      // Hard cap on queued work as well as outgoing requests. Prevents a
      // public client building an unbounded queue with many distinct routes.
      if (pending.size + dates.length > 128) {
        return { version: 1, query, source: SCHEDULE_SOURCE, days: dates.map((date) => unknownScheduleDay(date, 'budget-exceeded', now())) };
      }
      const days = await Promise.all(dates.map((date) => getDay(query, date)));
      return FlightQueryResponseSchema.parse({ version: 1, query, source: SCHEDULE_SOURCE, days });
    },
  };
}
