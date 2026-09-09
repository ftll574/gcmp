import { describe, expect, test } from 'vitest';
import type { RouteNetworkCatalog } from '../../../src/lib/schemas/route-network.ts';
import type { Airport } from '../../../src/lib/types.ts';
import {
  buildRouteCatalogPairs,
  filterRouteCatalogPairs,
  groupRouteCatalog,
  listRouteCatalogCarrierOptions,
  listRouteCatalogRegionOptions,
  type RouteBrowserOfficialCatalog,
} from '../../../src/lib/rtw/route-catalog-browser.ts';

const airports = new Map<string, Airport>([
  ['TPE', { iata: 'TPE', name: 'Taiwan Taoyuan', city: 'Taoyuan', country: 'TW', lat: 25, lon: 121 }],
  ['BKK', { iata: 'BKK', name: 'Suvarnabhumi', city: 'Bangkok', country: 'TH', lat: 14, lon: 101 }],
  ['LHR', { iata: 'LHR', name: 'Heathrow', city: 'London', country: 'GB', lat: 51, lon: 0 }],
]);

const routeNetwork: RouteNetworkCatalog = {
  version: '2026.3', coverage: 'curated-not-complete', carrierUniverses: [],
  sources: [
    { id: 'routes', url: 'https://example.com/routes', checkedOn: '2026-09-08', note: 'Route source' },
    { id: 'numbers', url: 'https://example.com/numbers', checkedOn: '2026-09-09', note: 'Flight-number source' },
  ],
  routes: [
    {
      carrier: 'BR', pair: ['TPE', 'BKK'], service: 'nonstop', status: 'published', carrierIdentity: 'provider-listed', sourceIds: ['routes'],
      flightNumberCandidates: ['BR75'], flightNumberCandidateSourceIds: ['numbers'],
    },
    { carrier: 'TG', pair: ['TPE', 'BKK'], service: 'nonstop', status: 'published', sourceIds: ['routes'] },
    { carrier: 'BR', pair: ['LHR', 'BKK'], service: 'nonstop', status: 'published', sourceIds: ['routes'] },
  ],
};

const officialSchedules: RouteBrowserOfficialCatalog = {
  sources: {
    eva: {
      name: 'EVA timetable', url: 'https://example.com/eva', checkedAt: '2026-09-08T00:00:00.000Z',
    },
  },
  services: [{
    id: 'br67', carrier: 'BR', flightNumber: '67', from: 'TPE', to: 'BKK',
    effectiveFrom: '2026-09-08', effectiveUntil: '2026-09-08', daysOfWeek: [],
    addedDates: ['2026-09-08'], departureTime: '08:15', arrivalTime: '11:20',
    arrivalDayOffset: 0, sourceId: 'eva',
  }],
  flightNumberReferences: [{
    id: 'br61-ref', carrier: 'BR', from: 'TPE', to: 'BKK', flightNumbers: ['61'], sourceId: 'eva',
  }],
};

describe('route catalog browser model', () => {
  test('merges route evidence with known flight numbers and upgrades exact operating evidence', () => {
    const pairs = buildRouteCatalogPairs({
      routeNetwork,
      officialSchedules,
      memberCodes: new Set(['BR', 'TG']),
      airports,
    });
    const tpeBkk = pairs.find((pair) => pair.from === 'TPE' && pair.to === 'BKK')!;
    expect(tpeBkk.carriers.map((carrier) => carrier.carrier)).toEqual(['BR', 'TG']);
    const br = tpeBkk.carriers.find((carrier) => carrier.carrier === 'BR')!;
    expect(br.identity).toBe('operating');
    expect(br.flightNumbers).toEqual(['BR61', 'BR67']);
    expect(br.candidateFlightNumbers).toEqual(['BR75']);
    expect(tpeBkk.flightCount).toBe(3);
    expect(br.evidence.some((row) => row.kind === 'flight-number-candidate' && row.candidateFlightNumbers.includes('BR75'))).toBe(true);
    expect(br.evidence.some((row) => row.kind === 'official-service' && row.departureTime === '08:15')).toBe(true);
  });

  test('groups by origin or destination through continent, country and airport', () => {
    const pairs = buildRouteCatalogPairs({ routeNetwork, officialSchedules, memberCodes: new Set(['BR', 'TG']), airports });
    const continents = new Map([['TW', 'asia'], ['TH', 'asia'], ['GB', 'europe']] as const);
    const byOrigin = groupRouteCatalog({ pairs, mode: 'from', countryContinents: continents });
    const asia = byOrigin.find((group) => group.continent === 'asia')!;
    expect(asia.countries.map((country) => country.country)).toContain('TW');
    expect(asia.countries.find((country) => country.country === 'TW')?.airports.map((airport) => airport.iata)).toContain('TPE');
    const europe = byOrigin.find((group) => group.continent === 'europe')!;
    expect(europe.countries.map((country) => country.country)).toEqual(['GB']);
    expect(europe.countries[0]?.airports.map((airport) => airport.iata)).toEqual(['LHR']);
    const byDestination = groupRouteCatalog({ pairs, mode: 'to', countryContinents: continents });
    expect(byDestination).toHaveLength(1);
    expect(byDestination[0]?.continent).toBe('asia');
    expect(byDestination[0]?.countries.map((country) => country.country)).toEqual(['TH']);
    expect(byDestination[0]?.countries[0]?.airports[0]?.iata).toBe('BKK');
    expect(byDestination[0]?.countries[0]?.airports[0]?.routeCount).toBe(2);
  });

  test('filters the catalog by airline and geographic region before country grouping', () => {
    const pairs = buildRouteCatalogPairs({ routeNetwork, officialSchedules, memberCodes: new Set(['BR', 'TG']), airports });
    const continents = new Map([['TW', 'asia'], ['TH', 'asia'], ['GB', 'europe']] as const);
    const subregions = new Map([['TW', 'northeast-asia'], ['TH', 'southeast-asia'], ['GB', 'western-europe']]);
    expect(listRouteCatalogCarrierOptions(pairs)).toEqual([
      { carrier: 'BR', routeCount: 2 },
      { carrier: 'TG', routeCount: 1 },
    ]);
    expect(listRouteCatalogRegionOptions({
      pairs,
      mode: 'from',
      countryContinents: continents,
      countrySubregions: subregions,
    })).toEqual(expect.arrayContaining([
      { value: 'continent:asia', kind: 'continent', id: 'asia', continent: 'asia', routeCount: 1 },
      { value: 'subregion:northeast-asia', kind: 'subregion', id: 'northeast-asia', continent: 'asia', routeCount: 1 },
      { value: 'subregion:western-europe', kind: 'subregion', id: 'western-europe', continent: 'europe', routeCount: 1 },
    ]));
    const filtered = filterRouteCatalogPairs({
      pairs,
      mode: 'from',
      carrier: 'BR',
      region: 'subregion:northeast-asia',
      countryContinents: continents,
      countrySubregions: subregions,
    });
    expect(filtered.map((pair) => `${pair.from}-${pair.to}`)).toEqual(['TPE-BKK']);
    expect(filtered[0]?.carriers.map((carrier) => carrier.carrier)).toEqual(['BR']);
    expect(filtered[0]?.flightCount).toBe(3);
  });

  test('a current route correction cannot be resurrected by an older official flight-number reference', () => {
    const correctedNetwork: RouteNetworkCatalog = {
      ...routeNetwork,
      routes: [{
        carrier: 'BR', pair: ['TPE', 'BKK'], service: 'nonstop', status: 'suspended',
        sourceIds: ['routes'], effectiveFrom: '2026-09-09',
      }],
    };
    const pairs = buildRouteCatalogPairs({
      routeNetwork: correctedNetwork,
      officialSchedules,
      memberCodes: new Set(['BR']),
      airports,
    });
    expect(pairs.find((pair) => pair.from === 'TPE' && pair.to === 'BKK')).toBeUndefined();
  });
});
