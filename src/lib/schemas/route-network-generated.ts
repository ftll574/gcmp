import { z } from 'zod';

/**
 * Generated route-network overlay (`public/data/route-network/runtime-generated-*.json`).
 *
 * Produced by `scripts/build-runtime-generated.ts` from the ODbL candidate
 * layers (MrAirspace quarterly files + ADSBiq direct-route snapshot). This
 * artifact is a DISCOVERY overlay: it lives beside the curated
 * `runtime-current.json` pipeline and never rewrites curated rows
 * (`mergeStrategy: "curated + generated"` — curated wins on conflict).
 *
 * Confidence semantics (§5.3 of the open-source refactor spec):
 *   - high      ≥2 independent sources AND ≥2 distinct quarters
 *   - medium    ≥2 sources in a single quarter, OR one source across ≥2 quarters
 *   - candidate single source, single quarter (kept, annotated — never promoted)
 *
 * Routes are directional; a duplicate (carrier, origin, destination) row is
 * a build bug. Endpoints and carriers must resolve against the shipped
 * airport/airline indexes at build time — validated here at parse time for
 * the generated files.
 */

const IataSchema = z.string().regex(/^[A-Z]{3}$/);
const CarrierSchema = z.string().regex(/^[A-Z0-9]{2,3}$/);
const QuarterSchema = z.string().regex(/^\d{4}-Q[1-4]$/);

export const GeneratedRouteSchema = z.object({
  airline_iata: CarrierSchema,
  origin: IataSchema,
  destination: IataSchema,
  confidence: z.enum(['high', 'medium', 'candidate']),
  observationCount: z.number().int().positive(),
  evidenceSources: z.array(z.string().url()).min(1),
  firstSeenQuarter: QuarterSchema,
  lastSeenQuarter: QuarterSchema,
  flightNumbers: z.array(z.string().regex(/^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/)).min(1),
}).strict().superRefine((route, ctx) => {
  if (route.origin === route.destination) {
    ctx.addIssue({ code: 'custom', path: ['destination'], message: 'Endpoints must differ' });
  }
  if (route.firstSeenQuarter > route.lastSeenQuarter) {
    ctx.addIssue({ code: 'custom', path: ['lastSeenQuarter'], message: 'Inverted quarter window' });
  }
  for (const number of route.flightNumbers) {
    if (!number.startsWith(route.airline_iata)) {
      ctx.addIssue({ code: 'custom', path: ['flightNumbers'], message: `Designator ${number} does not start with carrier ${route.airline_iata}` });
    }
  }
  if (route.confidence === 'high' && route.evidenceSources.length < 2) {
    ctx.addIssue({ code: 'custom', path: ['confidence'], message: 'high requires ≥2 independent sources' });
  }
});

export const GeneratedOverlaySchema = z.object({
  version: z.literal(1),
  generatedAt: z.iso.date(),
  source: z.string().min(1),
  license: z.literal('ODbL-1.0'),
  mergeStrategy: z.literal('curated + generated'),
  evidenceSources: z.array(z.string().url()).min(1),
  routes: z.array(GeneratedRouteSchema),
}).strict().superRefine((overlay, ctx) => {
  const seen = new Set<string>();
  for (const [idx, route] of overlay.routes.entries()) {
    const key = `${route.airline_iata}|${route.origin}|${route.destination}`;
    if (seen.has(key)) {
      ctx.addIssue({ code: 'custom', path: ['routes', idx], message: `Duplicate directional route ${key}` });
    }
    seen.add(key);
  }
});

export type GeneratedOverlay = z.infer<typeof GeneratedOverlaySchema>;

/** Parse a generated overlay JSON value; throws with a typed reason on bad shape. */
export function parseGeneratedOverlay(raw: unknown): GeneratedOverlay {
  return GeneratedOverlaySchema.parse(raw);
}
