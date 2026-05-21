/**
 * Zod schema for loyalty-program earning-rule JSON files.
 *
 *   data/programs/{programId}/v{YYYY.Q}.json
 *
 * Honesty disclaimer is structural: every carrier entry carries a
 * `confidence` field. `chart-verified` means we transcribed the airline's
 * published partner chart; `community-corrected` means we patched the chart
 * against actual statement postings reported in FlyerTalk threads.
 *
 * v1 ships only `chart-verified` entries. The published chart and what
 * actually posts to statements regularly disagree — community-corrected
 * entries are v1.1+ work.
 */

import { z } from 'zod';

export const CabinSchema = z.enum(['economy', 'premium-economy', 'business', 'first']);
export type Cabin = z.infer<typeof CabinSchema>;

export const ConfidenceSchema = z.enum(['chart-verified', 'community-corrected']);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const FareBucketSchema = z.object({
  cabin: CabinSchema,
  pqm: z.number(),
  rdm: z.number(),
  minPerSegment: z.number().int().default(0),
  notes: z.array(z.string()).optional(),
});
export type FareBucket = z.infer<typeof FareBucketSchema>;

export const CarrierRulesSchema = z.object({
  label: z.string().min(1),
  earningModel: z.enum(['distance-multiplier', 'fixed-percentage', 'revenue-based']),
  confidence: ConfidenceSchema,
  /** Per-fare-class buckets. Keyed by 1-letter fare code (Y, B, J, C, D, I, …). */
  fareBuckets: z.record(z.string(), FareBucketSchema),
  /**
   * Which letter to use as the default for each cabin in v1. The UI exposes
   * only "cabin"; the engine resolves to a representative letter via this map.
   * v1.1 will add a fare-letter selector to let the user override.
   * Partial: a carrier may not serve every cabin.
   */
  defaultLetterByCabin: z.partialRecord(CabinSchema, z.string().length(1)),
  notes: z.array(z.string()).optional(),
});
export type CarrierRules = z.infer<typeof CarrierRulesSchema>;

export const ProgramSchema = z.object({
  program: z.string().min(1),
  label: z.string().min(1),
  alliance: z.string().optional(),
  /** Rules version. Format: `YYYY.Q` (e.g. `2026.4`). */
  version: z.string().regex(/^\d{4}\.[1-4]$/),
  sourceUrl: z.string().url(),
  /** ISO date the rules were last verified against the source. */
  lastVerified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Keyed by operating-carrier IATA code (2 chars, uppercase). */
  carriers: z.record(z.string(), CarrierRulesSchema),
  globalNotes: z.array(z.string()).optional(),
});
export type Program = z.infer<typeof ProgramSchema>;
