import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { buildAirportIndex } from '../../../src/lib/airport-index.ts';
import { parseAirportCatalog } from '../../../src/lib/schemas/airports.ts';
import { parseRouteNetworkCatalog } from '../../../src/lib/schemas/route-network.ts';
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
    expect(route?.route.carriers.find((carrier) => carrier.carrier === 'BR')?.confirmedNumbers).toContain('BR198');
  });

  test('searches airports, airlines, routes and exact flight designators', () => {
    expect(searchRouteLibraryEntities({ ...input, query: 'TPE' })[0]?.selection).toEqual({ kind: 'airport', id: 'TPE' });
    expect(searchRouteLibraryEntities({ ...input, query: 'BR' })[0]?.selection).toEqual({ kind: 'airline', id: 'BR' });
    expect(searchRouteLibraryEntities({ ...input, query: 'EVA Air' }).some((result) => result.selection.kind === 'airline' && result.selection.id === 'BR')).toBe(true);
    expect(searchRouteLibraryEntities({ ...input, query: 'TPE-NRT' }).some((result) => result.selection.kind === 'route' && result.selection.id === 'TPE-NRT')).toBe(true);
    expect(searchRouteLibraryEntities({ ...input, query: 'BR198' }).some((result) => result.kind === 'flight' && result.selection.id === 'TPE-NRT')).toBe(true);
  });
});
