import { describe, expect, test } from 'vitest';
import { buildAirportIndex } from '../../src/lib/airport-index.ts';
import type { Airport } from '../../src/lib/types.ts';

const A: ReadonlyArray<Airport> = [
  { iata: 'SFO', icao: 'KSFO', name: 'San Francisco International', city: 'San Francisco', country: 'US', lat: 37.6, lon: -122.4 },
  { iata: 'SJC', icao: 'KSJC', name: 'Norman Y. Mineta San Jose International', city: 'San Jose', country: 'US', lat: 37.4, lon: -121.9 },
  { iata: 'NRT', icao: 'RJAA', name: 'Narita International Airport', city: 'Narita', country: 'JP', lat: 35.8, lon: 140.4 },
  { iata: 'LHR', icao: 'EGLL', name: 'London Heathrow', city: 'London', country: 'GB', lat: 51.5, lon: -0.5 },
  { iata: 'LGW', icao: 'EGKK', name: 'London Gatwick', city: 'London', country: 'GB', lat: 51.2, lon: -0.2 },
  { iata: 'STN', icao: 'EGSS', name: 'London Stansted', city: 'London', country: 'GB', lat: 51.9, lon: 0.2 },
];

describe('buildAirportIndex', () => {
  const idx = buildAirportIndex(A);

  test('lookup() returns by exact IATA', () => {
    expect(idx.lookup('SFO')?.city).toBe('San Francisco');
    expect(idx.lookup('sfo')?.city).toBe('San Francisco'); // case-insensitive
    expect(idx.lookup('XXX')).toBeUndefined();
  });

  test('search() returns exact IATA match first', () => {
    const results = idx.search('SFO');
    expect(results[0]?.iata).toBe('SFO');
  });

  test('search("LON") returns all 3 London airports (ambiguity surfaced)', () => {
    const results = idx.search('LON');
    const cities = results.map((r) => r.city);
    expect(cities.filter((c) => c === 'London').length).toBeGreaterThanOrEqual(3);
  });

  test('search() returns empty for empty query', () => {
    expect(idx.search('')).toEqual([]);
  });

  test('search() honors limit', () => {
    const results = idx.search('S', 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  test('search() by city prefix when no IATA matches', () => {
    const results = idx.search('SAN');
    // San Francisco and San Jose both start with "San".
    const cities = results.map((r) => r.city);
    expect(cities).toContain('San Francisco');
    expect(cities).toContain('San Jose');
  });
});
