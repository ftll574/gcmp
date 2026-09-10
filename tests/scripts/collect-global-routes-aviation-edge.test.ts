import { expect, test } from 'vitest';
import { buildAviationEdgeGlobalRouteCatalog } from '../../scripts/collect-global-routes-aviation-edge.ts';

test('bulk Aviation Edge rows establish routes before flight-number enrichment', () => {
  const result = buildAviationEdgeGlobalRouteCatalog([
    { departureIata: 'tpe', arrivalIata: 'nrt', airlineIata: 'br', flightNumber: '198' },
    { departureIata: 'TPE', arrivalIata: 'NRT', airlineIata: 'BR', flightNumber: '196' },
    { departureIata: 'TPE', arrivalIata: 'HKG', airlineIata: 'XX', flightNumber: '1' },
    { departureIata: 'ZZZ', arrivalIata: 'NRT', airlineIata: 'BR', flightNumber: '999' },
  ], {
    checkedOn: '2026-09-11', version: '2026.3',
    knownAirports: new Set(['TPE', 'NRT', 'HKG']), eligibleCarriers: new Set(['BR']),
  });
  expect(result.catalog.routes).toEqual([expect.objectContaining({
    carrier: 'BR', pair: ['TPE', 'NRT'], carrierIdentity: 'provider-listed',
  })]);
  expect(result.catalog.routes[0]).not.toHaveProperty('flightNumbers');
  expect(result.stats).toMatchObject({ inputRows: 4, targetRows: 3, uniqueRoutes: 1, outsideAirportCatalog: 1, candidateFlightIdentities: 2 });
});
