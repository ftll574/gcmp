/**
 * Fast airport lookup + autocomplete index.
 *
 *   buildAirportIndex(airports)   →  AirportIndex
 *   index.lookup(iata)            →  Airport | undefined
 *   index.search(prefix, limit=8) →  Airport[]   ranked by:
 *                                     1. exact IATA match
 *                                     2. IATA prefix
 *                                     3. ICAO prefix
 *                                     4. City prefix (case-insensitive)
 *                                     5. Name substring
 *
 * Built once at module load (~5k airports). Subsequent searches are O(n)
 * worst case but typically return within < 5ms on a warm cache.
 */

import type { Airport } from './types.ts';

export interface AirportIndex {
  readonly all: ReadonlyArray<Airport>;
  readonly byIata: ReadonlyMap<string, Airport>;
  lookup(iata: string): Airport | undefined;
  search(prefix: string, limit?: number): Airport[];
}

export function buildAirportIndex(airports: ReadonlyArray<Airport>): AirportIndex {
  const byIata = new Map<string, Airport>();
  for (const a of airports) {
    byIata.set(a.iata.toUpperCase(), a);
  }

  function lookup(iata: string): Airport | undefined {
    return byIata.get(iata.toUpperCase());
  }

  function search(rawQuery: string, limit: number = 8): Airport[] {
    const query = rawQuery.trim().toUpperCase();
    if (query.length === 0) return [];

    const exact: Airport[] = [];
    const iataPrefix: Airport[] = [];
    const icaoPrefix: Airport[] = [];
    const cityPrefix: Airport[] = [];
    const nameSubstring: Airport[] = [];

    for (const a of airports) {
      const iata = a.iata.toUpperCase();
      const icao = (a.icao ?? '').toUpperCase();
      const city = a.city.toUpperCase();
      const name = a.name.toUpperCase();

      if (iata === query) {
        exact.push(a);
      } else if (iata.startsWith(query)) {
        iataPrefix.push(a);
      } else if (icao.startsWith(query)) {
        icaoPrefix.push(a);
      } else if (city.startsWith(query)) {
        cityPrefix.push(a);
      } else if (name.includes(query)) {
        nameSubstring.push(a);
      }

      // Early exit if all tiers are full enough.
      if (
        exact.length + iataPrefix.length + icaoPrefix.length + cityPrefix.length + nameSubstring.length >=
        limit * 4
      ) {
        break;
      }
    }

    return [...exact, ...iataPrefix, ...icaoPrefix, ...cityPrefix, ...nameSubstring].slice(
      0,
      limit,
    );
  }

  return { all: airports, byIata, lookup, search };
}
