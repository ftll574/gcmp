import { z } from 'zod';
import { LiveRouteResponseSchema, type LiveRouteResponse } from '../src/lib/schemas/live-routes.ts';

const IataAirportSchema = z.string().regex(/^[A-Z]{3}$/);
const RawScheduleSchema = z.object({
  day: z.enum(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']),
  times: z.array(z.string().max(20)).max(40),
}).passthrough();
const RawAirlineSchema = z.object({
  // A provider origin payload can contain one malformed/non-IATA carrier
  // token alongside otherwise valid routes. Parse the bounded string here and
  // reject it per carrier below so one bad token cannot discard the origin.
  airline_code: z.string().max(12),
  airline: z.string().min(1).max(120),
  schedule: z.array(RawScheduleSchema).max(14).default([]),
  seasonal_note: z.string().max(300).nullable().optional(),
  service_type: z.string().max(40).nullable().optional(),
}).passthrough();
const RawDestinationSchema = z.object({
  route_id: z.string().regex(/^[A-Z]{3}-[A-Z]{3}$/),
  from: IataAirportSchema,
  to: IataAirportSchema,
  status: z.string().max(40),
  seasonality_label: z.string().max(120).nullable().optional(),
  airlines: z.array(RawAirlineSchema).max(100),
  booking: z.object({ url: z.string().url().optional() }).passthrough().optional(),
}).passthrough();
const RawPayloadSchema = z.object({
  from: IataAirportSchema,
  destinations: z.array(RawDestinationSchema).max(1500),
}).passthrough();

const SOURCE = {
  name: 'air-routes.com current scheduled passenger routes' as const,
  url: 'https://air-routes.com/developers' as const,
};
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MAX_RESPONSE_BYTES = 1_500_000;
const DAY_ORDER = new Map(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => [day, index]));
const LOCAL_CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export interface LiveRouteGatewayOptions {
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
  readonly ttlMs?: number;
  readonly dailyBudget?: number;
}

export function normalizeLiveRoutes(raw: unknown, origin: string, now: number, ttlMs = DEFAULT_TTL_MS): LiveRouteResponse {
  const parsed = RawPayloadSchema.parse(raw);
  if (parsed.from !== origin) throw new Error('Live route origin mismatch');
  const routes = parsed.destinations.flatMap((destination) => {
    if (destination.from !== origin || destination.from === destination.to || destination.status !== 'active') return [];
    const carriers = [...new Map(destination.airlines.flatMap((airline) => {
      if (airline.service_type && airline.service_type !== 'scheduled') return [];
      const carrierCode = airline.airline_code.trim().toUpperCase();
      if (!/^[A-Z0-9]{2,3}$/.test(carrierCode)) return [];
      const scheduleByDay = new Map<string, Set<string>>();
      for (const row of airline.schedule) {
        const times = scheduleByDay.get(row.day) ?? new Set<string>();
        for (const time of row.times) if (LOCAL_CLOCK.test(time)) times.add(time);
        scheduleByDay.set(row.day, times);
      }
      const weeklySchedule = [...scheduleByDay.entries()]
        .sort(([a], [b]) => (DAY_ORDER.get(a) ?? 99) - (DAY_ORDER.get(b) ?? 99))
        .map(([day, times]) => ({ day, times: [...times].sort() }));
      return [[carrierCode, {
        code: carrierCode,
        name: airline.airline,
        days: weeklySchedule.map((row) => row.day),
        weeklySchedule,
        seasonalNote: airline.seasonal_note ?? null,
      }] as const];
    })).values()];
    if (carriers.length === 0) return [];
    const sourceUrl = destination.booking?.url?.startsWith('https://air-routes.com/r/')
      ? destination.booking.url
      : `https://air-routes.com/r/${destination.from}-${destination.to}`;
    return [{
      from: destination.from,
      to: destination.to,
      status: 'active' as const,
      seasonalityLabel: destination.seasonality_label ?? null,
      carriers,
      sourceUrl,
    }];
  });
  return LiveRouteResponseSchema.parse({
    version: 1,
    origin,
    source: SOURCE,
    checkedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
    routes,
  });
}

export function createLiveRouteGateway(options: LiveRouteGatewayOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const dailyBudget = options.dailyBudget ?? 500;
  if (!Number.isInteger(dailyBudget) || dailyBudget < 1 || dailyBudget > 5000) throw new Error('dailyBudget must be 1..5000');
  const cache = new Map<string, LiveRouteResponse>();
  const pending = new Map<string, Promise<LiveRouteResponse>>();
  let budgetDate = '';
  let used = 0;

  async function fetchOrigin(origin: string): Promise<LiveRouteResponse> {
    const current = now();
    const today = new Date(current).toISOString().slice(0, 10);
    if (budgetDate !== today) { budgetDate = today; used = 0; }
    if (used >= dailyBudget) throw new Error('Live route request budget exceeded');
    used += 1;
    const response = await fetchImpl(`https://air-routes.com/api/airport/${origin}/destinations`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error('Live route provider unavailable');
    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) throw new Error('Live route response too large');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Live route provider returned no body');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error('Live route response too large'); }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return normalizeLiveRoutes(JSON.parse(new TextDecoder().decode(bytes)), origin, now(), ttlMs);
  }

  async function query(input: string): Promise<LiveRouteResponse> {
    const origin = IataAirportSchema.parse(input.trim().toUpperCase());
    const cached = cache.get(origin);
    if (cached && Date.parse(cached.expiresAt) > now()) return cached;
    const inFlight = pending.get(origin);
    if (inFlight) return inFlight;
    if (pending.size >= 16) throw new Error('Too many live route requests');
    const task = fetchOrigin(origin).then((result) => {
      if (cache.size >= 250) cache.delete(cache.keys().next().value!);
      cache.set(origin, result);
      return result;
    }).finally(() => pending.delete(origin));
    pending.set(origin, task);
    return task;
  }

  return { configured: true, query };
}
