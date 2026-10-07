import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { buildAirportIndex } from '../../../src/lib/airport-index.ts';
import { parseAirportCatalog } from '../../../src/lib/schemas/airports.ts';
import { LandingShowcaseCatalogSchema } from '../../../src/lib/schemas/landing-showcase.ts';
import { parseRouteNetworkCatalog, RouteNetworkCatalogSchema } from '../../../src/lib/schemas/route-network.ts';
import {
  buildAirportEntityProfile,
  buildAirlineEntityProfile,
  buildLandingShowcaseFingerprint,
  buildRouteEntityProfile,
  searchLandingShowcaseEntities,
  searchRouteLibraryEntities,
} from '../../../src/lib/rtw/route-library-entities.ts';

const PUBLIC = join(process.cwd(), 'public');
const airports = parseAirportCatalog(JSON.parse(readFileSync(join(PUBLIC, 'data/airports.json'), 'utf8')));
const airportIndex = buildAirportIndex(airports);
const network = parseRouteNetworkCatalog(
  JSON.parse(readFileSync(join(PUBLIC, 'data/route-network/runtime-current.json'), 'utf8')),
  new Set(airportIndex.byIata.keys()),
);
const alliances = JSON.parse(readFileSync(join(PUBLIC, 'data/alliances/current.json'), 'utf8')) as {
  memberships: Array<{ airline: string; airlineName: string; status: string }>;
};
const carrierNames = new Map(alliances.memberships.filter((row) => row.status === 'member').map((row) => [row.airline, row.airlineName] as const));
const memberCodes = new Set(carrierNames.keys());
const input = { network, airports: airportIndex.byIata, carrierNames, memberCodes };

describe('entity-first route library model', () => {
  test('builds the lightweight map preview only from runtime-matched showcase legs, without promoting candidate evidence', () => {
    const showcase = LandingShowcaseCatalogSchema.parse(JSON.parse(readFileSync(join(PUBLIC, 'data/site/landing-showcases.json'), 'utf8')));
    const fingerprint = buildLandingShowcaseFingerprint(showcase, airportIndex.byIata, memberCodes);
    const catalogLegs = showcase.showcases.flatMap(row => row.legs);
    expect(fingerprint.routes.length).toBeGreaterThan(0);
    expect(fingerprint.routes.length).toBeLessThan(network.routes.length);
    for (const route of fingerprint.routes) for (const carrier of route.carriers) {
      expect(carrier.confirmedNumbers).toEqual([]);
      expect(carrier.sources).toEqual([]);
      for (const flightNumber of carrier.candidateNumbers) {
        expect(catalogLegs).toContainEqual(expect.objectContaining({
          from: route.from.iata, to: route.to.iata, carrier: carrier.carrier,
          carrierName: carrier.name, flightNumber, flightNumberStatus: 'candidate',
        }));
      }
    }
  });

  test('airport counts and route cards distinguish qualified entities sharing one IATA code', () => {
    const sharedNetwork = RouteNetworkCatalogSchema.parse({
      version: '2026.3', coverage: 'curated-not-complete',
      sources: [{ id: 'one', url: 'https://example.com/one', checkedOn: '2026-10-04', note: 'Fixture.' }, { id: 'two', url: 'https://example.com/two', checkedOn: '2026-10-04', note: 'Fixture.' }],
      carrierUniverses: [], routes: [
        { carrier: '2F', carrierEntityKey: 'BR+ACN+azul-conecta-ltda', carrierEntityName: 'Azul Conecta Ltda.', pair: ['TPE', 'NRT'], service: 'nonstop', status: 'published', sourceIds: ['one'] },
        { carrier: '2F', carrierEntityKey: 'BR+XYZ+other-airline', carrierEntityName: 'Other Airline S.A.', pair: ['TPE', 'NRT'], service: 'nonstop', status: 'published', sourceIds: ['two'] },
      ],
    });
    const model = { ...input, network: sharedNetwork, memberCodes: new Set(['2F']) };
    const profile = buildAirportEntityProfile(model, 'TPE')!;
    expect(profile.airlineCount).toBe(2);
    expect(profile.outgoingRoutes[0]?.carriers.map(carrier => carrier.name)).toEqual(['Azul Conecta Ltda.', 'Other Airline S.A.']);
    expect(buildAirlineEntityProfile(model, '2F')).toBeNull();
    expect(buildAirlineEntityProfile(model, 'BR+ACN+azul-conecta-ltda')?.routes).toHaveLength(1);
  });

  test('builds an airport page with TPE destinations, airlines and countries', () => {
    const profile = buildAirportEntityProfile(input, 'TPE');
    expect(profile).not.toBeNull();
    expect(profile!.destinationCount).toBeGreaterThan(60);
    expect(profile!.airlineCount).toBeGreaterThan(10);
    expect(profile!.countryCount).toBeGreaterThan(10);
    expect(profile!.outgoingRoutes.some((route) => route.to.iata === 'NRT')).toBe(true);
  });

  test('builds BR airline and TPE-NRT route pages from the same evidence graph', () => {
    const airline = buildAirlineEntityProfile(input, 'BR');
    expect(airline?.routes.length).toBeGreaterThan(100);
    expect(airline?.topHubs[0]?.airport.iata).toBe('TPE');

    const route = buildRouteEntityProfile(input, 'TPE-NRT');
    expect(route?.route.carriers.map((carrier) => carrier.carrier)).toEqual(expect.arrayContaining(['BR', 'CI', 'CX', 'JL']));
    expect(route?.route.carriers.find((carrier) => carrier.carrier === 'BR')?.candidateNumbers).toContain('BR198');
  });

  test('keeps route source attribution attached to the correct carrier', () => {
    const route = buildRouteEntityProfile(input, 'TPE-NRT');
    const br = route?.route.carriers.find((carrier) => carrier.carrier === 'BR');
    const row = network.routes.find((entry) => entry.carrier === 'BR'
      && entry.pair[0] === 'TPE'
      && entry.pair[1] === 'NRT'
      && entry.status === 'published');
    expect(row).toBeDefined();
    const expectedIds = new Set([
      ...row!.sourceIds,
      ...(row!.flightNumberSourceIds ?? []),
      ...(row!.flightNumberCandidateSourceIds ?? []),
    ]);
    expect(new Set(br?.sources.map((source) => source.id))).toEqual(expectedIds);
  });

  test('searches airports, airlines, routes and exact flight designators', () => {
    expect(searchRouteLibraryEntities({ ...input, query: 'TPE' })[0]?.selection).toEqual({ kind: 'airport', id: 'TPE' });
    expect(searchRouteLibraryEntities({ ...input, query: 'BR' })[0]?.selection).toEqual({ kind: 'airline', id: 'BR' });
    expect(searchRouteLibraryEntities({ ...input, query: 'EVA Air' }).some((result) => result.selection.kind === 'airline' && result.selection.id === 'BR')).toBe(true);
    expect(searchRouteLibraryEntities({ ...input, query: 'TPE-NRT' }).some((result) => result.selection.kind === 'route' && result.selection.id === 'TPE-NRT')).toBe(true);
    expect(searchRouteLibraryEntities({ ...input, query: 'BR198' }).some((result) => result.kind === 'flight' && result.selection.id === 'TPE-NRT')).toBe(true);
  });
  test('searches flight-number prefixes and keeps preview designators explicitly candidate-only', () => {
    const showcase = LandingShowcaseCatalogSchema.parse(JSON.parse(readFileSync(join(PUBLIC, 'data/site/landing-showcases.json'), 'utf8')));
    const partial = searchLandingShowcaseEntities(showcase, airportIndex.byIata, 'BR1', memberCodes, 'zh-TW');
    const complete = searchRouteLibraryEntities({ ...input, query: 'BR1', locale: 'zh-TW' });

    expect(partial).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'flight', title: 'BR184 · TPE → NRT', subtitle: expect.stringContaining('尚未確認') }),
    ]));
    expect(searchLandingShowcaseEntities(showcase, airportIndex.byIata, 'BR198', memberCodes, 'zh-TW')).toEqual([]);
    expect(complete.length).toBeGreaterThan(partial.length);
    expect(complete).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'flight', title: 'BR1 · LAX → TPE', subtitle: 'EVA Air · 候選班號' }),
    ]));
  });
  test('qualified airline entities are searchable by legal name and canonical key', () => {
    const sharedNetwork = RouteNetworkCatalogSchema.parse({
      version: '2026.3', coverage: 'curated-not-complete',
      sources: [{ id: 'one', url: 'https://example.com/one', checkedOn: '2026-10-04', note: 'Fixture.' }], carrierUniverses: [],
      routes: [{ carrier: '2F', carrierEntityKey: 'BR+ACN+azul-conecta-ltda', carrierEntityName: 'Azul Conecta Ltda.', pair: ['TPE', 'NRT'], service: 'nonstop', status: 'published', sourceIds: ['one'] }],
    });
    const model = { ...input, network: sharedNetwork, memberCodes: new Set(['2F']) };
    expect(searchRouteLibraryEntities({ ...model, query: 'Azul Conecta' }).some(row => row.selection.id === 'BR+ACN+azul-conecta-ltda')).toBe(true);
    expect(searchRouteLibraryEntities({ ...model, query: 'BR+ACN+azul-conecta-ltda' }).some(row => row.selection.id === 'BR+ACN+azul-conecta-ltda')).toBe(true);
  });
  test('real route-only ACN identity searches and opens its isolated non-member shard profile', () => {
    const key = 'BR+ACN+azul-conecta-ltda';
    const result = searchRouteLibraryEntities({ ...input, query: 'Azul Conecta' }).find(row => row.selection.kind === 'airline' && row.selection.id === key);
    expect(result).toMatchObject({ title: '2F · Azul Conecta Ltda.', subtitle: 'IATA 2F · ICAO ACN · BR' });
    const selected = buildAirlineEntityProfile({ ...input, memberCodes: new Set([...memberCodes, '2F']) }, key);
    expect(selected).toMatchObject({ carrier: '2F', carrierEntityKey: key, name: 'Azul Conecta Ltda.', airportCount: 3, operatingRouteCount: 0, confirmedRouteCount: 0 });
    expect(selected!.routes.map(route => `${route.from.iata}-${route.to.iata}`).sort()).toEqual(['CNF-DTI', 'CNF-JDR', 'DTI-CNF', 'JDR-CNF']);
    expect(selected!.routes.flatMap(route => route.carriers)).toEqual(expect.arrayContaining([
      expect.objectContaining({ carrier: '2F', carrierEntityKey: key, name: 'Azul Conecta Ltda.', identity: 'provider-listed', confirmedNumbers: [], candidateNumbers: [], registeredPlans: expect.any(Array) }),
    ]));
    const routeModel = { ...input, memberCodes: new Set([...memberCodes, selected!.carrier]) };
    for (const routeId of ['CNF-DTI', 'CNF-JDR', 'DTI-CNF', 'JDR-CNF']) {
      expect(buildRouteEntityProfile(routeModel, routeId)?.route.carriers).toEqual(expect.arrayContaining([
        expect.objectContaining({ carrier: '2F', carrierEntityKey: key, identity: 'provider-listed', confirmedNumbers: [] }),
      ]));
    }
    expect(buildAirlineEntityProfile({ ...input, memberCodes: new Set([...memberCodes, '2F']) }, 'AD')?.routes.some(route => route.carriers.some(carrier => carrier.carrierEntityKey === key)) ?? false).toBe(false);
  });
});

 test('keeps registered plans separate from confirmed designators and operating identity', () => {
  const card=buildRouteEntityProfile(input,'YYZ-GIG')?.route.carriers.find(x=>x.carrier==='AC');
  const row=network.routes.find(x=>x.carrier==='AC'&&x.pair.join('-')==='YYZ-GIG')!;
  expect(card?.registeredPlans).toEqual(row.registeredPlans);expect(card?.registeredPlans.length).toBeGreaterThan(0);
  expect(card?.identity).toBe('provider-listed');expect(card?.confirmedNumbers).toEqual([]);expect(card?.referenceNumbers).toEqual(row.flightNumbers??[]);
  const br=buildRouteEntityProfile(input,'TPE-NRT')?.route.carriers.find(x=>x.carrier==='BR');expect(br?.registeredPlans).toEqual([]);
 });

 test('labels a provider-listed Avinor number as an unverified reference in search results', () => {
  const result = searchRouteLibraryEntities({ ...input, query: 'A3757' }).find(row => row.kind === 'flight' && row.title === 'A3757 · OSL → ATH');
  expect(result?.subtitle).toContain('Flight-number reference (operator not verified)');
 });

 test('makes the new 4Y EVE–FRA schedule identity searchable and visible as a dated endpoint pair', () => {
  const model = { ...input, memberCodes: new Set([...memberCodes, '4Y']) };
  const airlineSearch = searchRouteLibraryEntities({ ...model, query: '4Y' });
  expect(airlineSearch).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: 'airline', title: '4Y · 4Y', selection: { kind: 'airline', id: '4Y' } }),
  ]));
  const route = buildRouteEntityProfile(model, 'EVE-FRA')?.route;
  const carrier = route?.carriers.find((row) => row.carrier === '4Y');
  expect(carrier).toMatchObject({
    identity: 'provider-listed', scheduledEndpointPair: true,
    referenceNumbers: expect.arrayContaining(['4Y1301']),
  });
  expect(carrier?.datedFlightNumbers[0]?.occurrenceDetails).toEqual(expect.arrayContaining([
    expect.objectContaining({
      candidateKey: '4Y|4Y|EVE>FRA|4Y1301', sourceId: 'avinor-xml-public-batch-eve-20261006',
      sourceAirport: 'EVE', arrDepRaw: 'D', expiresAtUTC: '2026-10-11T13:00:00Z',
      carrierEntityNameMapping: 'not-present-in-curated-registry', oldCandidateWindowConflict: false,
    }),
  ]));
 });

 test('removes a schedule-only route from the current route/map model after every occurrence expires', () => {
  const model = { ...input, memberCodes: new Set([...memberCodes, '4Y']), evidenceNow: Date.parse('2026-10-11T13:00:00Z') };
  expect(buildRouteEntityProfile(model, 'EVE-FRA')?.route.carriers.some((row) => row.carrier === '4Y') ?? false).toBe(false);
  expect(searchRouteLibraryEntities({ ...model, query: '4Y1301' }).some((row) => row.title === '4Y1301 · EVE → FRA')).toBe(false);
 });
