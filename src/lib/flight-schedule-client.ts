import { FlightQuerySchema, FlightQueryResponseSchema, type FlightQuery, type FlightQueryResponse } from './schemas/dated-schedules.ts';

/** Only this gateway is called by the browser. Supplier credentials never
 * enter the client. Responses must match the EXACT requested route/range. */
export async function fetchFlightSchedules(
  base: string, query: FlightQuery, signal: AbortSignal, fetchImpl: typeof fetch = fetch,
): Promise<FlightQueryResponse> {
  FlightQuerySchema.parse(query);
  const url = new URL(`${base.replace(/\/$/, '')}/schedules`, window.location.origin);
  if (url.username || url.password || url.hash || !['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid gateway URL');
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('HTTPS gateway required');
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const response = await fetchImpl(url, { signal, credentials: 'omit', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Schedule service unavailable');
  const result = FlightQueryResponseSchema.parse(await response.json());
  if (Object.entries(query).some(([key, value]) => result.query[key as keyof FlightQuery] !== value)) throw new Error('Schedule query mismatch');
  return result;
}
