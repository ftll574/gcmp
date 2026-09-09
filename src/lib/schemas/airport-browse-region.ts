import { z } from 'zod';

/**
 * Airport-level browse-only geography for very large countries.
 *
 * This is intentionally separate from `geo/current.json`: continent and
 * country-subregion semantics are neutral route-planning geography, while
 * these regions exist only to keep the all-routes browser readable. They
 * MUST NOT be reused as fare zones, RTW rule regions, or ticketing logic.
 */
export const AirportBrowseRegionDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z][a-z-]*$/, 'browse region id must be kebab-case'),
  country: z.string().regex(/^[A-Z]{2}$/, 'country must be ISO alpha-2'),
});

export const AirportBrowseRegionEntrySchema = z.object({
  iata: z.string().regex(/^[A-Z]{3}$/),
  country: z.string().regex(/^[A-Z]{2}$/),
  subdivision: z.string().regex(/^[A-Z]{2}-[A-Z0-9]+(?:-[A-Z0-9]+)*$/),
  region: z.string().regex(/^[a-z][a-z-]*$/),
});

export const AirportBrowseRegionCatalogSchema = z.object({
  version: z.string().regex(/^\d{4}\.\d$/),
  convention: z.literal('ourairports-iso-region-browse-overlay'),
  checkedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sourceUrls: z.array(z.string().url()).min(1),
  note: z.string().min(1),
  regions: z.array(AirportBrowseRegionDefinitionSchema).min(1),
  airports: z.array(AirportBrowseRegionEntrySchema).min(1),
}).superRefine((catalog, ctx) => {
  const regions = new Map<string, string>();
  for (const [index, region] of catalog.regions.entries()) {
    if (regions.has(region.id)) {
      ctx.addIssue({ code: 'custom', path: ['regions', index, 'id'], message: `Duplicate browse region: ${region.id}` });
      continue;
    }
    regions.set(region.id, region.country);
  }

  const iatas = new Set<string>();
  for (const [index, airport] of catalog.airports.entries()) {
    if (iatas.has(airport.iata)) {
      ctx.addIssue({ code: 'custom', path: ['airports', index, 'iata'], message: `Duplicate browse airport: ${airport.iata}` });
    }
    iatas.add(airport.iata);
    const regionCountry = regions.get(airport.region);
    if (regionCountry === undefined) {
      ctx.addIssue({ code: 'custom', path: ['airports', index, 'region'], message: `Unknown browse region: ${airport.region}` });
    } else if (regionCountry !== airport.country) {
      ctx.addIssue({ code: 'custom', path: ['airports', index, 'country'], message: `Browse region ${airport.region} belongs to ${regionCountry}, not ${airport.country}` });
    }
    if (!airport.subdivision.startsWith(`${airport.country}-`)) {
      ctx.addIssue({ code: 'custom', path: ['airports', index, 'subdivision'], message: `Subdivision ${airport.subdivision} does not belong to ${airport.country}` });
    }
  }
});

export type AirportBrowseRegionCatalog = z.infer<typeof AirportBrowseRegionCatalogSchema>;
export type AirportBrowseRegionEntry = z.infer<typeof AirportBrowseRegionEntrySchema>;
