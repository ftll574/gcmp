import { describe, expect, test } from 'vitest';
import { buildAirportIndex } from '../../src/lib/airport-index.ts';
import type { Airport } from '../../src/lib/types.ts';

const A: ReadonlyArray<Airport> = [
  { iata: 'SFO', icao: 'KSFO', name: 'San Francisco International', city: 'San Francisco', country: 'US', lat: 37.6, lon: -122.4 },
  { iata: 'SJC', icao: 'KSJC', name: 'Norman Y. Mineta San Jose International', city: 'San Jose', country: 'US', lat: 37.4, lon: -121.9 },
  { iata: 'NRT', icao: 'RJAA', name: 'Narita International Airport', city: 'Narita', country: 'JP', lat: 35.8, lon: 140.4 },
  { iata: 'HND', icao: 'RJTT', name: 'Tokyo Haneda', city: 'Tokyo', country: 'JP', lat: 35.6, lon: 139.8 },
  { iata: 'LHR', icao: 'EGLL', name: 'London Heathrow', city: 'London', country: 'GB', lat: 51.5, lon: -0.5 },
  { iata: 'LGW', icao: 'EGKK', name: 'London Gatwick', city: 'London', country: 'GB', lat: 51.2, lon: -0.2 },
  { iata: 'STN', icao: 'EGSS', name: 'London Stansted', city: 'London', country: 'GB', lat: 51.9, lon: 0.2 },
  { iata: 'JFK', icao: 'KJFK', name: 'John F Kennedy', city: 'New York', country: 'US', lat: 40.6, lon: -73.8 },
  { iata: 'LGA', icao: 'KLGA', name: 'LaGuardia', city: 'New York', country: 'US', lat: 40.8, lon: -73.9 },
  { iata: 'EWR', icao: 'KEWR', name: 'Newark Liberty', city: 'Newark', country: 'US', lat: 40.7, lon: -74.2 },
];

describe('buildAirportIndex', () => {
  const idx = buildAirportIndex(A);

  test('lookup() returns by exact IATA', () => {
    expect(idx.lookup('SFO')?.city).toBe('San Francisco');
    expect(idx.lookup('sfo')?.city).toBe('San Francisco');
    expect(idx.lookup('XXX')).toBeUndefined();
  });

  test('search() returns exact IATA match first', () => {
    const results = idx.search('SFO');
    expect(results[0]?.airport.iata).toBe('SFO');
    expect(results[0]?.match).toBe('exact-iata');
  });

  test('search("LON") resolves to city-code (LHR/LGW/STN)', () => {
    const results = idx.search('LON');
    const iatas = results.map((r) => r.airport.iata);
    expect(iatas).toContain('LHR');
    expect(iatas).toContain('LGW');
    expect(iatas).toContain('STN');
    expect(results[0]?.match).toBe('city-code');
  });

  test('search("NYC") resolves to JFK + LGA + EWR via city-code', () => {
    const results = idx.search('NYC');
    const iatas = results.map((r) => r.airport.iata);
    expect(iatas).toContain('JFK');
    expect(iatas).toContain('LGA');
    expect(iatas).toContain('EWR');
  });

  test('search() returns empty for empty query', () => {
    expect(idx.search('')).toEqual([]);
  });

  test('search() honors limit', () => {
    const results = idx.search('S', { limit: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  test('search() falls back to city prefix for "SAN" (no city code, no exact-iata, no localized)', () => {
    const results = idx.search('SAN');
    const cities = results.map((r) => r.airport.city);
    expect(cities).toContain('San Francisco');
    expect(cities).toContain('San Jose');
  });

  test('search() with zh-TW locale finds Tokyo airports via 東京', () => {
    const results = idx.search('東京', { locale: 'zh-TW' });
    const iatas = results.map((r) => r.airport.iata);
    expect(iatas).toContain('HND');
    expect(iatas).toContain('NRT');
    expect(results[0]?.match).toBe('localized');
  });

  test('search() with zh-TW locale finds London airports via 倫敦', () => {
    const results = idx.search('倫敦', { locale: 'zh-TW' });
    const iatas = results.map((r) => r.airport.iata);
    expect(iatas).toContain('LHR');
    expect(iatas).toContain('LGW');
  });

  test('search() without locale does NOT match Chinese terms', () => {
    const results = idx.search('東京');
    expect(results.length).toBe(0);
  });
});
