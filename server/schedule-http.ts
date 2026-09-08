import { createServer, type Server } from 'node:http';
import { FlightQuerySchema } from '../src/lib/schemas/dated-schedules.ts';
import type { createScheduleGateway } from './flight-schedules.ts';
import type { createLiveRouteGateway } from './live-routes.ts';

/** Default bind is loopback in the entry point. For production put this behind
 * TLS, a reverse proxy and edge abuse controls. Origin checks are NOT billing
 * authorization; the separate process-wide supplier budget remains mandatory. */
export function createScheduleHttpServer(
  gateway: ReturnType<typeof createScheduleGateway> & { capabilities?: Record<string, string | number | boolean> },
  allowedOrigins: ReadonlySet<string>,
  liveRoutes?: ReturnType<typeof createLiveRouteGateway>,
): Server {
  const clients = new Map<string, { since: number; count: number }>();
  return createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (code: number, data: unknown): void => {
      if (res.destroyed) return;
      res.writeHead(code); res.end(JSON.stringify(data));
    };
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.has(origin)) { send(403, { error: 'origin-not-allowed' }); return; }
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Methods', 'GET'); send(204, undefined); return; }
    if (req.method !== 'GET') { send(405, { error: 'method-not-allowed' }); return; }
    const now = Date.now();
    const ip = req.socket.remoteAddress ?? 'unknown'; // never trust client-supplied X-Forwarded-For
    for (const [key, record] of clients) if (now - record.since >= 60000) clients.delete(key);
    if (!clients.has(ip) && clients.size >= 1000) { send(429, { error: 'rate-limited' }); return; }
    const record = clients.get(ip) ?? { since: now, count: 0 };
    record.count++; clients.set(ip, record);
    if (record.count > 10) { res.setHeader('Retry-After', '60'); send(429, { error: 'rate-limited' }); return; }
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/api/schedules/health') {
        send(200, { configured: gateway.configured, scope: 'scheduled-nonstop-passenger-flights', awardInventory: false, ...(gateway.capabilities ? { capabilities: gateway.capabilities } : {}) }); return;
      }
      if (url.pathname === '/api/schedules/routes') {
        if (!liveRoutes) { send(503, { error: 'live-routes-unavailable' }); return; }
        if ([...url.searchParams.keys()].some((key) => key !== 'origin' || url.searchParams.getAll(key).length !== 1)) {
          send(400, { error: 'invalid-query' }); return;
        }
        const origin = url.searchParams.get('origin');
        if (!origin || !/^[A-Z]{3}$/.test(origin)) { send(400, { error: 'invalid-query' }); return; }
        send(200, await liveRoutes.query(origin)); return;
      }
      if (url.pathname !== '/api/schedules') { send(404, { error: 'not-found' }); return; }
      if ([...url.searchParams.keys()].some((key) => url.searchParams.getAll(key).length !== 1)) {
        send(400, { error: 'invalid-query' }); return;
      }
      const query = FlightQuerySchema.safeParse(Object.fromEntries(url.searchParams));
      if (!query.success) { send(400, { error: 'invalid-query' }); return; }
      send(200, await gateway.query(query.data));
    } catch {
      // Never serialize supplier errors, response request URLs or credentials.
      send(502, { error: 'schedule-service-unavailable' });
    }
  });
}
