import { z } from 'zod';

/**
 * China Airlines SkyTeam partner award ZONE MAP (Phase-12).
 *
 * Maps each airport to the CI §A8-era chart zone abbreviation it falls in
 * (NEA SEA SWA ME EU NAf SAf NAm CAm SAm SWP — the vocabulary published as
 * `zones[]` on the zone-pair product in public/data/award-pricing/
 * current.json). The zone-map JSON itself lands only after the research
 * pass; this schema ships first so resolver + panel work can proceed
 * against synthetic fixtures.
 *
 * The zone VOCABULARY is deliberately NOT pinned as a zod enum here: the
 * authoritative list lives once, in the era-pinned award-pricing catalog —
 * hardcoding it twice invites drift. A well-formed-but-unknown zone string
 * therefore parses at this level, and the canonical-set guard lives in
 * tests/lib/schemas/ci-zones.test.ts (every fixture/real zone ⊆ the 11
 * canonical names read from the catalog).
 *
 * Semantics (dual-confidence vocabulary, docs/process/chart-drift-checklist.md):
 *   - `confidence: 'chart-verified'`      — read straight off a captured chart.
 *   - `confidence: 'community-corrected'` — community correction layered on a
 *     captured chart (chart omitted or mis-zoned the airport).
 *   - Every entry MUST cite at least one source URL; repo convention keeps
 *     them https-only (enforced by test convention, not by z.string().url()).
 */
export const CiZoneAssignmentSchema = z.object({
  airport: z.string().regex(/^[A-Z]{3}$/, 'airport must be a 3-letter uppercase IATA code'),
  /** Chart zone abbreviation, 2..4 chars (canonical set guarded by tests). */
  zone: z.string().min(2).max(4),
  confidence: z.enum(['chart-verified', 'community-corrected']),
  sourceUrls: z.array(z.string().url()).min(1),
  notes: z
    .union([z.array(z.string()), z.string().transform((s) => [s])])
    .optional(),
});
export type CiZoneAssignment = z.infer<typeof CiZoneAssignmentSchema>;

export const CiZoneMapSchema = z
  .object({
    version: z.string().regex(/^\d{4}\.[1-4]$/),
    lastVerified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    assignments: z.array(CiZoneAssignmentSchema).min(1),
  })
  .superRefine((map, ctx) => {
    // One zone per airport: a duplicate IATA row is a transcription slip or
    // an unresolved research CONFLICT — reject outright rather than letting
    // array order silently pick a lookup winner.
    const seen = new Set<string>();
    for (const [idx, assignment] of map.assignments.entries()) {
      if (seen.has(assignment.airport)) {
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate airport assignment: ${assignment.airport}`,
          path: ['assignments', idx],
        });
      }
      seen.add(assignment.airport);
    }
  });
export type CiZoneMap = z.infer<typeof CiZoneMapSchema>;

/**
 * Loader seam for the CI zone-map JSON, mirroring parseScheduleCatalog().
 * The declared return type is the compile-time contract.
 */
export function parseCiZoneMap(raw: unknown): CiZoneMap {
  return CiZoneMapSchema.parse(raw);
}
