// @vitest-environment node
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, test, vi } from 'vitest';
import { createScheduleGateway } from '../../server/flight-schedules.ts';
import { createLiveRouteGateway } from '../../server/live-routes.ts';
import { createScheduleHttpServer } from '../../server/schedule-http.ts';

const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

async function start() {
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
    from: 'TPE',
    destinations: [{
      route_id: 'TPE-BKK', from: 'TPE', to: 'BKK', status: 'active', seasonality_label: null,
      airlines: [{ airline_code: 'BR', airline: 'EVA Air', schedule: [{ day: 'Tue', times: [] }], service_type: 'scheduled' }],
      booking: { url: 'https://air-routes.com/r/TPE-BKK' },
    }],
  }), { status: 200 }));
  const server = createScheduleHttpServer(
    createScheduleGateway({}),
    new Set(['https://planner.example']),
    createLiveRouteGateway({ fetchImpl: fetchImpl as typeof fetch, now: () => Date.parse('2026-09-08T01:00:00Z') }),
  );
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, fetchImpl };
}

test('serves a validated live origin without exposing provider internals', async () => {
  const { base, fetchImpl } = await start();
  const response = await fetch(`${base}/api/schedules/routes?origin=TPE`, { headers: { Origin: 'https://planner.example' } });
  expect(response.status).toBe(200);
  expect(response.headers.get('access-control-allow-origin')).toBe('https://planner.example');
  const body = await response.json();
  expect(body).toMatchObject({ origin: 'TPE', routes: [{ from: 'TPE', to: 'BKK', carriers: [{ code: 'BR' }] }] });
  expect(JSON.stringify(body)).not.toContain('apiKey');
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test('rejects malformed or duplicate live route queries before contacting the provider', async () => {
  const { base, fetchImpl } = await start();
  expect((await fetch(`${base}/api/schedules/routes?origin=tpe`)).status).toBe(400);
  expect((await fetch(`${base}/api/schedules/routes?origin=TPE&origin=HKG`)).status).toBe(400);
  expect((await fetch(`${base}/api/schedules/routes?origin=TPE&extra=1`)).status).toBe(400);
  expect(fetchImpl).not.toHaveBeenCalled();
});
