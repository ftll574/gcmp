import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { buildAirportIndex } from '../../../src/lib/airport-index.ts';
import { parseAirportCatalog } from '../../../src/lib/schemas/airports.ts';
import { AllianceCatalogSchema } from '../../../src/lib/schemas/alliance.ts';
import { CountryContinentCatalogSchema } from '../../../src/lib/schemas/country-continent.ts';
import { parseRouteNetworkCatalog } from '../../../src/lib/schemas/route-network.ts';
import { buildRouteLibraryOverview } from '../../../src/lib/rtw/route-library-overview.ts';

const airports = parseAirportCatalog(JSON.parse(readFileSync('public/data/airports.json', 'utf8')));
const airportIndex = buildAirportIndex(airports).byIata;
const network = parseRouteNetworkCatalog(
  JSON.parse(readFileSync('public/data/route-network/runtime-current.json', 'utf8')),
  new Set(airportIndex.keys()),
);
const alliance = AllianceCatalogSchema.parse(JSON.parse(readFileSync('public/data/alliances/current.json', 'utf8')));
const geo = CountryContinentCatalogSchema.parse(JSON.parse(readFileSync('public/data/geo/current.json', 'utf8')));
const memberCodes = new Set(alliance.memberships.filter((row) => row.status === 'member').map((row) => row.airline));
const carrierNames = new Map(alliance.memberships.map((row) => [row.airline, row.airlineName] as const));
const countryContinents = new Map(geo.mappings.map((row) => [row.country, row.continent] as const));
const airportOverrides = new Map(geo.airportOverrides.map((row) => [row.iata, row.continent] as const));

describe('route library overview model', () => {
  test('summarizes the current three-alliance runtime without losing identity distinctions', () => {
    const model = buildRouteLibraryOverview({
      network,
      memberCodes,
      airports: airportIndex,
      carrierNames,
      countryContinents,
      airportContinentOverrides: airportOverrides,
    });
    expect(model.routeCount).toBe(29_494);
    expect(model.carrierCount).toBe(60);
    expect(model.operatingCount).toBe(17_744);
    expect(model.providerListedCount).toBe(11_750);
    expect(model.confirmedNumberCount).toBe(14_977);
    expect(model.candidateOnlyCount).toBe(14_517);
    expect(model.airportCount).toBeGreaterThan(1_000);
    expect(model.topCarriers).toHaveLength(10);
    expect(model.topHubs).toHaveLength(10);
    expect(model.representativeRoutes).toHaveLength(180);
    expect(model.continents.some((row) => row.continent === 'asia')).toBe(true);
    expect(model.continents.reduce((sum, row) => sum + row.routes, 0)).toBe(model.routeCount);
  });
});
