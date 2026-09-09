import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { parseRouteNetworkCatalog } from '../../../src/lib/schemas/route-network.ts';

const ROOT = 'public/data/route-network';

test('premerged runtime route network is current with every source layer', () => {
  const meta = JSON.parse(readFileSync(`${ROOT}/runtime-current.meta.json`, 'utf8')) as {
    version: number;
    routes: number;
    publishedRoutes: number;
    carriers: number;
    confirmedOperatingRoutes: number;
    providerListedRoutes: number;
    confirmedFlightNumberRoutes: number;
    candidateFlightNumberRoutes: number;
    anyFlightNumberRoutes: number;
    routeCountByCarrier: Record<string, number>;
    confirmedOperatingCountByCarrier: Record<string, number>;
    providerListedCountByCarrier: Record<string, number>;
    originShards: Record<string, { routes: number; bytes: number; sha256: string }>;
  };

  expect(meta.version).toBe(1);
  expect(meta.confirmedOperatingRoutes + meta.providerListedRoutes).toBe(meta.publishedRoutes);
  expect(meta.confirmedFlightNumberRoutes).toBeGreaterThan(14_000);
  expect(meta.candidateFlightNumberRoutes).toBeGreaterThan(24_000);
  expect(meta.anyFlightNumberRoutes).toBe(meta.publishedRoutes);
  expect(Object.keys(meta.routeCountByCarrier)).toHaveLength(meta.carriers);
  expect(Object.values(meta.routeCountByCarrier).reduce((sum, count) => sum + count, 0)).toBe(meta.publishedRoutes);
  expect(Object.values(meta.confirmedOperatingCountByCarrier).reduce((sum, count) => sum + count, 0)).toBe(meta.confirmedOperatingRoutes);
  expect(Object.values(meta.providerListedCountByCarrier).reduce((sum, count) => sum + count, 0)).toBe(meta.providerListedRoutes);

  expect(Object.keys(meta.originShards).sort()).toEqual('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''));
  const shardedRoutes = Object.values(meta.originShards).reduce((sum, shard) => sum + shard.routes, 0);
  expect(shardedRoutes).toBe(meta.routes);

  // Representative tiny/medium/large shards still get full schema + origin
  // validation without turning the unit suite into a 16 MB Zod stress test.
  for (const letter of ['A', 'Q', 'T']) {
    const shard = parseRouteNetworkCatalog(JSON.parse(readFileSync(`${ROOT}/runtime-origins/${letter}.json`, 'utf8')));
    expect(shard.routes).toHaveLength(meta.originShards[letter]!.routes);
    expect(shard.routes.every((route) => route.pair[0].startsWith(letter))).toBe(true);
    for (const route of shard.routes) {
      if ((route.flightNumbers?.length ?? 0) > 0) expect(route.flightNumberSourceIds?.length).toBeGreaterThan(0);
      if ((route.flightNumberCandidates?.length ?? 0) > 0) expect(route.flightNumberCandidateSourceIds?.length).toBeGreaterThan(0);
      if (route.status === 'published') {
        expect((route.flightNumbers?.length ?? 0) + (route.flightNumberCandidates?.length ?? 0)).toBeGreaterThan(0);
      }
    }
  }
});

test('current corrections keep stale or mismatched carrier routes out of the planner without erasing audit evidence', () => {
  const runtime = parseRouteNetworkCatalog(JSON.parse(readFileSync(`${ROOT}/runtime-current.json`, 'utf8')));
  const find = (carrier: string, from: string, to: string) => runtime.routes.find(
    (route) => route.carrier === carrier && route.pair[0] === from && route.pair[1] === to,
  );

  expect(find('ET', 'ADD', 'ATL')?.status).toBe('suspended');
  expect(find('AI', 'SFO', 'DEL')?.status).toBe('suspended');
  expect(find('FJ', 'NAN', 'DFW')?.status).toBe('suspended');
  expect(find('SN', 'BGO', 'BRU')).toMatchObject({ status: 'identity-unresolved', carrierIdentity: 'provider-listed' });
  expect(find('TK', 'IST', 'HRG')).toMatchObject({ status: 'identity-unresolved', carrierIdentity: 'provider-listed' });
  expect(find('SN', 'BRU', 'ORD')).toMatchObject({
    status: 'published',
    carrierIdentity: 'provider-listed',
    flightNumberCandidates: expect.arrayContaining(['SN8803']),
  });
});

test('every current plannable runtime route exposes a confirmed or candidate flight designator', () => {
  const runtime = JSON.parse(readFileSync(`${ROOT}/runtime-current.json`, 'utf8')) as {
    routes: Array<{
      carrier: string;
      pair: [string, string];
      status: 'published' | 'suspended' | 'identity-unresolved';
      flightNumbers?: string[];
      flightNumberCandidates?: string[];
    }>;
  };
  const schedules = JSON.parse(readFileSync('public/data/schedules/current.json', 'utf8')) as {
    entries: Array<{ carrier: string; pair: [string, string]; status: string; flightNumbers?: string[] }>;
  };
  const official = JSON.parse(readFileSync('public/data/official-schedules.json', 'utf8')) as {
    services: Array<{ carrier: string; from: string; to: string; flightNumber: string }>;
    flightNumberReferences: Array<{ carrier: string; from: string; to: string; flightNumbers: string[] }>;
  };

  const externallyNumbered = new Set<string>();
  for (const row of schedules.entries) {
    if (row.status !== 'suspended' && (row.flightNumbers?.length ?? 0) > 0) {
      externallyNumbered.add(`${row.carrier}:${row.pair[0]}-${row.pair[1]}`);
    }
  }
  for (const row of official.services) externallyNumbered.add(`${row.carrier}:${row.from}-${row.to}`);
  for (const row of official.flightNumberReferences) {
    if (row.flightNumbers.length > 0) externallyNumbered.add(`${row.carrier}:${row.from}-${row.to}`);
  }

  const published = runtime.routes.filter((route) => route.status === 'published');
  const missing = published.filter((route) =>
    (route.flightNumbers?.length ?? 0) === 0
    && (route.flightNumberCandidates?.length ?? 0) === 0
    && !externallyNumbered.has(`${route.carrier}:${route.pair[0]}-${route.pair[1]}`),
  );

  expect(published.length).toBeGreaterThan(29_000);
  expect(missing).toEqual([]);
});
