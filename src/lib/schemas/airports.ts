import { z } from 'zod';
import type { Airport } from '../types.ts';

/**
 * airports.json — the global airport reference table (~4.6k rows).
 *
 * CORE dataset: parsed strictly at load time with NO degrade path — a bad
 * row must fail loudly rather than silently shrink lookups. Every rule
 * below is measured against the current file (profiled via a throwaway
 * node script), not guessed from scripts/build-airports.ts:
 *
 *   - iata     always present and alpha-only ^[A-Z]{3}$ (4563/4563 rows).
 *   - icao     OPTIONAL — omitted entirely (never emptied) on 63/4563 rows
 *              where OurAirports ident isn't 4 chars; digits DO occur
 *              (12/4500, e.g. OCA→"07FA", RDL→"HE36") → ^[A-Z0-9]{4}$.
 *   - name     never empty in reality (generator's `?? ''` never fires);
 *              enforced min(1) — a nameless row is corrupt data.
 *   - city     MAY be '' — 121/4563 rows have an empty OurAirports
 *              municipality (e.g. AXR Arutua); consumers only use it for
 *              prefix search, so empty is harmless. Deliberate looseness.
 *   - country  ISO 3166-1 alpha-2 — continents completeness test depends
 *              on this exact domain.
 *   - lat/lon  finite numbers within WGS-84 bounds.
 *
 * Rows are unique by iata (enforced below): buildAirportIndex is last-wins,
 * so a duplicate would silently shadow the earlier airport instead of
 * failing. Sorted-by-iata is an incidental build detail, deliberately NOT
 * enforced here. Unknown keys are stripped (house convention — sibling
 * schemas don't use strict objects); key-set drift is caught by tests.
 */
export const AirportSchema = z.object({
  iata: z.string().regex(/^[A-Z]{3}$/, 'iata must be a 3-letter uppercase IATA code'),
  icao: z.string().regex(/^[A-Z0-9]{4}$/, 'icao must be a 4-character uppercase ICAO code').optional(),
  name: z.string().min(1),
  city: z.string(),
  country: z.string().regex(/^[A-Z]{2}$/, 'country must be an ISO 3166-1 alpha-2 code'),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});
export type AirportRow = z.infer<typeof AirportSchema>;

export const AirportCatalogSchema = z.array(AirportSchema).superRefine((airports, ctx) => {
  // Cross-row uniqueness: one row per iata (index building is last-wins).
  const seen = new Set<string>();
  for (const [idx, airport] of airports.entries()) {
    if (seen.has(airport.iata)) {
      ctx.addIssue({
        code: 'custom',
        message: `Duplicate airport iata: ${airport.iata}`,
        path: [idx],
      });
    }
    seen.add(airport.iata);
  }
});
export type AirportCatalog = z.infer<typeof AirportCatalogSchema>;

/**
 * Loader seam for public/data/airports.json. The declared return type is
 * the compile-time contract: if the schema output ever drifts from the
 * shared {@link Airport} interface, this line fails `tsc` at the boundary
 * instead of letting a cast paper over it downstream.
 */
export function parseAirportCatalog(raw: unknown): Airport[] {
  return AirportCatalogSchema.parse(raw);
}
