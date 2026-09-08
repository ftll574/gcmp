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
    routeCountByCarrier: Record<string, number>;
    confirmedOperatingCountByCarrier: Record<string, number>;
    providerListedCountByCarrier: Record<string, number>;
    originShards: Record<string, { routes: number; bytes: number; sha256: string }>;
  };

  expect(meta.version).toBe(1);
  expect(meta.confirmedOperatingRoutes + meta.providerListedRoutes).toBe(meta.publishedRoutes);
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
  }
});
