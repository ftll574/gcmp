import { z } from 'zod';

/**
 * Network-gap watchlist (`public/data/network-gaps/current.json`).
 *
 * Tiny, evidence-linked list of city pairs a carrier is commonly ASSUMED to
 * fly but does not (docs/calibration-set.md addendum A2 — Case 5 root
 * cause: BR ceased TPE–GUM in 2017-06, so TPE→Japan→GUM constructions
 * became unissuable). The engine emits a WARNING finding when an operating
 * carrier × leg matches an entry — never a fail, because the same pair can
 * be structurally valid under other constructions and eligibility depends
 * on the ticketing product's partner rules.
 *
 * Semantics:
 *   - `since`  when the gap opened (route ceased), `YYYY` or `YYYY-MM`.
 *   - `until`  when the gap closed (resumption), or null while still open.
 *              Closed entries stay for history; trips starting after
 *              `until` do not warn (e.g. UA resumed TPE–GUM 2025-04).
 *   - Every entry MUST cite at least one source URL. Entries are added only
 *     for pairs someone actually assumed — incomplete by construction,
 *     recheck each rules version.
 */
export const NetworkGapEntrySchema = z.object({
  carrier: z.string().regex(/^[A-Z0-9]{2}$/, 'carrier must be a 2-character IATA airline code'),
  pair: z.tuple([
    z.string().regex(/^[A-Z]{3}$/, 'pair endpoints must be IATA codes'),
    z.string().regex(/^[A-Z]{3}$/, 'pair endpoints must be IATA codes'),
  ]),
  status: z.enum(['not-flown']),
  since: z.string().regex(/^\d{4}(-\d{2})?$/, 'since must be YYYY or YYYY-MM'),
  until: z.string().regex(/^\d{4}(-\d{2})?$/, 'until must be YYYY or YYYY-MM').nullable(),
  action: z.enum(['warn']),
  confidence: z.enum(['chart-verified', 'community-corrected']),
  evidence: z.array(z.string().url()).min(1),
});
export type NetworkGapEntry = z.infer<typeof NetworkGapEntrySchema>;

export const NetworkGapCatalogSchema = z
  .object({
    version: z.string().regex(/^\d{4}\.[1-4]$/),
    lastVerified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    gaps: z.array(NetworkGapEntrySchema).min(1),
  })
  .superRefine((catalog, ctx) => {
    // Cross-row uniqueness: one entry per carrier + unordered city pair.
    const seen = new Set<string>();
    for (const [idx, gap] of catalog.gaps.entries()) {
      const key = [gap.carrier, ...[...gap.pair].sort()].join('|');
      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate network gap entry: ${gap.carrier} ${gap.pair[0]}-${gap.pair[1]}`,
          path: ['gaps', idx],
        });
      }
      seen.add(key);
    }
  });
export type NetworkGapCatalog = z.infer<typeof NetworkGapCatalogSchema>;

/**
 * Loader seam for public/data/network-gaps/current.json. The declared
 * return type is the compile-time contract, mirroring parseAirportCatalog().
 */
export function parseNetworkGapCatalog(raw: unknown): NetworkGapCatalog {
  return NetworkGapCatalogSchema.parse(raw);
}
