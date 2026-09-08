import { z } from 'zod';
import { TdxReplayBundleSchema } from './tdx-snapshot.ts';
import { normalizeTdxSchedules } from './tdx-schedules.ts';
import { datesBetween } from '../src/lib/calendar-date.ts';

const RapidApiBase = 'https://aerodatabox.p.rapidapi.com';
const MAX_REQUESTS = 30;
const REQUEST_DELAY_MS = 1100;

const Airport = z.object({ iata: z.string().regex(/^[A-Z]{3}$/).optional() }).passthrough();
const Movement = z.object({ airport: Airport.optional() }).passthrough();
const Airline = z.object({ iata: z.string().regex(/^[A-Z0-9]{2}$/).optional(), name: z.string().max(200).optional() }).passthrough();
const Flight = z.object({
  number: z.string().min(2).max(16),
  codeshareStatus: z.enum(['Unknown', 'IsOperator', 'IsCodeshared']).or(z.number().int().min(0).max(2)),
  isCargo: z.boolean(),
  airline: Airline.optional(),
  departure: Movement.optional(),
  arrival: Movement.optional(),
}).passthrough();
const ResponseSchema = z.array(Flight).max(200);

export interface CalibrationTarget {
  from: string;
  to: string;
  date: string;
  designator: string;
}

export interface CalibrationObservation extends CalibrationTarget {
  matches: number;
  codeshareStatuses: string[];
  airlineCodes: string[];
  routeMatches: number;
  inferredOperator: string | null;
  confidence: 'provider-asserted' | 'unknown' | 'conflict';
}

function statusName(value: z.infer<typeof Flight>['codeshareStatus']): 'Unknown' | 'IsOperator' | 'IsCodeshared' {
  if (typeof value === 'string') return value;
  return value === 1 ? 'IsOperator' : value === 2 ? 'IsCodeshared' : 'Unknown';
}

function normalizedDesignator(value: string): string | null {
  const match = /^([A-Z0-9]{2})\s*0*(\d{1,4}[A-Z]?)$/.exec(value.trim().toUpperCase());
  return match ? `${match[1]}${match[2]}` : null;
}

function scoreObservation(target: CalibrationTarget, raw: unknown): CalibrationObservation {
  const parsed = ResponseSchema.safeParse(raw);
  if (!parsed.success) return { ...target, matches: 0, codeshareStatuses: [], airlineCodes: [], routeMatches: 0, inferredOperator: null, confidence: 'unknown' };
  const relevant = parsed.data.filter((flight) => normalizedDesignator(flight.number) === target.designator && !flight.isCargo);
  const route = relevant.filter((flight) => {
    const from = flight.departure?.airport?.iata;
    const to = flight.arrival?.airport?.iata;
    return (from === undefined || from === target.from) && (to === undefined || to === target.to);
  });
  const statuses = [...new Set(route.map((flight) => statusName(flight.codeshareStatus)))].sort();
  const airlineCodes = [...new Set(route.flatMap((flight) => flight.airline?.iata ? [flight.airline.iata] : []))].sort();
  const operators = [...new Set(route.filter((flight) => statusName(flight.codeshareStatus) === 'IsOperator')
    .flatMap((flight) => flight.airline?.iata ? [flight.airline.iata] : []))];
  const inferredOperator = operators.length === 1 ? operators[0]! : null;
  // `IsOperator` is a provider assertion, not independent proof. During the
  // 2026-09-06 calibration AeroDataBox returned IsOperator for BOTH AS7218
  // and JX12 on TPE-SFO, while independent sources identify AS7218 as the
  // codeshare of JX12. Never promote an AeroDataBox-only assertion directly.
  const confidence = operators.length > 1 ? 'conflict'
    : operators.length === 1 ? 'provider-asserted' : 'unknown';
  return { ...target, matches: relevant.length, codeshareStatuses: statuses, airlineCodes, routeMatches: route.length, inferredOperator, confidence };
}

/** Deterministic, free-quota-friendly sample: at most one unresolved designator
 * per route/airline code first, then fill remaining slots. The saved TDX rows
 * remain the source of candidate dates; known operator evidence is excluded by
 * normalizeTdxSchedules so we spend quota only on unresolved references. */
export function buildAeroDataBoxCalibrationTargets(input: unknown, limit = MAX_REQUESTS): CalibrationTarget[] {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_REQUESTS) throw new Error('Invalid calibration limit');
  const bundle = TdxReplayBundleSchema.parse(input);
  const candidates: CalibrationTarget[] = [];
  for (const snapshot of bundle.snapshots) {
    const evaluatedAt = Math.max(Date.parse(snapshot.fetchedAt), Date.parse('2026-09-05T17:44:00Z'));
    const queryStart = snapshot.from === 'TPE' && snapshot.to === 'SFO' ? '2026-09-07' : '2026-09-07';
    const result = normalizeTdxSchedules(snapshot.rows, { from: snapshot.from, to: snapshot.to, start: queryStart, end: '2026-09-13' }, Date.parse(snapshot.fetchedAt), evaluatedAt);
    for (const day of result.days) for (const ref of day.references ?? []) {
      candidates.push({ from: ref.from, to: ref.to, date: ref.date, designator: ref.airlineCode + ref.flightNumber });
    }
  }
  const unique = new Map<string, CalibrationTarget>();
  for (const candidate of candidates) unique.set(`${candidate.from}:${candidate.to}:${candidate.date}:${candidate.designator}`, candidate);
  const all = [...unique.values()].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.designator.localeCompare(b.designator) || a.date.localeCompare(b.date));
  const chosen: CalibrationTarget[] = [];
  const strata = new Set<string>();
  for (const item of all) {
    const stratum = `${item.from}:${item.to}:${item.designator.slice(0, 2)}`;
    if (!strata.has(stratum)) { strata.add(stratum); chosen.push(item); }
    if (chosen.length === limit) return chosen;
  }
  for (const item of all) {
    if (!chosen.includes(item)) chosen.push(item);
    if (chosen.length === limit) break;
  }
  return chosen;
}

export async function runAeroDataBoxTargets(options: {
  targets: CalibrationTarget[];
  apiKey?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}) {
  const targets = options.targets;
  if (targets.length > MAX_REQUESTS) throw new Error('Calibration target limit exceeded');
  if (!options.apiKey?.trim()) return { configured: false, externalRequests: 0, targets, observations: [] as CalibrationObservation[] };
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const observations: CalibrationObservation[] = [];
  let externalRequests = 0;
  for (const [index, target] of targets.entries()) {
    if (index > 0) await sleep(REQUEST_DELAY_MS);
    const url = new URL(`${RapidApiBase}/flights/number/${encodeURIComponent(target.designator)}/${target.date}`);
    url.searchParams.set('withAircraftImage', 'false'); url.searchParams.set('withLocation', 'false');
    const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(8000), headers: {
      Accept: 'application/json', 'X-RapidAPI-Key': options.apiKey, 'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com',
    } });
    externalRequests++;
    if (!response.ok || Number(response.headers.get('content-length')) > 1_000_000) {
      observations.push({ ...target, matches: 0, codeshareStatuses: [], airlineCodes: [], routeMatches: 0, inferredOperator: null, confidence: 'unknown' });
      continue;
    }
    let raw: unknown;
    try { raw = await response.json(); } catch { raw = null; }
    observations.push(scoreObservation(target, raw));
  }
  const resolved = observations.filter((item) => item.inferredOperator !== null);
  const conflicts = observations.filter((item) => item.confidence === 'conflict');
  return {
    configured: true, externalRequests, targets, observations,
    summary: {
      targets: targets.length,
      resolved: resolved.length,
      providerAsserted: observations.filter((item) => item.confidence === 'provider-asserted').length,
      unknown: observations.filter((item) => item.confidence === 'unknown').length,
      conflicts: conflicts.length,
      resolvedRate: targets.length ? resolved.length / targets.length : 0,
    },
  };
}

export async function runAeroDataBoxCalibration(options: {
  snapshot: unknown;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  limit?: number;
  sleep?: (ms: number) => Promise<void>;
}) {
  return runAeroDataBoxTargets({
    targets: buildAeroDataBoxCalibrationTargets(options.snapshot, options.limit ?? 18),
    apiKey: options.apiKey, fetchImpl: options.fetchImpl, sleep: options.sleep,
  });
}

export function calibrationDates(start: string, end: string): string[] { return datesBetween(start, end); }
