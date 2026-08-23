/**
 * Unit tests for src/lib/rtw/continents.ts + the country→continent data
 * contract (public/data/geo/current.json), per
 * docs/decisions/continents-visited.md §7 items 1–10.
 *
 * Two fixture layers:
 *   - REAL public/data/airports.json pins the geographic CONVENTIONS
 *     (transcontinental picks, Oceania traps, territories) against the
 *     shipped dataset.
 *   - SYNTHETIC airports pin the ENGINE LOGIC (order/dedup/surface/
 *     graceful degradation) independent of dataset content.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  CountryContinentCatalogSchema,
  type ContinentId,
  type CountryContinentCatalog,
} from '../../../src/lib/schemas/country-continent.ts';
import { continentForCountry, continentsVisited } from '../../../src/lib/rtw/continents.ts';
import type { Airport, Leg } from '../../src/lib/types.ts';

const catalog: CountryContinentCatalog = CountryContinentCatalogSchema.parse(
  JSON.parse(readFileSync('public/data/geo/current.json', 'utf8')),
);

const lookup = new Map<string, ContinentId>(
  catalog.mappings.map((mapping) => [mapping.country, mapping.continent]),
);

const AIRPORTS_RAW = JSON.parse(
  readFileSync('public/data/airports.json', 'utf8'),
) as Airport[];

const realAirports = new Map<string, Airport>(AIRPORTS_RAW.map((a) => [a.iata, a]));

function syntheticAirport(iata: string, country: string): Airport {
  return { iata, name: iata, city: iata, country, lat: 0, lon: 0 };
}

const syntheticAirports = new Map<string, Airport>(
  [
    syntheticAirport('TPE', 'TW'),
    syntheticAirport('LHR', 'GB'),
    syntheticAirport('JFK', 'US'),
    syntheticAirport('SYD', 'AU'),
    syntheticAirport('SIN', 'SG'),
    syntheticAirport('CGK', 'ID'),
    syntheticAirport('BKK', 'TH'),
    syntheticAirport('GRU', 'BR'),
    syntheticAirport('EZE', 'AR'),
    syntheticAirport('QQQ', 'ZZ'), // deliberately unmapped country code
  ].map((airport) => [airport.iata, airport]),
);

function leg(from: string, to: string, extra?: Partial<Leg>): Leg {
  return { from, to, operatingCarrier: 'ZZ', ...extra };
}

/** Resolve an IATA through the REAL airports map, then the country lookup. */
function continentOf(code: string): ContinentId | undefined {
  const airport = realAirports.get(code);
  if (!airport) throw new Error(`Missing airport ${code} in public/data/airports.json`);
  return continentForCountry(airport.country, lookup);
}

describe('continentForCountry — core seven (real airports)', () => {
  test.each([
    ['TPE', 'asia'],
    ['SIN', 'asia'],
    ['CGK', 'asia'],
    ['BKK', 'asia'],
    ['LHR', 'europe'],
    ['JFK', 'north-america'],
    ['SYD', 'oceania'],
  ] as const)('%s resolves to %s', (iata, expected) => {
    expect(continentOf(iata)).toBe(expected);
  });

  test('unmapped country code resolves to undefined', () => {
    expect(continentForCountry('ZZ', lookup)).toBeUndefined();
  });
});

describe('continentForCountry — transcontinental picks (UN geoscheme == capital convention)', () => {
  test.each([
    // RU → europe, pinned for BOTH Moscow AND Vladivostok (lon 132°E):
    // one deterministic country-level rule beats ad-hoc sub-national splits.
    ['SVO', 'europe'],
    ['VVO', 'europe'],
    ['IST', 'asia'], // TR whole-country Western Asia
    ['CAI', 'africa'], // EG despite oneworld "Middle East" tables
    ['ALA', 'asia'], // KZ Central Asia
    ['TBS', 'asia'], // GE Western Asia
    ['GYD', 'asia'], // AZ Western Asia
    ['EVN', 'asia'], // AM Western Asia
  ] as const)('%s (%s country pick) → %s', (iata, expected) => {
    expect(continentOf(iata)).toBe(expected);
  });

  test.each([
    ['RU', 'europe'],
    ['TR', 'asia'],
    ['EG', 'africa'],
    ['KZ', 'asia'],
    ['GE', 'asia'],
    ['AZ', 'asia'],
    ['AM', 'asia'],
    ['CY', 'asia'], // EU member cosmetic oddity, accepted per decision
  ] as const)('country row %s → %s', (country, expected) => {
    expect(continentForCountry(country, lookup)).toBe(expected);
  });
});

describe('continentForCountry — Oceania handling', () => {
  test.each([
    ['HNL', 'north-america'], // US row: Hawaiʻi stays north-america (Q1)
    ['OGG', 'north-america'],
    ['PPT', 'oceania'], // PF French Polynesia
    ['AKL', 'oceania'],
    ['NAN', 'oceania'], // FJ
    ['GUM', 'oceania'], // GU territory ISO code lands in Micronesia
    ['AWK', 'oceania'], // Wake Island, UM
    ['WMX', 'asia'], // Indonesian Papua: ID → asia entirely
  ] as const)('%s → %s', (iata, expected) => {
    expect(continentOf(iata)).toBe(expected);
  });

  test('Australian external territories CX/CC/NF → oceania', () => {
    expect(continentForCountry('CX', lookup)).toBe('oceania');
    expect(continentForCountry('CC', lookup)).toBe('oceania');
    expect(continentForCountry('NF', lookup)).toBe('oceania');
  });

  test('US Pacific territories are their own ISO codes and land in oceania', () => {
    expect(continentForCountry('GU', lookup)).toBe('oceania');
    expect(continentForCountry('UM', lookup)).toBe('oceania');
    expect(continentForCountry('AS', lookup)).toBe('oceania');
  });
});

describe('continentForCountry — territory ISO codes', () => {
  test.each([
    ['GL', 'north-america'], // Greenland: Northern America despite Denmark link
    ['RE', 'africa'], // Réunion: Eastern Africa despite France sovereignty
    ['YT', 'africa'],
    ['HK', 'asia'],
    ['MO', 'asia'],
    ['XK', 'europe'], // Kosovo user-assigned code
    ['AQ', 'antarctica'],
    ['TF', 'antarctica'],
  ] as const)('%s → %s', (country, expected) => {
    expect(continentForCountry(country, lookup)).toBe(expected);
  });

  test.each([
    ['WFR', 'antarctica'], // Wolf's Fang Runway: only dataset row on AQ
    ['PRN', 'europe'], // Priština, XK
    ['RUN', 'africa'], // Réunion
  ] as const)('%s (real airport) → %s', (iata, expected) => {
    expect(continentOf(iata)).toBe(expected);
  });
});

describe('continentsVisited — order semantics', () => {
  test('first-visit order with dedup; closing the loop does not re-add asia', () => {
    const legs: Leg[] = [
      leg('TPE', 'LHR'),
      leg('LHR', 'JFK'),
      leg('JFK', 'SYD'),
      leg('SYD', 'TPE'),
    ];
    expect(continentsVisited(legs, { airports: syntheticAirports, countryContinents: lookup })).toEqual([
      'asia',
      'europe',
      'north-america',
      'oceania',
    ]);
  });

  test('revisit keeps the FIRST visit position', () => {
    const legs: Leg[] = [leg('TPE', 'LHR'), leg('LHR', 'TPE')];
    expect(continentsVisited(legs, { airports: syntheticAirports, countryContinents: lookup })).toEqual([
      'asia',
      'europe',
    ]);
  });

  test('single-continent route collapses to exactly one entry', () => {
    const legs: Leg[] = [leg('SIN', 'CGK'), leg('CGK', 'BKK')];
    const result = continentsVisited(legs, { airports: syntheticAirports, countryContinents: lookup });
    expect(result).toEqual(['asia']);
    expect(result).toHaveLength(1);
  });

  test('start point always counts', () => {
    expect(continentsVisited([leg('SYD', 'SYD')], { airports: syntheticAirports, countryContinents: lookup })).toEqual(['oceania']);
  });
});

describe('continentsVisited — surface-sector policy', () => {
  test('a continent reached ONLY via surface endpoints still counts', () => {
    const legs: Leg[] = [leg('GRU', 'EZE', { surface: true }), leg('EZE', 'JFK')];
    expect(continentsVisited(legs, { airports: syntheticAirports, countryContinents: lookup })).toEqual([
      'south-america',
      'north-america',
    ]);
  });

  test('surface endpoints contribute both `from` and `to`', () => {
    const legs: Leg[] = [leg('GRU', 'EZE', { surface: true })];
    expect(continentsVisited(legs, { airports: syntheticAirports, countryContinents: lookup })).toEqual([
      'south-america',
    ]);
  });
});

describe('continentsVisited — airportOverrides application (spec §8 Q5)', () => {
  test('an override wins over the country row, at both endpoints', () => {
    const airports = new Map<string, Airport>([
      ['HNL', syntheticAirport('HNL', 'US')],
      ['TPE', syntheticAirport('TPE', 'TW')],
    ]);
    const overrides = new Map<string, ContinentId>([['HNL', 'oceania']]);
    expect(
      continentsVisited([leg('HNL', 'TPE')], {
        airports,
        countryContinents: lookup,
        airportContinentOverrides: overrides,
      }),
    ).toEqual(['oceania', 'asia']);
  });

  test('an override resolves even when airports.json lacks the IATA', () => {
    // XXX is deliberately absent from syntheticAirports (degradation fixture).
    const overrides = new Map<string, ContinentId>([['XXX', 'antarctica']]);
    expect(
      continentsVisited([leg('XXX', 'TPE')], {
        airports: syntheticAirports,
        countryContinents: lookup,
        airportContinentOverrides: overrides,
      }),
    ).toEqual(['antarctica', 'asia']);
  });

  test('absent overrides map leaves country-row resolution unchanged', () => {
    expect(
      continentsVisited([leg('TPE', 'LHR')], {
        airports: syntheticAirports,
        countryContinents: lookup,
      }),
    ).toEqual(['asia', 'europe']);
  });
});

describe('continentsVisited — graceful degradation + fallback', () => {
  test('unknown IATA codes are skipped without throwing', () => {
    const legs: Leg[] = [leg('XXX', 'TPE'), leg('TPE', 'ZZZ')];
    expect(continentsVisited(legs, { airports: syntheticAirports, countryContinents: lookup })).toEqual(['asia']);
  });

  test('airports whose country is unmapped contribute nothing', () => {
    const legs: Leg[] = [leg('QQQ', 'TPE')];
    expect(continentsVisited(legs, { airports: syntheticAirports, countryContinents: lookup })).toEqual(['asia']);
  });

  test('empty legs yield []', () => {
    expect(continentsVisited([], { airports: syntheticAirports, countryContinents: lookup })).toEqual([]);
  });

  test('absent countryContinents falls back to [] (backward-compatible inputs)', () => {
    const legs: Leg[] = [leg('TPE', 'LHR')];
    expect(continentsVisited(legs, { airports: syntheticAirports })).toEqual([]);
  });

  test('present-but-empty lookup yields []', () => {
    const legs: Leg[] = [leg('TPE', 'LHR')];
    expect(continentsVisited(legs, { airports: syntheticAirports, countryContinents: new Map() })).toEqual([]);
  });
});

describe('dataset completeness guard (CI-critical)', () => {
  test('every distinct country in public/data/airports.json has a mapping row', () => {
    const observed = new Set(AIRPORTS_RAW.map((a) => a.country));
    const missing = [...observed].filter((country) => !lookup.has(country)).sort();
    expect(missing).toEqual([]);
  });

  test('the 13 unobserved-but-standard ISO codes are pre-covered', () => {
    const unobserved = ['AD', 'AX', 'BV', 'GS', 'HM', 'LI', 'MC', 'PN', 'SJ', 'SM', 'TF', 'TK', 'VA'];
    const missing = unobserved.filter((country) => !lookup.has(country));
    expect(missing).toEqual([]);
  });

  test('catalog shape matches the reviewed artifact: 249 unique rows across 7 continents', () => {
    expect(catalog.mappings).toHaveLength(249);
    expect(new Set(catalog.mappings.map((m) => m.country)).size).toBe(249);
    const byContinent = new Map<ContinentId, number>();
    for (const mapping of catalog.mappings) {
      byContinent.set(mapping.continent, (byContinent.get(mapping.continent) ?? 0) + 1);
    }
    expect(byContinent.get('africa')).toBe(59);
    expect(byContinent.get('antarctica')).toBe(5);
    expect(byContinent.get('asia')).toBe(50);
    expect(byContinent.get('europe')).toBe(52);
    expect(byContinent.get('north-america')).toBe(41);
    expect(byContinent.get('oceania')).toBe(28);
    expect(byContinent.get('south-america')).toBe(14);
  });

  test('provenance fields pin the convention', () => {
    expect(catalog.convention).toBe('un-geoscheme-country-level');
    expect(catalog.version).toMatch(/^\d{4}\.\d$/);
    expect(catalog.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(catalog.sourceUrls.length).toBeGreaterThanOrEqual(1);
  });
});

describe('CountryContinentCatalogSchema', () => {
  const validCatalog = {
    version: '2026.2',
    convention: 'un-geoscheme-country-level',
    lastVerified: '2026-05-24',
    sourceUrls: ['https://unstats.un.org/unsd/methodology/m49/'],
    mappings: [
      { country: 'TW', continent: 'asia' },
      { country: 'GB', continent: 'europe' },
      { country: 'US', continent: 'north-america' },
    ],
  };

  test('valid catalog parses; airportOverrides defaults to [] when omitted', () => {
    const parsed = CountryContinentCatalogSchema.parse(validCatalog);
    expect(parsed.airportOverrides).toEqual([]);
  });

  test('rejects a non-alpha-2 country code ("USA")', () => {
    expect(() =>
      CountryContinentCatalogSchema.parse({
        ...validCatalog,
        mappings: [{ country: 'USA', continent: 'north-america' }],
      }),
    ).toThrow();
  });

  test('rejects an unknown continent id ("eurasia")', () => {
    expect(() =>
      CountryContinentCatalogSchema.parse({
        ...validCatalog,
        mappings: [{ country: 'TW', continent: 'eurasia' }],
      }),
    ).toThrow();
  });

  test('rejects duplicate country rows via superRefine', () => {
    const duplicate = {
      ...validCatalog,
      mappings: [
        { country: 'TW', continent: 'asia' },
        { country: 'TW', continent: 'oceania' },
      ],
    };
    expect(() => CountryContinentCatalogSchema.parse(duplicate)).toThrow(/Duplicate country row: TW/);
  });

  test('accepts an override but requires a non-empty reason', () => {
    const withOverride = {
      ...validCatalog,
      airportOverrides: [{ iata: 'HNL', continent: 'oceania', reason: 'Product X zones Hawaiʻi to SW Pacific' }],
    };
    expect(CountryContinentCatalogSchema.parse(withOverride).airportOverrides).toHaveLength(1);

    const reasonless = {
      ...validCatalog,
      airportOverrides: [{ iata: 'HNL', continent: 'oceania' }],
    };
    expect(() => CountryContinentCatalogSchema.parse(reasonless)).toThrow();

    const badIata = {
      ...validCatalog,
      airportOverrides: [{ iata: 'HNLX', continent: 'oceania', reason: 'bad shape' }],
    };
    expect(() => CountryContinentCatalogSchema.parse(badIata)).toThrow();
  });
});
