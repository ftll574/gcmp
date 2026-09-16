import { z } from 'zod';

/**
 * Zod schema for `public/data/DATA_MANIFEST.json` — the single machine-
 * readable catalog of every data file the app ships.
 *
 * The manifest makes the data layer auditable: for each file it records
 * what kind it is (hand-maintained input, derived build product, or query
 * shard), which script produced it (null for curated inputs), its license /
 * source, and the exact bytes + sha256 so CI can detect drift.
 *
 * `bytes`/`sha256` are computed from the real file on disk by
 * `scripts/build-data-manifest.ts`, so editing this schema never requires
 * rechecking sizes by hand.
 */

const LICENSE_VALUES = [
  'ODbL-1.0',
  'Public-Domain',
  'OGDL-1.0',
  'pending-confirmation',
  'site-terms', // standing terms of a vendor/portal (STARLUX API, AeroRoutes, 華航 PDF …)
  'commercial-contract', // paid data feeds (Aviation Edge, OAG/Cirium, AeroDataBox)
] as const;
export type DataLicense = (typeof LICENSE_VALUES)[number];

const KIND_VALUES = ['input', 'derived', 'shard', 'meta'] as const;
export type DataKind = (typeof KIND_VALUES)[number];

const DataManifestEntrySchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  kind: z.enum(KIND_VALUES),
  producer: z.string().min(1).nullable(), // scripts/build-*.ts | null for hand-collected inputs
  inputs: z.array(z.string()).default([]),
  source: z.string().min(1), // human-readable provenance; see THIRD_PARTY_NOTICES.md
  license: z.enum(LICENSE_VALUES),
  attribution: z.string().nullable().default(null),
  schema: z.string().nullable().default(null), // src/lib/schemas/*.ts or null
  bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[0-9a-f]{16}$/), // 64-hex prefix (16 chars)
  notes: z.string().default(''),
});

export const DataManifestSchema = z.object({
  version: z.string().min(1),
  generatedAt: z.string().min(1), // ISO date (YYYY-MM-DD)
  datasets: z.array(DataManifestEntrySchema),
});

export type DataManifest = z.infer<typeof DataManifestSchema>;
export type DataManifestEntry = z.infer<typeof DataManifestEntrySchema>;

export function parseDataManifest(raw: unknown): DataManifest {
  return DataManifestSchema.parse(raw);
}