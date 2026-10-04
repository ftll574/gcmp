import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { buildAirportIndex } from '../../../src/lib/airport-index.ts';
import { parseAirportCatalog } from '../../../src/lib/schemas/airports.ts';
import { parseRouteNetworkCatalog, RouteNetworkCatalogSchema } from '../../../src/lib/schemas/route-network.ts';
import {
  buildAirportEntityProfile,
  buildAirlineEntityProfile,
  buildRouteEntityProfile,
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
      expect.objectContaining({ carrier: '2F', carrierEntityKey: key, name: 'Azul Conecta Ltda.', identity: 'provider-listed', confirmedNumbers: [], candidateNumbers: [], registeredPlans: [] }),
    ]));
    expect(buildAirlineEntityProfile({ ...input, memberCodes: new Set([...memberCodes, '2F']) }, 'AD')?.routes.some(route => route.carriers.some(carrier => carrier.carrierEntityKey === key)) ?? false).toBe(false);
  });
});

 test('keeps registered plans separate from confirmed designators and operating identity', () => {
  const card=buildRouteEntityProfile(input,'YYZ-GIG')?.route.carriers.find(x=>x.carrier==='AC');
  const row=network.routes.find(x=>x.carrier==='AC'&&x.pair.join('-')==='YYZ-GIG')!;
  expect(card?.registeredPlans).toEqual(row.registeredPlans);expect(card?.registeredPlans.length).toBeGreaterThan(0);
  expect(card?.identity).toBe('provider-listed');expect(card?.confirmedNumbers).toEqual(row.flightNumbers??[]);
  const br=buildRouteEntityProfile(input,'TPE-NRT')?.route.carriers.find(x=>x.carrier==='BR');expect(br?.registeredPlans).toEqual([]);
 });
