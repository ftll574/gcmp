/**
 * Zod schema for the per-program ¢/mile valuations JSON.
 *
 *   data/valuations/v{YYYY.Q}.json + current.json
 *
 * Values are in US cents per mile. Used by the EarningPanel to render a
 * cash-equivalent chip next to each program's total. Source: The Points
 * Guy monthly valuations + community estimates for programs TPG doesn't
 * formally value (most Asian carriers).
 *
 * Honesty: values are sticker prices, not personalized — surfaced as
 * "~$X at {valuation}¢/mi" with a tooltip explaining the source.
 */

import { z } from 'zod';

export const ValuationsSchema = z.object({
  source: z.string().min(1),
  sourceUrl: z.string().url(),
  /** YYYY.Q rules version, decoupled from earning-rules version. */
  version: z.string().regex(/^\d{4}\.[1-4]$/),
  lastVerified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Keyed by ProgramId, value is ¢/mile (e.g. 1.6 = 1.6 cents per mile). */
  valuations: z.record(z.string(), z.number().positive().max(50)),
  notes: z.array(z.string()).optional(),
});
export type Valuations = z.infer<typeof ValuationsSchema>;
