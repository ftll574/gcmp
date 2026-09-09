import { z } from 'zod';

export const LandingShowcaseAirportSchema = z.object({
  iata: z.string().regex(/^[A-Z]{3}$/),
  name: z.string().min(1),
  city: z.string().min(1),
  country: z.string().regex(/^[A-Z]{2}$/),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

export const LandingShowcaseLegSchema = z.object({
  from: z.string().regex(/^[A-Z]{3}$/),
  to: z.string().regex(/^[A-Z]{3}$/),
  carrier: z.string().regex(/^[A-Z0-9]{2,3}$/),
  carrierName: z.string().min(1),
  flightNumber: z.string().regex(/^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/),
  distanceNm: z.number().int().positive(),
});

export const LandingShowcaseSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  alliance: z.enum(['star', 'oneworld', 'skyteam', 'mixed']),
  titleZh: z.string().min(1),
  titleEn: z.string().min(1),
  eyebrowZh: z.string().min(1),
  eyebrowEn: z.string().min(1),
  descriptionZh: z.string().min(1),
  descriptionEn: z.string().min(1),
  legs: z.array(LandingShowcaseLegSchema).min(2),
});

export const LandingShowcaseCatalogSchema = z.object({
  version: z.literal(1),
  builtOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  routeNetworkVersion: z.union([z.string(), z.number()]).transform(String),
  stats: z.object({
    publishedRoutes: z.number().int().positive(),
    allianceMembers: z.number().int().positive(),
    alliances: z.literal(3),
  }),
  airports: z.array(LandingShowcaseAirportSchema).min(4),
  showcases: z.array(LandingShowcaseSchema).min(4),
}).superRefine((catalog, ctx) => {
  const airportCodes = new Set<string>();
  for (const [index, airport] of catalog.airports.entries()) {
    if (airportCodes.has(airport.iata)) {
      ctx.addIssue({ code: 'custom', path: ['airports', index, 'iata'], message: `Duplicate landing airport ${airport.iata}` });
    }
    airportCodes.add(airport.iata);
  }

  const showcaseIds = new Set<string>();
  for (const [showcaseIndex, showcase] of catalog.showcases.entries()) {
    if (showcaseIds.has(showcase.id)) {
      ctx.addIssue({ code: 'custom', path: ['showcases', showcaseIndex, 'id'], message: `Duplicate showcase ${showcase.id}` });
    }
    showcaseIds.add(showcase.id);
    for (const [legIndex, leg] of showcase.legs.entries()) {
      if (!airportCodes.has(leg.from) || !airportCodes.has(leg.to)) {
        ctx.addIssue({
          code: 'custom',
          path: ['showcases', showcaseIndex, 'legs', legIndex],
          message: `Landing leg references an unknown airport: ${leg.from}-${leg.to}`,
        });
      }
    }
  }
});

export type LandingShowcaseAirport = z.infer<typeof LandingShowcaseAirportSchema>;
export type LandingShowcaseLeg = z.infer<typeof LandingShowcaseLegSchema>;
export type LandingShowcase = z.infer<typeof LandingShowcaseSchema>;
export type LandingShowcaseCatalog = z.infer<typeof LandingShowcaseCatalogSchema>;
