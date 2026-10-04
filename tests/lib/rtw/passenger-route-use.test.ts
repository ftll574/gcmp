import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { passengerRouteUseCatalog, passengerRouteUseDecision } from '../../../src/lib/rtw/passenger-route-use.ts';
import { PassengerRouteUseCatalogSchema } from '../../../src/lib/schemas/passenger-route-use.ts';
import { buildNextLegIndex } from '../../../src/lib/rtw/next-leg-discovery.ts';
import { mergeLiveNextLegDestinations } from '../../../src/lib/rtw/live-next-leg-discovery.ts';
import { LiveRouteResponseSchema } from '../../../src/lib/schemas/live-routes.ts';
import { parseShareUrl } from '../../../src/lib/url-schema.ts';
import { validateRtwRoute } from '../../../src/lib/rtw/validate.ts';
import { RtwRuleCatalogSchema } from '../../../src/lib/schemas/rtw-rule.ts';
import { AllianceCatalogSchema } from '../../../src/lib/schemas/alliance.ts';
import { parseRouteNetworkCatalog } from '../../../src/lib/schemas/route-network.ts';
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const knownAirports = new Set<string>(read('public/data/airports.json').map((row: { iata: string }) => row.iata));

test('local passenger permission does not certify the named RTW product', () => {
  expect(passengerRouteUseDecision('CM', 'GUA', 'SJO', '2026-10-01', 'star-alliance-rtw-fare')).toBe('product-use-unverified');
  expect(passengerRouteUseDecision('UA', 'NRT', 'UBN', '2026-10-01', 'star-alliance-rtw-fare')).toBe('local-sale-unverified');
  expect(passengerRouteUseDecision('TP', 'MCZ', 'NAT', '2026-10-01', 'star-alliance-rtw-fare')).toBe('local-sale-unverified');
  expect(passengerRouteUseDecision('CM', 'GUA', 'SJO', '2039-07-03', 'star-alliance-rtw-fare')).toBe('local-sale-unverified');
});

test('product evidence is directional, specific and bounded independently of route evidence', () => {
  const row = passengerRouteUseCatalog.entries.find(row => row.carrier === 'CM' && row.pair[0] === 'GUA')!;
  const fixture = PassengerRouteUseCatalogSchema.parse({ ...passengerRouteUseCatalog, entries: [{ ...row, products: [{ productId: 'test-cash-product', status: 'verified', sourceIds: row.sourceIds, validFrom: '2026-10-01', validUntil: '2026-10-02' }] }] });
  expect(passengerRouteUseDecision('CM', 'GUA', 'SJO', '2026-10-01', 'test-cash-product', fixture)).toBe('verified-product-use');
  expect(passengerRouteUseDecision('CM', 'GUA', 'SJO', '2026-10-01', 'different-product', fixture)).toBe('product-use-unverified');
  expect(passengerRouteUseDecision('CM', 'GUA', 'SJO', '2026-10-03', 'test-cash-product', fixture)).toBe('product-use-unverified');
  expect(passengerRouteUseDecision('CM', 'SJO', 'GUA', '2026-10-01', 'test-cash-product', fixture)).toBe('existing-pipeline');
});

test('passenger-use restrictions for shared IATA codes remain entity scoped', () => {
  const row = passengerRouteUseCatalog.entries.find(row => row.carrier === 'CM' && row.pair[0] === 'GUA')!;
  const scoped = PassengerRouteUseCatalogSchema.parse({ ...passengerRouteUseCatalog, entries: [
    { ...row, carrier: '2F', carrierEntityKey: 'BR+ACN+azul-conecta-ltda', pair: ['CNF', 'JDR'], localPassengerSale: 'not-permitted' },
    { ...row, carrier: '2F', carrierEntityKey: 'BR+XYZ+other-airline', carrierEntityName: 'Other Airline S.A.', pair: ['CNF', 'JDR'], localPassengerSale: 'permitted', products: [{ productId: 'test-product', status: 'verified', sourceIds: row.sourceIds, validFrom: '2026-10-01', validUntil: '2026-10-02' }] },
  ] });
  expect(passengerRouteUseDecision('2F', 'CNF', 'JDR', '2026-10-01', 'test-product', scoped, 'BR+ACN+azul-conecta-ltda')).toBe('local-sale-unverified');
  expect(passengerRouteUseDecision('2F', 'CNF', 'JDR', '2026-10-01', 'test-product', scoped, 'BR+XYZ+other-airline')).toBe('verified-product-use');
  expect(passengerRouteUseDecision('2F', 'CNF', 'JDR', '2026-10-01', 'test-product', scoped)).toBe('local-sale-unverified');
});

test('strong schedule/operator evidence cannot bypass passenger-use verification', () => {
  const network = parseRouteNetworkCatalog({version:'2026.3', coverage:'curated-not-complete', sources:[{id:'fixture',url:'https://www.copaair.com/',checkedOn:'2026-10-01',note:'Fixture operator proof, not product or rights proof.'}], routes:[{carrier:'CM',pair:['GUA','SJO'],service:'nonstop',status:'published',carrierIdentity:'operating',flightNumbers:['CM392'],flightNumberSourceIds:['fixture'],sourceIds:['fixture']}],carrierUniverses:[]});
  const result = buildNextLegIndex({network,schedules:[],knownAirports,eligibleCarriers:new Set(['CM']),referenceDate:'2026-10-01',productId:'star-alliance-rtw-fare'});
  expect(result.get('GUA')).toBeUndefined();
});

test('additive live routes cannot resurrect an unverified passenger sector', () => {
  const live = LiveRouteResponseSchema.parse({version:1,origin:'GUA',source:{name:'air-routes.com current scheduled passenger routes',url:'https://air-routes.com/developers'},checkedAt:'2026-10-01T00:00:00Z',expiresAt:'2026-10-01T01:00:00Z',routes:[{from:'GUA',to:'SJO',status:'active',seasonalityLabel:null,sourceUrl:'https://air-routes.com/r/GUA-SJO',carriers:[{code:'CM',name:'Copa',days:['Thu'],seasonalNote:null}]}]});
  expect(mergeLiveNextLegDestinations([],live,new Set(['CM']),knownAirports,{referenceDate:'2026-10-01',productId:'star-alliance-rtw-fare'})).toEqual([]);
});

test('live merge preserves a qualified current option using its entity-scoped passenger rule', () => {
  const base = passengerRouteUseCatalog.entries.find(row => row.carrier === 'CM' && row.pair[0] === 'GUA')!;
  const fixture = PassengerRouteUseCatalogSchema.parse({ ...passengerRouteUseCatalog, entries: [
    { ...base, carrier: '2F', carrierEntityKey: 'BR+ACN+azul-conecta-ltda', pair: ['CNF', 'JDR'], localPassengerSale: 'permitted', products: [{ productId: 'test-product', status: 'verified', sourceIds: base.sourceIds, validFrom: '2026-10-01', validUntil: '2026-10-02' }] },
  ] });
  const option = {
    carrier: '2F', carrierEntityKey: 'BR+ACN+azul-conecta-ltda', from: 'CNF', to: 'JDR',
    flightNumbers: [], candidateFlightNumbers: [], scheduleStatus: 'unknown' as const,
    networkSources: [], schedules: [], flightNumberSources: [], routeFlightNumberSources: [], candidateFlightNumberSources: [],
    routeWindow: null,
  };
  expect(mergeLiveNextLegDestinations([{ iata: 'JDR', options: [option] }], null, new Set(['2F']), knownAirports, {
    referenceDate: '2026-10-01', productId: 'test-product', passengerUseCatalog: fixture,
  })).toEqual([{ iata: 'JDR', options: [option] }]);
});

test('shared exact flight numbers and manual entry cannot become an RTW ticketability claim', () => {
  const parsed = parseShareUrl('/r/v1/GUA-SJO?op=CM&p=AA&c=J&d=2026-10-01&fn=392&man=1&rtw=star-alliance-rtw-fare');
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw Error('Share fixture parse failed');
  const products = RtwRuleCatalogSchema.parse(read('public/data/rtw-products/current.json'));
  const product = products.products.find(row => row.id === 'star-alliance-rtw-fare')!;
  const airports = new Map(read('public/data/airports.json').map((row: { iata: string }) => [row.iata,row]));
  const result = validateRtwRoute(product,parsed.request.groups.flatMap(group => group.legs),{airports:airports as Parameters<typeof validateRtwRoute>[2]['airports'],allianceCatalog:AllianceCatalogSchema.parse(read('public/data/alliances/current.json'))});
  expect(result.valid).toBe(false);
  expect(result.findings).toEqual(expect.arrayContaining([expect.objectContaining({ruleId:'passenger-route-use',severity:'fail',affectedLegIndexes:[0]})]));
});

test('source and rights intervals reject unattested or inverted assertions', () => {
  const row = passengerRouteUseCatalog.entries[0]!;
  expect(PassengerRouteUseCatalogSchema.safeParse({...passengerRouteUseCatalog,entries:[{...row,sourceIds:['unknown-source']}]}).success).toBe(false);
  expect(PassengerRouteUseCatalogSchema.safeParse({...passengerRouteUseCatalog,entries:[{...row,rightsFrom:'2030-01-01',rightsUntil:'2029-01-01'}]}).success).toBe(false);
});
