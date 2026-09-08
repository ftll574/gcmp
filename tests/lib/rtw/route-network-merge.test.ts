import { expect, test } from 'vitest';
import { mergeRouteNetworkCatalogs } from '../../../src/lib/rtw/route-network-merge.ts';
import { RouteNetworkCatalogSchema } from '../../../src/lib/schemas/route-network.ts';

const source = (id: string) => ({ id, url: `https://example.com/${id}`, checkedOn: '2026-09-08', note: `${id} fixture.` });

test('observed routes fill gaps while curated rows win identical directional keys', () => {
  const observed = RouteNetworkCatalogSchema.parse({
    version: '2026.3', coverage: 'curated-not-complete', sources: [source('observed')],
    carrierUniverses: [{ carrier: 'BR', scope: 'partial', asOf: '2026-09-08', sourceIds: ['observed'], note: 'Observed fixture.' }],
    routes: [
      { carrier: 'BR', pair: ['TPE', 'BKK'], service: 'nonstop', status: 'published', sourceIds: ['observed'] },
      { carrier: 'BR', pair: ['TPE', 'HKG'], service: 'nonstop', status: 'published', sourceIds: ['observed'] },
    ],
  });
  const curated = RouteNetworkCatalogSchema.parse({
    version: '2026.3', coverage: 'curated-not-complete', sources: [source('curated')], carrierUniverses: [],
    routes: [{ carrier: 'BR', pair: ['TPE', 'BKK'], service: 'nonstop', status: 'suspended', sourceIds: ['curated'], effectiveFrom: '2026-09-08' }],
  });
  const merged = mergeRouteNetworkCatalogs(curated, observed);
  expect(merged.routes).toHaveLength(2);
  expect(merged.routes.find((route) => route.pair.join('-') === 'TPE-BKK')).toMatchObject({ status: 'suspended', sourceIds: ['curated'] });
  expect(merged.routes.find((route) => route.pair.join('-') === 'TPE-HKG')).toMatchObject({ status: 'published', sourceIds: ['observed'] });
});

test('source id conflicts and version drift fail loudly', () => {
  const first = RouteNetworkCatalogSchema.parse({ version: '2026.3', coverage: 'curated-not-complete', sources: [source('same')], carrierUniverses: [], routes: [] });
  const conflicting = RouteNetworkCatalogSchema.parse({ version: '2026.3', coverage: 'curated-not-complete', sources: [{ ...source('same'), note: 'Different.' }], carrierUniverses: [], routes: [] });
  expect(() => mergeRouteNetworkCatalogs(first, conflicting)).toThrow('Conflicting route-network source same');
  const otherVersion = RouteNetworkCatalogSchema.parse({ version: '2026.4', coverage: 'curated-not-complete', sources: [source('other')], carrierUniverses: [], routes: [] });
  expect(() => mergeRouteNetworkCatalogs(first, otherVersion)).toThrow('version mismatch');
});

test('higher-priority operating evidence is never downgraded by provider-listed fallback', () => {
  const operating = RouteNetworkCatalogSchema.parse({
    version: '2026.3', coverage: 'curated-not-complete', sources: [source('operating')], carrierUniverses: [],
    routes: [{
      carrier: 'AA', pair: ['DFW', 'LAX'], service: 'nonstop', status: 'published',
      carrierIdentity: 'operating', sourceIds: ['operating'],
    }],
  });
  const listed = RouteNetworkCatalogSchema.parse({
    version: '2026.3', coverage: 'curated-not-complete', sources: [source('listed')], carrierUniverses: [],
    routes: [{
      carrier: 'AA', pair: ['DFW', 'LAX'], service: 'nonstop', status: 'published',
      carrierIdentity: 'provider-listed', sourceIds: ['listed'],
    }],
  });
  expect(mergeRouteNetworkCatalogs(operating, listed).routes).toEqual([
    expect.objectContaining({ carrier: 'AA', pair: ['DFW', 'LAX'], carrierIdentity: 'operating', sourceIds: ['operating'] }),
  ]);
});
