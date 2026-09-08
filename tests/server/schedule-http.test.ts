// @vitest-environment node
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, test } from 'vitest';
import { createScheduleHttpServer } from '../../server/schedule-http.ts';
import { createScheduleGateway } from '../../server/flight-schedules.ts';

const servers: Server[] = [];
afterEach(async () => { for (const server of servers.splice(0)) {
  server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve()));
} });
async function start() {
  const server = createScheduleHttpServer(createScheduleGateway({}), new Set(['https://planner.example']));
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
test('a real HTTP request without provider credentials returns unknown dates, not fixture flights', async () => {
  const base = await start();
  const response = await fetch(`${base}/api/schedules?from=TPE&to=HKG&start=2026-09-07&end=2026-09-07`);
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
  const body = await response.json(); expect(body.days[0].issue).toBe('not-configured'); expect(body.days[0].flights).toEqual([]);
});
test('rejects untrusted origins, methods and duplicate query parameters', async () => {
  const base = await start();
  expect((await fetch(`${base}/api/schedules/health`, { headers: { Origin: 'https://untrusted.example' } })).status).toBe(403);
  expect((await fetch(`${base}/api/schedules`, { method: 'POST' })).status).toBe(405);
  expect((await fetch(`${base}/api/schedules?from=TPE&from=HKG&to=HKG&start=2026-09-07&end=2026-09-07`)).status).toBe(400);
  const allowed = await fetch(`${base}/api/schedules/health`, { headers: { Origin: 'https://planner.example' } });
  expect(allowed.headers.get('access-control-allow-origin')).toBe('https://planner.example');
  expect(await allowed.json()).toMatchObject({ configured: false, awardInventory: false });
});
test('applies server-side rate limiting without trusting X-Forwarded-For', async () => {
  const base = await start();
  for (let i = 0; i < 10; i++) expect((await fetch(`${base}/api/schedules/health`, { headers: { 'X-Forwarded-For': String(i) } })).status).toBe(200);
  const response = await fetch(`${base}/api/schedules/health`, { headers: { 'X-Forwarded-For': 'fresh-ip' } });
  expect(response.status).toBe(429); expect(response.headers.get('retry-after')).toBe('60');
});
