import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { AirportBrowseRegionCatalogSchema } from '../../../src/lib/schemas/airport-browse-region.ts';
import { parseAirportCatalog } from '../../../src/lib/schemas/airports.ts';
import { parseRouteNetworkCatalog } from '../../../src/lib/schemas/route-network.ts';

const airports = parseAirportCatalog(JSON.parse(readFileSync('public/data/airports.json', 'utf8')));
const airportByIata = new Map(airports.map((airport) => [airport.iata, airport] as const));
const runtime = parseRouteNetworkCatalog(
  JSON.parse(readFileSync('public/data/route-network/runtime-current.json', 'utf8')),
  new Set(airportByIata.keys()),
);
const catalog = AirportBrowseRegionCatalogSchema.parse(
  JSON.parse(readFileSync('public/data/geo/airport-browse-regions.json', 'utf8')),
);
const byIata = new Map(catalog.airports.map((airport) => [airport.iata, airport] as const));

describe('airport browse region overlay', () => {
  test('pins a browse-only, source-backed overlay for the three first large countries', () => {
    expect(catalog.convention).toBe('ourairports-iso-region-browse-overlay');
    expect(catalog.regions).toHaveLength(19);
    expect(catalog.airports).toHaveLength(460);
    expect(catalog.note).toMatch(/Browse-only/i);
    expect(catalog.sourceUrls).toContain('https://davidmegginson.github.io/ourairports-data/airports.csv');
  });

  test('covers every current published runtime endpoint in US, Canada and Australia', () => {
    const required = new Set<string>();
    for (const route of runtime.routes) {
      if (route.status !== 'published') continue;
      for (const iata of route.pair) {
        const airport = airportByIata.get(iata);
        if (airport && ['US', 'CA', 'AU'].includes(airport.country)) required.add(iata);
      }
    }
    expect(required.size).toBe(460);
    expect([...required].filter((iata) => !byIata.has(iata))).toEqual([]);
  });

  test('uses subdivision-backed regions for representative US, Canadian and Australian airports', () => {
    const expected: Readonly<Record<string, [string, string]>> = {
      LAX: ['US-CA', 'us-west'], JFK: ['US-NY', 'us-northeast'],
      ORD: ['US-IL', 'us-midwest'], DFW: ['US-TX', 'us-south'],
      ANC: ['US-AK', 'us-alaska'], HNL: ['US-HI', 'us-hawaii'],
      YVR: ['CA-BC', 'canada-pacific'], YYC: ['CA-AB', 'canada-prairies'],
      YYZ: ['CA-ON', 'canada-central'], YHZ: ['CA-NS', 'canada-atlantic'],
      YZF: ['CA-NT', 'canada-north'],
      SYD: ['AU-NSW', 'australia-new-south-wales'], MEL: ['AU-VIC', 'australia-victoria'],
      BNE: ['AU-QLD', 'australia-queensland'], PER: ['AU-WA', 'australia-western-australia'],
      ADL: ['AU-SA', 'australia-south-australia'], HBA: ['AU-TAS', 'australia-tasmania'],
      DRW: ['AU-NT', 'australia-northern-territory'], CBR: ['AU-ACT', 'australia-capital-territory'],
    };
    for (const [iata, [subdivision, region]] of Object.entries(expected)) {
      expect(byIata.get(iata)).toMatchObject({ iata, subdivision, region });
    }
  });

  test('never reuses one browse region id across countries', () => {
    const countryByRegion = new Map<string, string>();
    for (const region of catalog.regions) {
      expect(countryByRegion.get(region.id)).toBeUndefined();
      countryByRegion.set(region.id, region.country);
    }
    for (const airport of catalog.airports) {
      expect(countryByRegion.get(airport.region)).toBe(airport.country);
    }
  });
});
