import { z } from 'zod';

/**
 * Flight schedule catalog (`public/data/schedules/current.json`,
 * docs/decisions/flight-schedule-model.md S3).
 *
 * Tiny, evidence-graded list of directional schedules a Taiwan-first RTW
 * planner can rely on: which weekdays a carrier operates a city pair.
 * The engine uses it ONLY for day-level warnings (`schedule-day-mismatch`)
 * — a schedule conflict makes a trip unbookable, not illegal, so it is
 * never a fail (network-gaps rationale). The UI owns the hard guarantee:
 * date pickers disable non-operating days for pairs WITH an entry, while
 * pairs WITHOUT one keep a free date input plus a 「班表未知」 badge —
 * coverage is partial by design (free complete schedule data does not
 * exist; OAG is paid and OpenFlights routes carry no weekdays), so
 * unverified pairs are omitted, never guessed.
 *
 * Semantics:
 *   - `pair` is ORDERED from→to — schedules are directional; the engine
 *     does exact lookups only and never reverses a pair.
 *   - `daysOfWeek` ISO weekday numbers: Monday=1 … Sunday=7, non-empty
 *     unique subset of 1..7.
 *   - `seasonStart`/`seasonEnd` are MM-DD strings (IATA season windows).
 *   - `effectiveFrom`/`effectiveUntil` bound when the entry was true
 *     (YYYY-MM-DD); `until` nullable while still current.
 *   - `status: 'suspended'` entries stay in the catalog for history but
 *     emit NO day-level finding (network-gaps owns "route gone" semantics).
 *   - Every entry MUST cite at least one source URL.
 */
export const ScheduleEntrySchema = z
  .object({
    carrier: z.string().regex(/^[A-Z0-9]{2}$/, 'carrier must be a 2-character IATA airline code'),
    pair: z.tuple([
      z.string().regex(/^[A-Z]{3}$/, 'pair endpoints must be IATA codes'),
      z.string().regex(/^[A-Z]{3}$/, 'pair endpoints must be IATA codes'),
    ]),
    daysOfWeek: z
      .array(z.number().int().min(1).max(7))
      .min(1, 'daysOfWeek must be a non-empty subset of ISO weekdays 1..7'),
    flightNumbers: z.array(z.string()).optional(),
    seasonStart: z.string().regex(/^\d{2}-\d{2}$/, 'seasonStart must be MM-DD').optional(),
    seasonEnd: z.string().regex(/^\d{2}-\d{2}$/, 'seasonEnd must be MM-DD').optional(),
    effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'effectiveFrom must be YYYY-MM-DD').optional(),
    effectiveUntil: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'effectiveUntil must be YYYY-MM-DD')
      .nullable()
      .optional(),
    status: z.enum(['operating', 'seasonal', 'suspended']),
    confidence: z.enum(['chart-verified', 'community-corrected']),
    sourceUrls: z.array(z.string().url()).min(1),
    notes: z
      .union([z.array(z.string()), z.string().transform((s) => [s])])
      .optional(),
  })
  .superRefine((entry, ctx) => {
    // Duplicate weekdays carry no extra information and usually signal a
    // transcription slip — reject them outright.
    if (new Set(entry.daysOfWeek).size !== entry.daysOfWeek.length) {
      ctx.addIssue({
        code: 'custom',
        message: `daysOfWeek contains duplicates: ${entry.daysOfWeek.join(', ')}`,
        path: ['daysOfWeek'],
      });
    }
  });
export type ScheduleEntry = z.infer<typeof ScheduleEntrySchema>;

export const ScheduleCatalogSchema = z
  .object({
    version: z.string().regex(/^\d{4}\.[1-4]$/),
    lastVerified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    entries: z.array(ScheduleEntrySchema).min(1),
  })
  .superRefine((catalog, ctx) => {
    // ISO dates sort lexicographically, so string comparison is exact here.
    for (const [idx, entry] of catalog.entries.entries()) {
      const { effectiveFrom, effectiveUntil } = entry;
      if (
        effectiveFrom !== undefined &&
        effectiveUntil !== undefined &&
        effectiveUntil !== null && // null = still current / open-ended
        effectiveFrom > effectiveUntil
      ) {
        ctx.addIssue({
          code: 'custom',
          message: `effectiveFrom ${effectiveFrom} is after effectiveUntil ${effectiveUntil}`,
          path: ['entries', idx, 'effectiveFrom'],
        });
      }
    }

    // Cross-row uniqueness: one entry per carrier + ordered pair + season
    // window. The same carrier+pair MAY appear twice with DIFFERENT season
    // windows (winter vs summer timetables) — that is the point of the
    // window fields, not a duplicate.
    const seen = new Set<string>();
    for (const [idx, entry] of catalog.entries.entries()) {
      const key = [
        entry.carrier,
        entry.pair[0],
        entry.pair[1],
        entry.seasonStart ?? '',
        entry.seasonEnd ?? '',
      ].join('|');
      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate schedule entry: ${entry.carrier} ${entry.pair[0]}-${entry.pair[1]} (${entry.seasonStart ?? ''}-${entry.seasonEnd ?? ''})`,
          path: ['entries', idx],
        });
      }
      seen.add(key);
    }
  });
export type ScheduleCatalog = z.infer<typeof ScheduleCatalogSchema>;

/**
 * Loader seam for public/data/schedules/current.json. The declared return
 * type is the compile-time contract, mirroring parseNetworkGapCatalog().
 */
export function parseScheduleCatalog(raw: unknown): ScheduleCatalog {
  return ScheduleCatalogSchema.parse(raw);
}
