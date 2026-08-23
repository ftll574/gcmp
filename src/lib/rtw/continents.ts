import type { Leg } from '../types.ts';
import type { ContinentId } from '../schemas/country-continent.ts';
import type { RtwValidationInputs } from './validate.ts';

/**
 * Pure country→continent helpers feeding `summary.continentsVisited`
 * (decision record: docs/decisions/continents-visited.md).
 *
 *   legs ──► for each leg, visit `from` then `to`
 *        ──► airport-level override? ──┬─ yes ► continent
 *                                      └─ no  ► airport ──► country ──► continent
 *        ──► dedupe (first-visit order)
 *
 * Semantics pinned by tests/lib/rtw/continents.test.ts:
 *   - Lookup order (spec §8 Q5): airportContinentOverrides wins over the
 *     country row; an override also resolves an IATA that airports.json
 *     does not know, because it is keyed by the code alone.
 *   - First-visit order: unique continents in itinerary order ("Asia →
 *     Europe → North America"); revisiting a continent never re-adds it.
 *   - Surface sectors DO count as visited at BOTH endpoints — visiting
 *     requires being there, whereas oceansCrossed() skips surface legs
 *     because crossing requires flying over.
 *   - Unknown airports / unmapped countries are skipped silently,
 *     matching the engine's graceful degradation elsewhere.
 */
export function continentForCountry(
  country: string,
  lookup: ReadonlyMap<string, ContinentId>,
): ContinentId | undefined {
  return lookup.get(country);
}

export function continentsVisited(
  legs: ReadonlyArray<Leg>,
  inputs: Pick<
    RtwValidationInputs,
    'airports' | 'countryContinents' | 'airportContinentOverrides'
  >,
): ReadonlyArray<ContinentId> {
  const lookup = inputs.countryContinents;
  if (!lookup) return [];

  const overrides = inputs.airportContinentOverrides;
  const visited = new Set<ContinentId>();
  for (const leg of legs) {
    for (const code of [leg.from, leg.to]) {
      // Spec §8 Q5: airport-level override first, then the country row.
      const overridden = overrides?.get(code);
      if (overridden) {
        visited.add(overridden);
        continue;
      }
      const airport = inputs.airports.get(code);
      if (!airport) continue;
      const continent = lookup.get(airport.country);
      if (!continent) continue;
      visited.add(continent);
    }
  }
  return [...visited];
}
