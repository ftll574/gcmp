import { expect, test } from 'vitest';
import { mergeRouteNetworkCatalogs, mergeRouteNumberEvidence } from '../../../src/lib/rtw/route-network-merge.ts';
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

test('lower flight-number evidence survives while higher route semantics still win', () => {
  const numberLayer = RouteNetworkCatalogSchema.parse({
    version: '2026.3', coverage: 'curated-not-complete', sources: [source('numbers')], carrierUniverses: [],
    routes: [{
      carrier: 'AA', pair: ['DFW', 'LAX'], service: 'nonstop', status: 'published',
      carrierIdentity: 'provider-listed', flightNumbers: ['AA100'], flightNumberSourceIds: ['numbers'],
      flightNumberCandidates: ['AA101'], flightNumberCandidateSourceIds: ['numbers'], sourceIds: ['numbers'],
    }],
  });
  const curated = RouteNetworkCatalogSchema.parse({
    version: '2026.3', coverage: 'curated-not-complete', sources: [source('curated')], carrierUniverses: [],
    routes: [{
      carrier: 'AA', pair: ['DFW', 'LAX'], service: 'nonstop', status: 'published',
      carrierIdentity: 'operating', flightNumbers: ['AA102'], flightNumberSourceIds: ['curated'],
      flightNumberCandidates: ['AA100'], flightNumberCandidateSourceIds: ['curated'], sourceIds: ['curated'],
    }],
  });
  expect(mergeRouteNetworkCatalogs(curated, numberLayer).routes).toEqual([
    expect.objectContaining({
      carrierIdentity: 'operating',
      flightNumbers: ['AA100', 'AA102'],
      flightNumberCandidates: ['AA101'],
      sourceIds: ['curated'],
      flightNumberSourceIds: ['numbers', 'curated'],
      flightNumberCandidateSourceIds: ['numbers', 'curated'],
    }),
  ]);
});

test('number-only overlay cannot resurrect a stale route', () => {
  const base = RouteNetworkCatalogSchema.parse({
    version: '2026.3', coverage: 'curated-not-complete', sources: [source('base')], carrierUniverses: [],
    routes: [{ carrier: 'AA', pair: ['DFW', 'LAX'], service: 'nonstop', status: 'published', sourceIds: ['base'] }],
  });
  const evidence = RouteNetworkCatalogSchema.parse({
    version: '2026.3', coverage: 'curated-not-complete', sources: [source('numbers')], carrierUniverses: [],
    routes: [{
      carrier: 'AA', pair: ['DFW', 'JFK'], service: 'nonstop', status: 'published', sourceIds: ['numbers'],
      flightNumberCandidates: ['AA100'], flightNumberCandidateSourceIds: ['numbers'],
    }],
  });
  expect(() => mergeRouteNumberEvidence(base, evidence)).toThrow('missing route AA:DFW-JFK');
});

test('flight-identity audit can downgrade but not delete an existing route', () => {
  const base = RouteNetworkCatalogSchema.parse({
    version: '2026.3', coverage: 'curated-not-complete', sources: [source('base')], carrierUniverses: [],
    routes: [{ carrier: 'AF', pair: ['CDG', 'AGA'], service: 'nonstop', status: 'published', sourceIds: ['base'] }],
  });
  const audit = RouteNetworkCatalogSchema.parse({
    version: '2026.3', coverage: 'curated-not-complete', sources: [source('audit')], carrierUniverses: [],
    routes: [{ carrier: 'AF', pair: ['CDG', 'AGA'], service: 'nonstop', status: 'identity-unresolved', sourceIds: ['audit'] }],
  });
  expect(mergeRouteNumberEvidence(base, audit).routes).toEqual([
    expect.objectContaining({
      carrier: 'AF', pair: ['CDG', 'AGA'], status: 'identity-unresolved', sourceIds: ['base', 'audit'],
    }),
  ]);
});
