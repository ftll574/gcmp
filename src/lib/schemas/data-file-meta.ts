import { z } from 'zod';

/**
 * Data-file provenance metadata (`public/data/airlines.meta.json` and
 * `public/data/airports.meta.json`).
 *
 * These files sit NEXT TO the plain-array data files they describe. The
 * arrays themselves keep their bare shape on purpose — the calibration
 * suite (`tests/calibration/flyertalk-routings.test.ts`) and the runtime
 * loader parse them as top-level arrays, and that Iron-Rule file may not
 * be edited. Provenance therefore lives beside the data, never inside it.
 *
 * Semantics:
 *   - `source`      where the rows were collected from. Until the repo
 *                   owner confirms the exact origin, this stays
 *                   `"unattributed (pending confirmation)"`.
 *   - `license`     SPDX-style identifier of the data license. `pending` is
 *                   a placeholder, never a legal claim.
 *   - `attribution` optional human-readable attribution line required by
 *                   the source, or null when none is required.
 */
export const DataFileMetaSchema = z.object({
  source: z.string().min(1),
  license: z.string().min(1),
  attribution: z.string().nullable(),
});
export type DataFileMeta = z.infer<typeof DataFileMetaSchema>;

export function parseDataFileMeta(raw: unknown): DataFileMeta {
  return DataFileMetaSchema.parse(raw);
}
