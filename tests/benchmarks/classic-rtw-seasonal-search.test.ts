import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { findSeasonalItinerary, seasonalItineraryLegs } from '../../src/lib/rtw/seasonal-itinerary.ts';
import { validateRtwRoute } from '../../src/lib/rtw/validate.ts';
import { SeasonalRtwTemplateSchema } from '../../src/lib/schemas/rtw-seasonal.ts';
import { AllianceCatalogSchema } from '../../src/lib/schemas/alliance.ts';
import { CountryContinentCatalogSchema } from '../../src/lib/schemas/country-continent.ts';
import { RouteNetworkCatalogSchema } from '../../src/lib/schemas/route-network.ts';
import { RtwRuleCatalogSchema } from '../../src/lib/schemas/rtw-rule.ts';
import type { Leg } from '../../src/lib/types.ts';

const template = SeasonalRtwTemplateSchema.parse(JSON.parse(
  readFileSync('public/data/rtw-seasonal/eva-star-w26.json', 'utf8'),
));
const routes = RouteNetworkCatalogSchema.parse(JSON.parse(
  readFileSync('public/data/route-network/runtime-current.json', 'utf8'),
));
const products = RtwRuleCatalogSchema.parse(JSON.parse(
  readFileSync('public/data/rtw-products/current.json', 'utf8'),
));
const alliances = AllianceCatalogSchema.parse(JSON.parse(
  readFileSync('public/data/alliances/current.json', 'utf8'),
));
const geo = CountryContinentCatalogSchema.parse(JSON.parse(
  readFileSync('public/data/geo/current.json', 'utf8'),
));
const airportRows = JSON.parse(readFileSync('public/data/airports.json', 'utf8')) as Array<{
  iata: string; name: string; city: string; country: string; lat: number; lon: number; icao?: string;
}>;
const airports = new Map(airportRows.map((airport) => [airport.iata, airport]));
const countryContinents = new Map(geo.mappings.map((row) => [row.country, row.continent]));
const airportContinentOverrides = new Map(geo.airportOverrides.map((row) => [row.iata, row.continent]));
const product = products.products.find((candidate) => candidate.id === template.productId)!;

describe('classic RTW seasonal search — product-level acceptance', () => {
  test.each(['2026-11-02', '2026-12-05', '2027-02-20'])('%s produces an operating, rule-valid RTW itinerary', (start) => {
    const result = findSeasonalItinerary(template, start);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const flight of result.flights) {
      const route = routes.routes.find((candidate) => candidate.status === 'published'
        && (candidate.carrierIdentity ?? 'operating') === 'operating'
        && candidate.carrier === flight.carrier
        && candidate.pair[0] === flight.from
        && candidate.pair[1] === flight.to);
      expect(route, `${flight.carrier}${flight.flightNumber} ${flight.from}-${flight.to}`).toBeDefined();
    }

    const legs: Leg[] = seasonalItineraryLegs(result);
    const validation = validateRtwRoute(product, legs, {
      airports,
      allianceCatalog: alliances,
      countryContinents,
      airportContinentOverrides,
    }, { startDate: result.actualStartDate, endDate: result.endDate });
    expect(validation.findings.filter((finding) => finding.severity === 'fail')).toEqual([]);
    expect(validation.valid).toBe(true);
    expect(validation.summary.flightSegments).toBe(8);
    expect(validation.summary.knownStopovers).toBe(7);
    expect(validation.summary.direction).toBe('eastbound');
    expect(validation.summary.oceansCrossed).toEqual(['atlantic', 'pacific']);
  });
});
