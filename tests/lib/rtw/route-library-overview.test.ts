import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { buildAirportIndex } from '../../../src/lib/airport-index.ts';
import { parseAirportCatalog } from '../../../src/lib/schemas/airports.ts';
import { AllianceCatalogSchema } from '../../../src/lib/schemas/alliance.ts';
import { CountryContinentCatalogSchema } from '../../../src/lib/schemas/country-continent.ts';
import { parseRouteNetworkCatalog } from '../../../src/lib/schemas/route-network.ts';
import { buildRouteLibraryOverview } from '../../../src/lib/rtw/route-library-overview.ts';
import { buildRouteLibraryFingerprint } from '../../../src/lib/rtw/route-library-entities.ts';

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
    expect(model.routeCount).toBe(30_081);
    expect(model.carrierCount).toBe(60);
    expect(model.operatingCount).toBe(17_744);
    expect(model.providerListedCount).toBe(12_337);
    expect(model.confirmedNumberCount).toBe(14_977);
    expect(model.candidateOnlyCount).toBe(15_104);
    expect(model.airportCount).toBeGreaterThan(1_000);
    expect(model.hubs).toHaveLength(model.airportCount);
    expect(model.topCarriers).toHaveLength(10);
    expect(model.topHubs).toHaveLength(10);
    expect(model.representativeRoutes).toHaveLength(180);
    expect(model.continents.some((row) => row.continent === 'asia')).toBe(true);
    expect(model.continents.reduce((sum, row) => sum + row.routes, 0)).toBe(model.routeCount);
  });

  test('three alliances produce distinct bounded network fingerprints', () => {
    const fingerprintFor = (allianceId: 'star' | 'oneworld' | 'skyteam') => {
      const codes = new Set(alliance.memberships
        .filter((row) => row.status === 'member' && row.alliance === allianceId)
        .map((row) => row.airline));
      return buildRouteLibraryFingerprint({ network, airports: airportIndex, carrierNames, memberCodes: codes }, 120);
    };
    const star = fingerprintFor('star');
    const oneworld = fingerprintFor('oneworld');
    const skyteam = fingerprintFor('skyteam');
    expect(star.routes).toHaveLength(120);
    expect(oneworld.routes).toHaveLength(120);
    expect(skyteam.routes).toHaveLength(120);
    expect(star.hubs.length).toBeGreaterThan(500);
    expect(oneworld.hubs.length).toBeGreaterThan(500);
    expect(skyteam.hubs.length).toBeGreaterThan(500);
    const hubKey = (model: ReturnType<typeof fingerprintFor>) => model.coreHubs.slice(0, 8).map((hub) => hub.airport.iata).join(',');
    expect(new Set([hubKey(star), hubKey(oneworld), hubKey(skyteam)]).size).toBe(3);
    const routeKey = (model: ReturnType<typeof fingerprintFor>) => new Set(model.routes.map((route) => [route.from.iata, route.to.iata].sort().join('-')));
    const starRoutes = routeKey(star);
    const oneworldRoutes = routeKey(oneworld);
    const skyteamRoutes = routeKey(skyteam);
    const overlap = (a: Set<string>, b: Set<string>) => [...a].filter((route) => b.has(route)).length;
    expect(overlap(starRoutes, oneworldRoutes)).toBeLessThan(80);
    expect(overlap(starRoutes, skyteamRoutes)).toBeLessThan(80);
    expect(overlap(oneworldRoutes, skyteamRoutes)).toBeLessThan(80);
  });
});
