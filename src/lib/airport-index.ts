/**
 * Fast airport lookup + autocomplete index.
 *
 *   buildAirportIndex(airports)   →  AirportIndex
 *   index.lookup(iata)            →  Airport | undefined
 *   index.search(prefix, opts?)   →  SearchResult[]   ranked by:
 *                                     1. exact IATA match
 *                                     2. localized city alias (per locale)
 *                                     3. IATA city pseudo-code (NYC, TYO, LON…)
 *                                     4. IATA prefix
 *                                     5. ICAO prefix
 *                                     6. City prefix (case-insensitive)
 *                                     7. Name substring
 *
 * Built once at module load (~5k airports). Subsequent searches are O(n)
 * worst case but typically return within < 5ms on a warm cache.
 */

import { resolveCityCode } from './city-codes.ts';
import type { Airport } from './types.ts';
import { findLocalizedMatches } from '../i18n/localized-cities.ts';
import type { Locale } from '../i18n/types.ts';

export interface SearchResult {
  airport: Airport;
  /** How this result was matched — used by the UI to label e.g. "(city code NYC)". */
  match: 'exact-iata' | 'city-code' | 'localized' | 'iata-prefix' | 'icao-prefix' | 'city-prefix' | 'name-substring';
  /** Original query string. */
  query: string;
}

export interface SearchOptions {
  limit?: number;
  locale?: Locale;
}

export interface AirportIndex {
  readonly all: ReadonlyArray<Airport>;
  readonly byIata: ReadonlyMap<string, Airport>;
  lookup(iata: string): Airport | undefined;
  search(prefix: string, opts?: SearchOptions): SearchResult[];
}

export function buildAirportIndex(airports: ReadonlyArray<Airport>): AirportIndex {
  const byIata = new Map<string, Airport>();
  for (const a of airports) {
    byIata.set(a.iata.toUpperCase(), a);
  }

  function lookup(iata: string): Airport | undefined {
    return byIata.get(iata.toUpperCase());
  }

  function search(rawQuery: string, opts: SearchOptions = {}): SearchResult[] {
    const { limit = 8, locale } = opts;
    const trimmed = rawQuery.trim();
    if (trimmed.length === 0) return [];

    const query = trimmed.toUpperCase();
    const results: SearchResult[] = [];
    const seenIata = new Set<string>();

    function addIfAirport(iata: string, match: SearchResult['match']): boolean {
      const airport = byIata.get(iata);
      if (!airport) return false;
      if (seenIata.has(airport.iata)) return false;
      results.push({ airport, match, query: rawQuery });
      seenIata.add(airport.iata);
      return results.length >= limit;
    }

    // 1. Exact IATA match (single airport, top-ranked).
    if (query.length === 3 && byIata.has(query)) {
      if (addIfAirport(query, 'exact-iata')) return results;
    }

    // 2. Localized alias (e.g. "東京" → HND + NRT + TYO under zh-TW).
    if (locale) {
      const localizedIatas = findLocalizedMatches(trimmed, locale, limit);
      for (const iata of localizedIatas) {
        if (addIfAirport(iata, 'localized')) return results;
      }
    }

    // 3. IATA city pseudo-code (NYC, TYO, LON, ...).
    const cityIatas = resolveCityCode(query);
    if (cityIatas) {
      for (const iata of cityIatas) {
        if (addIfAirport(iata, 'city-code')) return results;
      }
    }

    // 4-7. Fall through to string-based matching across all airports.
    const iataPrefix: Airport[] = [];
    const icaoPrefix: Airport[] = [];
    const cityPrefix: Airport[] = [];
    const nameSubstring: Airport[] = [];

    for (const a of airports) {
      if (seenIata.has(a.iata)) continue;
      const iata = a.iata.toUpperCase();
      const icao = (a.icao ?? '').toUpperCase();
      const city = a.city.toUpperCase();
      const name = a.name.toUpperCase();

      if (iata.startsWith(query)) iataPrefix.push(a);
      else if (icao.startsWith(query)) icaoPrefix.push(a);
      else if (city.startsWith(query)) cityPrefix.push(a);
      else if (name.includes(query)) nameSubstring.push(a);

      if (iataPrefix.length + icaoPrefix.length + cityPrefix.length + nameSubstring.length >= limit * 4) {
        break;
      }
    }

    for (const a of iataPrefix) {
      if (addIfAirport(a.iata, 'iata-prefix')) return results;
    }
    for (const a of icaoPrefix) {
      if (addIfAirport(a.iata, 'icao-prefix')) return results;
    }
    for (const a of cityPrefix) {
      if (addIfAirport(a.iata, 'city-prefix')) return results;
    }
    for (const a of nameSubstring) {
      if (addIfAirport(a.iata, 'name-substring')) return results;
    }

    return results;
  }

  return { all: airports, byIata, lookup, search };
}
