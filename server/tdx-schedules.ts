import { z } from 'zod';
import airports from '../public/data/airports.json' with { type: 'json' };
import { addCalendarDays, datesBetween, isCalendarDate } from '../src/lib/calendar-date.ts';
import { FlightQuerySchema, FlightQueryResponseSchema, type FlightQuery, type FlightQueryResponse, type ScheduleIssue } from '../src/lib/schemas/dated-schedules.ts';
import { PublishedFlightSchema, TimetableReferenceSchema, type PublishedFlight, type TimetableReference } from '../src/lib/schemas/published-schedules.ts';
import { isoWeekday } from '../src/lib/rtw/schedule-days.ts';
import { unknownScheduleDay } from './flight-schedules.ts';
import { captureTdxReplaySnapshot, type TdxReplaySnapshot } from './tdx-snapshot.ts';
import { findKnownOtherOperator, findOperatorEvidence } from './operator-evidence.ts';

const TDX_URL = 'https://tdx.transportdata.tw/api/basic/v2/Air/GeneralSchedule/International';
const TOKEN_URL = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';
const SOURCE = { name: 'TDX international regular timetable', url: 'https://data.gov.tw/dataset/161167' };
const TTL = 4 * 3600000;
const MAX_AGE = 24 * 3600000; // Explicit application freshness bound, not a TDX guarantee.
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const taiwanAirports = new Set(airports.filter((airport) => airport.country === 'TW').map((airport) => airport.iata));
const DateValue = z.string().refine(isCalendarDate);
// TDX GeneralFlightSchedule.CodeShare is NOT a full flight-number string:
// the official object supplies AirlineID separately from the numeric suffix.
// Source: public OpenAPI, components/schemas/...V2.CodeShare (2026-09-05).
const Share = z.union([z.string().max(32), z.object({
  AirlineID: z.string().nullable().optional(), FlightNumber: z.string().max(32).nullable(),
}).passthrough()]);
const Row = z.object({
  AirlineID: z.string().regex(/^[A-Z0-9]{2}$/), FlightNumber: z.string(),
  DepartureAirportID: z.string(), ArrivalAirportID: z.string(),
  ScheduleStartDate: DateValue, ScheduleEndDate: DateValue,
  DepartureTime: z.string().nullable(), ArrivalTime: z.string().nullable(),
  Monday: z.boolean(), Tuesday: z.boolean(), Wednesday: z.boolean(), Thursday: z.boolean(),
  Friday: z.boolean(), Saturday: z.boolean(), Sunday: z.boolean(),
  CodeShare: z.array(Share).max(200).nullish(), UpdateTime: z.string().datetime({ offset: true }),
}).passthrough();
type TdxRow = z.infer<typeof Row>;
export const TDX_NORMALIZER_VERSION = '4-bounded-operator-evidence';

function fullFlightIdentity(value: string): string | null {
  const match = /^([A-Z][A-Z0-9]|[0-9][A-Z])\s*(\d{1,4}[A-Z]?)$/.exec(value.trim().toUpperCase());
  return match ? `${match[1]}${match[2]!.replace(/^0+(?=\d)/, '')}` : null;
}

function shareIdentity(share: z.infer<typeof Share>): string | null {
  if (typeof share === 'string') return fullFlightIdentity(share);
  if (share.FlightNumber === null) return null;
  const number = share.FlightNumber.trim().toUpperCase();
  if (share.AirlineID == null) return fullFlightIdentity(number); // Never guess a carrier for a bare number.
  const carrier = share.AirlineID.trim().toUpperCase();
  if (!/^(?:[A-Z][A-Z0-9]|[0-9][A-Z])$/.test(carrier)) return null;
  const identity = /^\d{1,4}[A-Z]?$/.test(number)
    ? fullFlightIdentity(carrier + number) : fullFlightIdentity(number);
  return identity?.startsWith(carrier) ? identity : null;
}

function currentPassengerRow(row: TdxRow, query: FlightQuery, date: string, fetchedAt: number, now: number): boolean {
  if (row.DepartureAirportID !== query.from || row.ArrivalAirportID !== query.to) return false;
  if (row.ScheduleStartDate > row.ScheduleEndDate || date < row.ScheduleStartDate || date > row.ScheduleEndDate) return false;
  if (row[WEEKDAYS[isoWeekday(date) - 1]!] !== true) return false;
  if (row.IsCargo === true || row.IsCargoFlight === true || row.IsCodeShare === true || row.IsWetlease === true) return false;
  if (row.ServiceType !== undefined && !['J', 'S', 'Q', 'R'].includes(String(row.ServiceType))) return false;
  const identity = fullFlightIdentity(row.FlightNumber);
  if (!identity?.startsWith(row.AirlineID)) return false;
  const update = Date.parse(row.UpdateTime);
  if (update > fetchedAt + 60000 || now >= update + MAX_AGE || now >= fetchedAt + TTL) return false;
  return !parseTdxClock(row.DepartureTime ?? '')?.offset;
}

/** Preserve public field shape/padding without copying arbitrary string values. */
function publicFlightNumber(value: string | null | undefined): string | null {
  if (value == null) return null;
  const number = value.trim().toUpperCase();
  return number.length <= 32 && (/^\d{1,4}[A-Z]?$/.test(number) || fullFlightIdentity(number) !== null)
    ? number : null;
}

function publicCodeshare(share: z.infer<typeof Share>) {
  const airline = typeof share === 'string' ? null : share.AirlineID?.trim().toUpperCase();
  return {
    representation: typeof share === 'string' ? 'string' : 'object',
    airlineId: airline && /^(?:[A-Z][A-Z0-9]|[0-9][A-Z])$/.test(airline) ? airline : null,
    flightNumber: publicFlightNumber(typeof share === 'string' ? share : share.FlightNumber),
    identity: shareIdentity(share),
  };
}

function codeshareFieldState(value: unknown): 'missing' | 'null' | 'emptyArray' | 'populatedArray' | 'invalid' {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return 'invalid';
  if (!('CodeShare' in value) || value.CodeShare === undefined) return 'missing';
  if (value.CodeShare === null) return 'null';
  if (!Array.isArray(value.CodeShare)) return 'invalid';
  return value.CodeShare.length ? 'populatedArray' : 'emptyArray';
}

/** Whitelisted public timetable facts for the account holder's diagnostic.
 * Never return raw rows/unknown properties, headers, auth bodies or errors.
 * Raw row -> validated public fields -> distinct evidence -> bounded examples.
 * Keep dates/weekdays/offsets AND the split fields before deduplication. A
 * flight+aliases-only key hides season changes and reciprocal weekday claims.
 * Examples are NOT a complete replay snapshot; explicitly report truncation. */
export function summarizeTdxSnapshot(raw: ReadonlyArray<unknown>, from: string, to: string, fetchedAt: number) {
  const rows = raw.flatMap((value) => { const parsed = Row.safeParse(value); return parsed.success ? [parsed.data] : []; });
  const examples = new Map<string, {
    flight: string; aliases: string[]; validFrom: string; validUntil: string;
    departureTime: string | null; arrivalTime: string | null;
    airlineId: string; sourceFlightNumber: string | null; from: string | null; to: string | null;
    weekdays: number[]; updatedAt: string; departureDayOffset: number | null; arrivalDayOffset: number | null;
    codeshares: Array<ReturnType<typeof publicCodeshare>>; codeshareEntries: number; omittedCodeshareEntries: number;
    aliasCount: number; omittedAliases: number;
    codeshareFieldState: ReturnType<typeof codeshareFieldState>;
    markers: { isCargo: boolean | null; isCargoFlight: boolean | null; isCodeShare: boolean | null; isWetlease: boolean | null; serviceType: string | null };
  }>();
  const distinctExamples = new Set<string>();
  const distinctShareExamples = new Set<string>();
  const codeshareFieldStates = { missing: 0, null: 0, emptyArray: 0, populatedArray: 0, invalid: 0 };
  for (const value of raw) codeshareFieldStates[codeshareFieldState(value)]++;
  // Prefer one example per flight before spending the same 16-example budget
  // on split weeks/seasons of one flight. Count ALL distinct evidence below.
  const firstByFlight = new Map<string, TdxRow>();
  for (const row of rows) {
    const identity = fullFlightIdentity(row.FlightNumber);
    if (identity && !firstByFlight.has(identity)) firstByFlight.set(identity, row);
  }
  const firstRows = new Set(firstByFlight.values());
  let objects = 0; let strings = 0; let unresolved = 0;
  for (const row of [...firstRows, ...rows.filter((row) => !firstRows.has(row))]) {
    const aliases: string[] = [];
    for (const share of row.CodeShare ?? []) {
      if (typeof share === 'string') strings++; else objects++;
      const alias = shareIdentity(share);
      if (alias) aliases.push(alias); else unresolved++;
    }
    const flight = fullFlightIdentity(row.FlightNumber);
    const normalizedAliases = [...new Set(aliases)].sort();
    // Unresolved entries need a safe example too; otherwise the shape that
    // requires investigation disappears from the account holder's report.
    if (!flight) continue;
    const departure = parseTdxClock(row.DepartureTime ?? '');
    const arrival = parseTdxClock(row.ArrivalTime ?? '');
    const codeshares = (row.CodeShare ?? []).map(publicCodeshare);
    const example = {
      flight, airlineId: row.AirlineID, sourceFlightNumber: publicFlightNumber(row.FlightNumber),
      from: /^[A-Z]{3}$/.test(row.DepartureAirportID) ? row.DepartureAirportID : null,
      to: /^[A-Z]{3}$/.test(row.ArrivalAirportID) ? row.ArrivalAirportID : null,
      aliases: normalizedAliases, codeshares,
      codeshareFieldState: codeshareFieldState(row),
      markers: {
        isCargo: typeof row.IsCargo === 'boolean' ? row.IsCargo : null,
        isCargoFlight: typeof row.IsCargoFlight === 'boolean' ? row.IsCargoFlight : null,
        isCodeShare: typeof row.IsCodeShare === 'boolean' ? row.IsCodeShare : null,
        isWetlease: typeof row.IsWetlease === 'boolean' ? row.IsWetlease : null,
        serviceType: typeof row.ServiceType === 'string' && /^[A-Z]$/.test(row.ServiceType) ? row.ServiceType : null,
      },
      validFrom: row.ScheduleStartDate, validUntil: row.ScheduleEndDate,
      weekdays: WEEKDAYS.flatMap((weekday, index) => row[weekday] ? [index + 1] : []),
      updatedAt: new Date(row.UpdateTime).toISOString(),
      departureTime: departure?.time ?? null, arrivalTime: arrival?.time ?? null,
      departureDayOffset: departure?.offset ?? null, arrivalDayOffset: arrival?.offset ?? null,
    };
    // Fingerprint the FULL sanitized entries before slicing; differences after
    // the twentieth alias still count as omitted evidence rather than vanish.
    const key = JSON.stringify(example);
    distinctExamples.add(key);
    if (codeshares.length) distinctShareExamples.add(key);
    if (!examples.has(key) && examples.size < 16) examples.set(key, {
      ...example, aliases: normalizedAliases.slice(0, 20), codeshares: codeshares.slice(0, 20),
      aliasCount: normalizedAliases.length, omittedAliases: Math.max(0, normalizedAliases.length - 20),
      codeshareEntries: codeshares.length, omittedCodeshareEntries: Math.max(0, codeshares.length - 20),
    });
  }
  return {
    summaryVersion: 3, from, to, fetchedAt: new Date(fetchedAt).toISOString(),
    receivedRows: raw.length, parsedRows: rows.length, rejectedRows: raw.length - rows.length,
    sourceValidFrom: rows.map((row) => row.ScheduleStartDate).sort()[0] ?? null,
    sourceValidUntil: rows.map((row) => row.ScheduleEndDate).sort().at(-1) ?? null,
    codeshareRepresentations: { objects, strings, unresolved },
    codeshareFieldStates,
    distinctTimetableExamples: distinctExamples.size, omittedTimetableExamples: distinctExamples.size - examples.size,
    timetableExamples: [...examples.values()],
    // Compatibility subset of the SAME bounded examples, not 16 extra samples.
    distinctCodeshareExamples: distinctShareExamples.size,
    omittedCodeshareExamples: distinctShareExamples.size - [...examples.values()].filter((example) => example.codeshareEntries > 0).length,
    codeshareExamples: [...examples.values()].filter((example) => example.codeshareEntries > 0),
  };
}
export type TdxSnapshotSummary = ReturnType<typeof summarizeTdxSnapshot>;

/** Clock components are local at their own airports. Missing +1/-1 is NOT
 * guessed from clock order. Keep arrivalDate unknown without an explicit
 * offset; date-line travel may arrive before the departure local date. */
export function parseTdxClock(value: string): { time: string; offset?: number } | null {
  const match = /^(\d{2}:\d{2})(?:\s*(?:\(\s*)?([+-][0-2])(?:\s*\))?)?$/.exec(value.trim());
  if (!match || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(match[1]!)) return null;
  return { time: match[1]!, ...(match[2] !== undefined ? { offset: Number(match[2]) } : {}) };
}

/** Official documented fields (see TDX/PTX sample 94d6afb4...). All active
 * records are considered, not just the first matching weekly row. Main flight
 * IDs are used, scoped codeshare aliases are deduplicated as before. The
 * user-run v2 report contained zero CodeShare entries across 1,111 rows;
 * AirlineID + FlightNumber alone cannot establish an operating carrier.
 * Even a root left by alias elimination is NOT independent operator proof.
 * Only exact route+flight identities in the separate official operator-
 * evidence catalog may be promoted. Everything else stays a reference.
 * GeneralSchedule is a partial publication, never route-wide negative proof. */
export function normalizeTdxSchedules(raw: unknown, input: FlightQuery, fetchedAt: number, now: number): FlightQueryResponse {
  const query = FlightQuerySchema.parse(input);
  const parsedRows = z.array(z.unknown()).max(5000).safeParse(raw);
  const rows = parsedRows.success ? parsedRows.data.flatMap((value) => { const row = Row.safeParse(value); return row.success ? [row.data] : []; }) : [];
  const days = datesBetween(query.start, query.end).map((date) => {
    const day = unknownScheduleDay(date, parsedRows.success ? 'partial' : 'provider-error', now);
    const collectedReferences = new Map<string, TimetableReference>();
    const collectedPublished = new Map<string, PublishedFlight>();
    const conflicts = new Set<string>();
    const activeRows = rows.filter((row) => currentPassengerRow(row, query, date, fetchedAt, now));
    // Normalize both sides and scope aliases to this ordered pair + date.
    // No airline inference, no cross-season/global alias blacklist. Reciprocal
    // conflicting claims are omitted rather than choosing an operator by guess.
    const aliases = new Set(activeRows.flatMap((row) => {
      const own = fullFlightIdentity(row.FlightNumber);
      return (row.CodeShare ?? []).flatMap((share) => {
        const alias = shareIdentity(share);
        return alias !== null && alias !== own ? [alias] : [];
      });
    }));
    for (const row of activeRows) {
      const identity = fullFlightIdentity(row.FlightNumber)!;
      if (aliases.has(identity)) continue;
      const flightNumber = identity.slice(row.AirlineID.length);
      const update = Date.parse(row.UpdateTime);
      const departure = parseTdxClock(row.DepartureTime ?? '');
      const arrival = parseTdxClock(row.ArrivalTime ?? '');
      const source = { ...SOURCE, kind: 'government-timetable' as const, checkedAt: new Date(fetchedAt).toISOString(),
        reviewBy: new Date(Math.min(fetchedAt + TTL, update + MAX_AGE)).toISOString() };
      const common = {
        flightNumber, from: query.from, to: query.to, date,
        effectiveFrom: row.ScheduleStartDate, effectiveUntil: row.ScheduleEndDate,
        ...(departure ? { departureTime: departure.time } : {}),
        ...(arrival ? { arrivalTime: arrival.time } : {}),
        ...(arrival?.offset !== undefined ? { arrivalDate: addCalendarDays(date, arrival.offset) } : {}),
        source,
      };
      const operatorEvidence = findOperatorEvidence(query.from, query.to, row.AirlineID, flightNumber, date, now);
      const knownOtherOperator = operatorEvidence ? null : findKnownOtherOperator(query.from, query.to, row.AirlineID, flightNumber, date, now);
      const candidate = operatorEvidence
        ? PublishedFlightSchema.safeParse({ carrier: row.AirlineID, ...common, operatorEvidence })
        : TimetableReferenceSchema.safeParse({ airlineCode: row.AirlineID,
          operatorStatus: knownOtherOperator ? 'known-other-operator' : 'unverified',
          ...(knownOtherOperator ? { knownOperatingCarrier: knownOtherOperator.carrier, operatorEvidence: knownOtherOperator.source } : {}),
          ...common });
      if (!candidate.success) continue;
      const flight = candidate.data;
      const key = `${'carrier' in flight ? flight.carrier : flight.airlineCode}:${flight.flightNumber}`;
      const target = 'carrier' in flight ? collectedPublished : collectedReferences;
      const previous = target.get(key) as PublishedFlight | TimetableReference | undefined;
      if (previous && (previous.departureTime !== flight.departureTime || previous.arrivalTime !== flight.arrivalTime || previous.arrivalDate !== flight.arrivalDate)) conflicts.add(key);
      if ('carrier' in flight) collectedPublished.set(key, flight);
      else collectedReferences.set(key, flight);
    }
    for (const key of conflicts) { collectedPublished.delete(key); collectedReferences.delete(key); }
    return { ...day, published: [...collectedPublished.values()], references: [...collectedReferences.values()],
      ...(collectedReferences.size ? { issue: 'operator-unverified' as const } : {}) };
  });
  return FlightQueryResponseSchema.parse({ version: 1, query, source: SOURCE, days });
}

async function boundedJson(response: Response, limit: number): Promise<unknown> {
  if (!response.ok || Number(response.headers.get('content-length')) > limit) throw new Error('TDX response unavailable');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty TDX response');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const part = await reader.read(); if (part.done) break;
    size += part.value.byteLength;
    if (size > limit) { await reader.cancel(); throw new Error('TDX response too large'); }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

interface TdxOptions {
  clientId?: string | undefined; clientSecret?: string | undefined; fetchImpl?: typeof fetch; now?: () => number; dailyBudget?: number;
  onSnapshot?: (summary: TdxSnapshotSummary) => void;
  onReplaySnapshot?: (snapshot: TdxReplaySnapshot) => void;
}
export function createTdxGateway(options: TdxOptions) {
  const configured = Boolean(options.clientId && options.clientSecret);
  const fetchImpl = options.fetchImpl ?? fetch; const now = options.now ?? Date.now;
  const budget = options.dailyBudget ?? 200;
  if (!Number.isInteger(budget) || budget < 1 || budget > 10000) throw new Error('Invalid TDX daily budget');
  let used = 0; let budgetDay = ''; let active = 0;
  let token: { value: string; until: number } | null = null;
  let tokenTask: Promise<string> | null = null;
  const cache = new Map<string, { rows: unknown[]; fetchedAt: number }>();
  const pending = new Map<string, Promise<{ rows: unknown[]; fetchedAt: number }>>();
  const waiters: Array<() => void> = [];

  function spend(): void {
    const day = new Date(now()).toISOString().slice(0, 10);
    if (budgetDay !== day) { budgetDay = day; used = 0; }
    if (used >= budget) throw new Error('budget-exceeded');
    used++;
  }
  async function getToken(): Promise<string> {
    if (token && token.until > now() + 60000) return token.value;
    if (tokenTask) return tokenTask;
    tokenTask = (async () => {
      spend();
      const response = await fetchImpl(TOKEN_URL, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ grant_type: 'client_credentials', client_id: options.clientId!, client_secret: options.clientSecret! }),
      });
      const data = z.object({ access_token: z.string().min(1).max(16000), expires_in: z.number().positive().max(86400), token_type: z.string().optional() }).parse(await boundedJson(response, 32000));
      if (data.token_type && data.token_type.toLowerCase() !== 'bearer') throw new Error('Invalid token type');
      token = { value: data.access_token, until: now() + data.expires_in * 1000 };
      return token.value;
    })().finally(() => { tokenTask = null; });
    return tokenTask;
  }
  async function fetchRoute(from: string, to: string) {
    if (active >= 4) await new Promise<void>((resolve) => waiters.push(resolve)); else active++;
    try {
      const rows: unknown[] = [];
      for (let page = 0; page < 5; page++) {
        const url = new URL(TDX_URL);
        url.searchParams.set('$filter', `DepartureAirportID eq '${from}' and ArrivalAirportID eq '${to}'`);
        url.searchParams.set('$orderby', 'FlightNumber,ScheduleStartDate,DepartureTime');
        url.searchParams.set('$top', '500'); url.searchParams.set('$skip', String(page * 500)); url.searchParams.set('$format', 'JSON');
        let access = await getToken(); spend();
        let response = await fetchImpl(url, { headers: { Authorization: `Bearer ${access}`, Accept: 'application/json' }, signal: AbortSignal.timeout(8000), redirect: 'error' });
        if (response.status === 401) {
          await response.body?.cancel(); token = null; access = await getToken(); spend();
          response = await fetchImpl(url, { headers: { Authorization: `Bearer ${access}`, Accept: 'application/json' }, signal: AbortSignal.timeout(8000), redirect: 'error' });
        }
        const values = z.array(z.unknown()).max(500).parse(await boundedJson(response, 2_000_000));
        rows.push(...values);
        if (values.length < 500) {
          const fetchedAt = now();
          if (options.onSnapshot) options.onSnapshot(summarizeTdxSnapshot(rows, from, to, fetchedAt));
          if (options.onReplaySnapshot) options.onReplaySnapshot(captureTdxReplaySnapshot(rows, from, to, fetchedAt));
          return { rows, fetchedAt };
        }
      }
      throw new Error('Pagination exceeds bound');
    } finally { const next = waiters.shift(); if (next) next(); else active--; }
  }
  return { configured, async query(input: unknown): Promise<FlightQueryResponse> {
    const query = FlightQuerySchema.parse(input);
    const unknown = (issue: ScheduleIssue): FlightQueryResponse => ({ version: 1, query, source: SOURCE, days: datesBetween(query.start, query.end).map((date) => unknownScheduleDay(date, issue, now())) });
    if (!configured) return unknown('not-configured');
    if (!taiwanAirports.has(query.from) && !taiwanAirports.has(query.to)) return unknown('out-of-range');
    const today = new Date(now()).toISOString().slice(0, 10);
    if (query.end < addCalendarDays(today, -1) || query.start > addCalendarDays(today, 365)) return unknown('out-of-range');
    const key = `${query.from}:${query.to}`;
    const cached = cache.get(key);
    if (cached && cached.fetchedAt + TTL > now()) return normalizeTdxSchedules(cached.rows, query, cached.fetchedAt, now());
    if (!pending.has(key) && pending.size >= 16) return unknown('budget-exceeded');
    try {
      let task = pending.get(key);
      if (!task) {
        task = fetchRoute(query.from, query.to).then((result) => {
          if (cache.size >= 64) cache.delete(cache.keys().next().value!);
          cache.set(key, result); return result;
        }).finally(() => pending.delete(key));
        pending.set(key, task);
      }
      const result = await task;
      return normalizeTdxSchedules(result.rows, query, result.fetchedAt, now());
    } catch (error) { return unknown(error instanceof Error && error.message === 'budget-exceeded' ? 'budget-exceeded' : 'provider-error'); }
  } };
}
