import { LiveRouteResponseSchema, type LiveRouteResponse } from './schemas/live-routes.ts';

export async function fetchLiveRoutes(
  base: string,
  origin: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<LiveRouteResponse> {
  const normalized = origin.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error('Invalid live route origin');
  const url = new URL(`${base.replace(/\/$/, '')}/schedules/routes`, window.location.origin);
  if (url.username || url.password || url.hash || !['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid gateway URL');
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('HTTPS gateway required');
  url.searchParams.set('origin', normalized);
  const response = await fetchImpl(url, { signal, credentials: 'omit', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Live route service unavailable');
  const result = LiveRouteResponseSchema.parse(await response.json());
  if (result.origin !== normalized) throw new Error('Live route response mismatch');
  return result;
}
