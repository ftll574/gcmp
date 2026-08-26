import { z } from 'zod';

/**
 * Country → continent base map (`public/data/geo/current.json`).
 *
 * Decision record: docs/decisions/continents-visited.md — UN geoscheme
 * collapsed to 7 kebab-case continents at COUNTRY level, so both the UN
 * geoscheme and the political-capital convention agree on every
 * transcontinental case (RU→europe incl. Vladivostok, TR→asia, EG→africa,
 * KZ/GE/AZ/AM/CY→asia). Product-specific zone tables (e.g. oneworld's
 * "Middle East" claiming DZ/EG/LY) deliberately do NOT belong here; they
 * are a future per-product layer that consumes this neutral base.
 *
 * `airportOverrides` ships empty as a cheap escape hatch for genuinely
 * sub-national cases (e.g. Hawaiʻi); every override must justify itself
 * via a non-empty `reason`. The engine applies them (spec §8 Q5):
 * lookup order is override first, then the country row.
 */
export const ContinentSchema = z.enum([
  'africa',
  'antarctica',
  'asia',
  'europe',
  'north-america',
  'oceania',
  'south-america',
]);
export type ContinentId = z.infer<typeof ContinentSchema>;

export const AirportContinentOverrideSchema = z.object({
  iata: z.string().regex(/^[A-Z]{3}$/),
  continent: ContinentSchema,
  /** Required — every override must justify itself. */
  reason: z.string().min(1),
});
export type AirportContinentOverride = z.infer<typeof AirportContinentOverrideSchema>;

export const CountryContinentEntrySchema = z.object({
  country: z.string().regex(/^[A-Z]{2}$/, 'country must be an ISO 3166-1 alpha-2 code'),
  continent: ContinentSchema,
  /**
   * Optional second tier for the destinations explorer (contract §4):
   * UN-geoscheme-like subregion id, kebab-case (northeast-asia,
   * southeast-asia, …). Countries without a row simply hang directly
   * under their continent — the tier is additive, never required.
   */
  subregion: z
    .string()
    .regex(/^[a-z][a-z-]*$/, 'subregion must be kebab-case')
    .optional(),
});
export type CountryContinentEntry = z.infer<typeof CountryContinentEntrySchema>;

export const CountryContinentCatalogSchema = z
  .object({
    version: z.string().regex(/^\d{4}\.\d$/),
    convention: z.literal('un-geoscheme-country-level'),
    lastVerified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    sourceUrls: z.array(z.string().url()).min(1),
    mappings: z.array(CountryContinentEntrySchema),
    airportOverrides: z.array(AirportContinentOverrideSchema).default([]),
  })
  .superRefine((catalog, ctx) => {
    // Cross-row uniqueness: one deterministic row per country code.
    const seen = new Set<string>();
    for (const mapping of catalog.mappings) {
      if (seen.has(mapping.country)) {
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate country row: ${mapping.country}`,
        });
      }
      seen.add(mapping.country);
    }
  });
export type CountryContinentCatalog = z.infer<typeof CountryContinentCatalogSchema>;
