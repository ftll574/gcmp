import { expect, test } from 'vitest';
import { mergeRouteNetworkCatalogs, mergeRouteNumberEvidence, applyRouteNumberQuarantines, enforceObservedNumberOperatingGate, preserveRuntimeRoutesThenQuarantine } from '../../../src/lib/rtw/route-network-merge.ts';
import { RouteNetworkCatalogSchema } from '../../../src/lib/schemas/route-network.ts';
import { carrierRouteKey } from '../../../src/lib/carrier-identity.ts';

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
      flightNumbers: ['AA102'],
      flightNumberCandidates: ['AA100', 'AA101'],
      sourceIds: ['curated'],
      flightNumberSourceIds: ['curated'],
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


test('missing higher identity preserves a provider-only limitation with its source', () => {
  const catalog = (id: string, identity?: 'operating' | 'provider-listed' | 'unknown') => RouteNetworkCatalogSchema.parse({
    version: '2026.3', coverage: 'curated-not-complete', sources: [source(id)], routes: [{
      carrier: 'AA', pair: ['DFW', 'LAX'], service: 'nonstop', status: 'published',
      sourceIds: [id], ...(identity ? { carrierIdentity: identity } : {}),
    }],
  });
  for (const identity of [undefined, 'unknown'] as const) {
    expect(mergeRouteNetworkCatalogs(catalog('higher', identity), catalog('listed', 'provider-listed')).routes[0])
      .toMatchObject({ carrierIdentity: 'provider-listed', sourceIds: ['higher', 'listed'] });
    expect(mergeRouteNetworkCatalogs(catalog('higher', identity), catalog('old-operating', 'operating')).routes[0])
      .toMatchObject({ carrierIdentity: 'unknown', sourceIds: ['higher'] });
  }
  const suspended = catalog('higher');
  suspended.routes[0]!.status = 'suspended';
  expect(mergeRouteNetworkCatalogs(suspended, catalog('listed', 'provider-listed')).routes[0]?.status).toBe('suspended');
});

test('number-only overlays cannot promote unknown route identity', () => {
  const base = RouteNetworkCatalogSchema.parse({
    version: '2026.3', coverage: 'curated-not-complete', sources: [source('base')], routes: [{
      carrier: 'AA', pair: ['DFW', 'LAX'], service: 'nonstop', status: 'published', sourceIds: ['base'],
    }],
  });
  const numbers = RouteNetworkCatalogSchema.parse({
    version: '2026.3', coverage: 'curated-not-complete', sources: [source('numbers')], routes: [{
      carrier: 'AA', pair: ['DFW', 'LAX'], service: 'nonstop', status: 'published', sourceIds: ['numbers'],
      carrierIdentity: 'operating', flightNumbers: ['AA100'], flightNumberSourceIds: ['numbers'],
    }],
  });
  expect(mergeRouteNumberEvidence(base, numbers).routes[0]?.carrierIdentity).toBeUndefined();
});

test('operator corroboration promotes only official exact numbers, keeping provider overlays candidates', () => {
 const base = { version: '2026.3', coverage: 'curated-not-complete', carrierUniverses: [] };
 const official = RouteNetworkCatalogSchema.parse({ ...base, sources: [source('official')], routes: [{ carrier: 'SQ', pair: ['SIN','RUH'], service: 'nonstop', status: 'published', carrierIdentity: 'operating', flightNumbers: ['SQ498'], flightNumberSourceIds: ['official'], sourceIds: ['official'] }] });
 const provider = RouteNetworkCatalogSchema.parse({ ...base, sources: [source('provider')], routes: [{ carrier: 'SQ', pair: ['SIN','RUH'], service: 'nonstop', status: 'published', carrierIdentity: 'provider-listed', flightNumbers: ['SQ456'], flightNumberSourceIds: ['provider'], sourceIds: ['provider'] }] });
 const merged = mergeRouteNetworkCatalogs(official, provider);
 expect(merged.routes[0]?.flightNumbers).toEqual(['SQ498']);
 expect(merged.routes[0]?.flightNumberCandidates).toEqual(['SQ456']);
 expect(mergeRouteNumberEvidence(merged, provider).routes[0]?.flightNumbers).toEqual(['SQ498']);
});


test('current airport conflicts quarantine numbers after overlay, preserving non-overlapping history', () => {
 const graph = RouteNetworkCatalogSchema.parse({ version: '2026.3', coverage: 'curated-not-complete', sources: [source('provider')], routes: [
 { carrier: 'OZ', pair: ['ICN','KIX'], service: 'nonstop', status: 'published', carrierIdentity: 'provider-listed', flightNumbers: ['OZ112','OZ1163'], flightNumberSourceIds: ['provider'], sourceIds: ['provider'] },
 { carrier: 'OZ', pair: ['ICN','UKB'], service: 'nonstop', status: 'published', carrierIdentity: 'provider-listed', flightNumberCandidates: ['OZ1163'], flightNumberCandidateSourceIds: ['provider'], sourceIds: ['provider'] },
 ] });
 const rule = { version: 1, sources: [source('official')], entries: [{ carrier: 'OZ', pair: ['ICN','KIX'], flightNumber: 'OZ1163', effectiveFrom: '2026-09-01', effectiveUntil: '2027-03-27', sourceIds: ['official'], reason: 'Official exact airport conflict.' }] };
 const corrected = applyRouteNumberQuarantines(mergeRouteNumberEvidence(graph, graph), rule);
 expect(corrected.routes[0]?.flightNumbers).toEqual(['OZ112']);
 expect(corrected.routes[1]?.flightNumberCandidates).toEqual(['OZ1163']);
 expect(graph.routes[0]?.flightNumbers).toContain('OZ1163');
 const historical = { ...graph, routes: [{ ...graph.routes[0]!, effectiveUntil: '2026-08-31' }] };
 expect(applyRouteNumberQuarantines(historical, rule).routes[0]?.flightNumbers).toContain('OZ1163');
 expect(() => applyRouteNumberQuarantines(graph, { ...rule, entries: [{ ...rule.entries[0], sourceIds: ['missing'] }] })).toThrow('Invalid');
});

test('accepted preservation is applied before quarantine and cannot restore a quarantined number', () => {
 const base = RouteNetworkCatalogSchema.parse({ version: '2026.3', coverage: 'curated-not-complete', sources: [source('base')], routes: [
  { carrier: 'OZ', pair: ['ICN','KIX'], service: 'nonstop', status: 'published', carrierIdentity: 'provider-listed', flightNumbers: ['OZ112'], flightNumberSourceIds: ['base'], sourceIds: ['base'] },
 ] });
 const preservation = RouteNetworkCatalogSchema.parse({ version: '2026.3', coverage: 'curated-not-complete', sources: [source('accepted')], routes: [
  { carrier: 'OZ', pair: ['ICN','KIX'], service: 'nonstop', status: 'published', carrierIdentity: 'provider-listed', flightNumbers: ['OZ112','OZ1163'], flightNumberSourceIds: ['accepted'], sourceIds: ['accepted'] },
 ] });
 const quarantine = { version: 1, sources: [source('official')], entries: [{ carrier: 'OZ', pair: ['ICN','KIX'], flightNumber: 'OZ1163', effectiveFrom: '2026-09-01', effectiveUntil: '2027-03-27', sourceIds: ['official'], reason: 'Official airport conflict.' }] };
 const composed = preserveRuntimeRoutesThenQuarantine(base, preservation, quarantine);
 expect(composed.routes[0]).toMatchObject({ flightNumbers: ['OZ112'], sourceIds: ['accepted','official'] });
 expect(composed.sources.map((item) => item.id)).toEqual(['accepted','base','official']);
});


test('a number overlay clears an exhausted candidate tier without promoting route identity', () => {
 const base = { version: '2026.3', coverage: 'curated-not-complete' };
 const graph = RouteNetworkCatalogSchema.parse({ ...base, sources: [source('listed')], routes: [{ carrier: 'UL', pair: ['CMB','GAN'], service: 'nonstop', status: 'published', carrierIdentity: 'provider-listed', sourceIds: ['listed'], flightNumberCandidates: ['UL119'], flightNumberCandidateSourceIds: ['listed'] }] });
 const numbers = RouteNetworkCatalogSchema.parse({ ...base, sources: [source('numbers')], routes: [{ carrier: 'UL', pair: ['CMB','GAN'], service: 'nonstop', status: 'published', sourceIds: ['numbers'], flightNumbers: ['UL119'], flightNumberSourceIds: ['numbers'] }] });
 const row = mergeRouteNumberEvidence(graph, numbers).routes[0];
 expect(row?.carrierIdentity).toBe('provider-listed');
 expect(row?.flightNumbers).toEqual(['UL119']);
 expect(row?.flightNumberCandidates).toBeUndefined();
 expect(row?.flightNumberCandidateSourceIds).toBeUndefined();
});


test('cached observational confirmations are demoted without inventing operating proof, while explicit exceptions survive',()=>{
 const recent='flight-numbers-adsbiq-recent-20260908';const flights='flightsfrom-pdx-yvr-20260909';
 const catalog=RouteNetworkCatalogSchema.parse({version:'2026.3',coverage:'curated-not-complete',sources:[source(recent),{...source(flights),note:'GCMP already had independent operating-carrier evidence for the route.'},source('official')],routes:[
  {carrier:'UA',pair:['PDX','YVR'],service:'nonstop',status:'published',carrierIdentity:'provider-listed',sourceIds:[recent],flightNumbers:['UA8224'],flightNumberSourceIds:[recent],flightNumberCandidates:['UA8220'],flightNumberCandidateSourceIds:[recent]},
  {carrier:'UA',pair:['PDX','YYC'],service:'nonstop',status:'published',sourceIds:[flights],flightNumbers:['UA8294'],flightNumberSourceIds:[flights]},
  {carrier:'UA',pair:['PDX','DEN'],service:'nonstop',status:'published',carrierIdentity:'operating',sourceIds:[recent],flightNumbers:['UA100'],flightNumberSourceIds:[recent]},
  {carrier:'UA',pair:['PDX','ORD'],service:'nonstop',status:'published',carrierIdentity:'provider-listed',sourceIds:['official'],flightNumbers:['UA200'],flightNumberSourceIds:['official']},
  {carrier:'UA',pair:['PDX','IAD'],service:'nonstop',status:'published',carrierIdentity:'provider-listed',sourceIds:['official',recent],flightNumbers:['UA300'],flightNumberSourceIds:['official',recent]},
 ]});
 const fixed=enforceObservedNumberOperatingGate(catalog);expect(fixed.routes[0]).toMatchObject({carrierIdentity:'provider-listed',flightNumberCandidates:['UA8220','UA8224'],flightNumberCandidateSourceIds:[recent]});expect(fixed.routes[0]?.flightNumbers).toBeUndefined();expect(fixed.routes[1]?.flightNumbers).toBeUndefined();expect(fixed.routes[1]?.flightNumberCandidates).toEqual(['UA8294']);
 for(const i of [2,3,4])expect(fixed.routes[i]).toEqual(catalog.routes[i]);expect(enforceObservedNumberOperatingGate(fixed)).toEqual(fixed);expect(catalog.routes[0]?.flightNumbers).toEqual(['UA8224']);
});

test('shared IATA entities retain distinct route and plan identities while legacy keys stay byte-for-byte stable', () => {
 const sourceA=source('azul-conecta'), sourceB=source('other-2f');
 const acnKey='BR+ACN+azul-conecta-ltda';
 const left=RouteNetworkCatalogSchema.parse({version:'2026.3',coverage:'curated-not-complete',sources:[sourceA],carrierUniverses:[],routes:[{carrier:'2F',carrierEntityKey:acnKey,carrierEntityName:'Azul Conecta Ltda.',pair:['CNF','JDR'],service:'nonstop',status:'published',sourceIds:[sourceA.id],registeredPlans:[{registrationId:'ACN-1',registeredOperator:'2F',registeredOperatorICAO:'ACN',carrierEntityKey:acnKey,flightNumberRaw:'5196',effectiveFrom:'2026-10-04',effectiveUntil:'2026-10-04',weekdays:[7],departureUTC:'12:30',arrivalUTC:'13:20',arrivalDayOffset:null,confidence:'high-confidence-schema-inference',sourceId:sourceA.id}]}]});
 const right=RouteNetworkCatalogSchema.parse({version:'2026.3',coverage:'curated-not-complete',sources:[sourceB],carrierUniverses:[],routes:[{carrier:'2F',carrierEntityKey:'BR+XYZ+other-airline',carrierEntityName:'Other Airline S.A.',pair:['CNF','JDR'],service:'nonstop',status:'published',sourceIds:[sourceB.id]}]});
 const merged=mergeRouteNetworkCatalogs(left,right);
 expect(merged.routes).toHaveLength(2);
 expect(merged.routes.map(row=>carrierRouteKey(row,...row.pair)).sort()).toEqual(['BR+ACN+azul-conecta-ltda:CNF-JDR','BR+XYZ+other-airline:CNF-JDR']);
 expect(JSON.stringify(carrierRouteKey({carrier:'AD'},'CNF','JDR'))).toBe('"AD:CNF-JDR"');
 expect(merged.routes.find(row=>row.carrierEntityKey===acnKey)?.registeredPlans?.[0]?.registeredOperatorICAO).toBe('ACN');
 const wrongPlan={...left.routes[0]!,registeredPlans:[{...left.routes[0]!.registeredPlans![0]!,registeredOperatorICAO:'XYZ',carrierEntityKey:'BR+XYZ+other-airline'}]};
 expect(()=>RouteNetworkCatalogSchema.parse({...left,routes:[wrongPlan]})).toThrow();
});

test('a shared IATA code rejects any unqualified route identity', () => {
 expect(()=>RouteNetworkCatalogSchema.parse({version:'2026.3',coverage:'curated-not-complete',sources:[source('one')],carrierUniverses:[],routes:[
  {carrier:'2F',pair:['CNF','JDR'],service:'nonstop',status:'published',sourceIds:['one']},
 ]})).toThrow('Shared IATA code 2F');
 expect(()=>RouteNetworkCatalogSchema.parse({version:'2026.3',coverage:'curated-not-complete',sources:[source('one'),source('two')],carrierUniverses:[],routes:[
  {carrier:'2F',pair:['CNF','JDR'],service:'nonstop',status:'published',sourceIds:['one']},
  {carrier:'2F',carrierEntityKey:'BR+ACN+azul-conecta-ltda',carrierEntityName:'Azul Conecta Ltda.',pair:['CNF','DTI'],service:'nonstop',status:'published',sourceIds:['two']},
 ]})).toThrow('Ambiguous shared carrier code 2F');
});
