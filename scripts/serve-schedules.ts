import { existsSync } from 'node:fs';
import { createHybridScheduleGateway, DEFAULT_SCHEDULE_PROVIDER, type ScheduleProvider } from '../server/hybrid-schedules.ts';
import { createLiveRouteGateway } from '../server/live-routes.ts';
import { createScheduleHttpServer } from '../server/schedule-http.ts';

// Fixed local secret file; never included in the public build or returned.
if (existsSync('.env.schedules.local')) process.loadEnvFile('.env.schedules.local');
const port = Number(process.env.SCHEDULE_PORT ?? '8787');
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid SCHEDULE_PORT');
const origins = new Set((process.env.SCHEDULE_ALLOWED_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',').map((value) => new URL(value.trim()).origin));
const provider = process.env.SCHEDULE_PROVIDER ?? DEFAULT_SCHEDULE_PROVIDER;
if (!['auto', 'tdx', 'official', 'cirium'].includes(provider)) throw new Error('Invalid SCHEDULE_PROVIDER');
const gateway = createHybridScheduleGateway({
  provider: provider as ScheduleProvider,
  clientId: process.env.TDX_CLIENT_ID, clientSecret: process.env.TDX_CLIENT_SECRET,
  appId: process.env.CIRIUM_APP_ID, appKey: process.env.CIRIUM_APP_KEY,
  dailyBudget: Number(process.env.SCHEDULE_DAILY_BUDGET ?? '200'),
});
const liveRoutes = createLiveRouteGateway({ dailyBudget: Number(process.env.LIVE_ROUTE_DAILY_BUDGET ?? '500') });
const server = createScheduleHttpServer(gateway, origins, liveRoutes);
server.listen(port, '127.0.0.1', () => {
  console.log(`Schedule gateway listening on 127.0.0.1:${port}; provider: ${provider}; credentials configured: ${gateway.configured}; official timetable mode available`);
});
server.requestTimeout = 75000;
server.headersTimeout = 10000;
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close());
