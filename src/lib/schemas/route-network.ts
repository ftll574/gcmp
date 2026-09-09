import { z } from 'zod';

// Route observations deliberately contain no weekdays or seat inventory.
const DateSchema = z.iso.date();
const SourceIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const SourceUrlSchema = z.string().url().refine((url) => url.startsWith('https://'), 'HTTPS source required');
const FlightDesignatorSchema = z.string().regex(/^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/);

export const RouteNetworkSourceSchema = z.object({
  id: SourceIdSchema,
  url: SourceUrlSchema,
  checkedOn: DateSchema,
  publishedOn: DateSchema.optional(),
  note: z.string().min(1),
}).strict();
export type RouteNetworkSource = z.infer<typeof RouteNetworkSourceSchema>;

/** Carrier-level denominator readiness is intentionally separate from route
 * rows. `complete` is a strong claim: every directional nonstop route in the
 * stated carrier universe must be represented by source-backed evidence.
 * Anything less stays `partial`; there is no "near complete" shortcut. */
export const CarrierRouteUniverseSchema = z.object({
  carrier: z.string().regex(/^[A-Z0-9]{2,3}$/),
  scope: z.enum(['partial', 'complete']),
  asOf: DateSchema,
  directionalRouteDenominator: z.number().int().positive().optional(),
  sourceIds: z.array(SourceIdSchema).min(1),
  note: z.string().min(1),
}).strict().superRefine((universe, ctx) => {
  if (new Set(universe.sourceIds).size !== universe.sourceIds.length) {
    ctx.addIssue({ code: 'custom', path: ['sourceIds'], message: 'Duplicate source reference' });
  }
  if (universe.scope === 'complete' && universe.directionalRouteDenominator === undefined) {
    ctx.addIssue({ code: 'custom', path: ['directionalRouteDenominator'], message: 'Complete carrier universe requires an exact directional route denominator' });
  }
  if (universe.scope === 'partial' && universe.directionalRouteDenominator !== undefined) {
    ctx.addIssue({ code: 'custom', path: ['directionalRouteDenominator'], message: 'Partial carrier universe cannot claim a route denominator' });
  }
});
export type CarrierRouteUniverse = z.infer<typeof CarrierRouteUniverseSchema>;

export const RouteNetworkEntrySchema = z.object({
  carrier: z.string().regex(/^[A-Z0-9]{2,3}$/),
  pair: z.tuple([z.string().regex(/^[A-Z]{3}$/), z.string().regex(/^[A-Z]{3}$/)]),
  service: z.literal('nonstop'),
  /** `identity-unresolved` preserves a sourced route relationship that is no
   * longer safe to present as a current plannable carrier-route because no
   * same-carrier commercial designator can be corroborated. */
  status: z.enum(['published', 'suspended', 'identity-unresolved']),
  /** A listed/marketing carrier is useful for route discovery but is not
   * automatically the operating carrier. Dated/operator evidence must
   * promote it before itinerary persistence. */
  carrierIdentity: z.enum(['operating', 'provider-listed']).optional(),
  /** Exact designators backed strongly enough for route planning. They still
   * do not assert a weekday, time, award seat, or date-specific operation. */
  flightNumbers: z.array(FlightDesignatorSchema).optional(),
  flightNumberSourceIds: z.array(SourceIdSchema).optional(),
  /** Useful designators from standing/marketing/reference layers that need a
   * date/operator recheck before itinerary persistence. */
  flightNumberCandidates: z.array(FlightDesignatorSchema).optional(),
  flightNumberCandidateSourceIds: z.array(SourceIdSchema).optional(),
  sourceIds: z.array(SourceIdSchema).min(1),
  effectiveFrom: DateSchema.optional(),
  effectiveUntil: DateSchema.optional(),
}).strict().superRefine((entry, ctx) => {
  if (entry.pair[0] === entry.pair[1]) {
    ctx.addIssue({ code: 'custom', path: ['pair'], message: 'Endpoints must differ' });
  }
  if (entry.effectiveFrom && entry.effectiveUntil && entry.effectiveFrom > entry.effectiveUntil) {
    ctx.addIssue({ code: 'custom', path: ['effectiveUntil'], message: 'Inverted validity window' });
  }
  if (new Set(entry.sourceIds).size !== entry.sourceIds.length) {
    ctx.addIssue({ code: 'custom', path: ['sourceIds'], message: 'Duplicate source reference' });
  }
  const expectedPrefix = entry.carrier.toUpperCase();
  for (const [field, numbers] of [
    ['flightNumbers', entry.flightNumbers ?? []],
    ['flightNumberCandidates', entry.flightNumberCandidates ?? []],
  ] as const) {
    if (new Set(numbers).size !== numbers.length) {
      ctx.addIssue({ code: 'custom', path: [field], message: 'Duplicate flight designator' });
    }
    numbers.forEach((number, index) => {
      if (!number.startsWith(expectedPrefix) || !/^\d{1,4}[A-Z]?$/.test(number.slice(expectedPrefix.length))) {
        ctx.addIssue({ code: 'custom', path: [field, index], message: `Flight designator must match carrier ${expectedPrefix}` });
      }
    });
  }
  const confirmed = new Set(entry.flightNumbers ?? []);
  if ((entry.flightNumberCandidates ?? []).some((number) => confirmed.has(number))) {
    ctx.addIssue({ code: 'custom', path: ['flightNumberCandidates'], message: 'Confirmed and candidate flight designators must not overlap' });
  }
  for (const [numbersField, sourceField, numbers, sourceIds] of [
    ['flightNumbers', 'flightNumberSourceIds', entry.flightNumbers ?? [], entry.flightNumberSourceIds ?? []],
    ['flightNumberCandidates', 'flightNumberCandidateSourceIds', entry.flightNumberCandidates ?? [], entry.flightNumberCandidateSourceIds ?? []],
  ] as const) {
    if (numbers.length > 0 && sourceIds.length === 0) {
      ctx.addIssue({ code: 'custom', path: [sourceField], message: `${numbersField} requires source references` });
    }
    if (numbers.length === 0 && sourceIds.length > 0) {
      ctx.addIssue({ code: 'custom', path: [sourceField], message: `${sourceField} requires flight designators` });
    }
    if (new Set(sourceIds).size !== sourceIds.length) {
      ctx.addIssue({ code: 'custom', path: [sourceField], message: 'Duplicate flight-number source reference' });
    }
  }
});
export type RouteNetworkEntry = z.infer<typeof RouteNetworkEntrySchema>;

export const RouteNetworkCatalogSchema = z.object({
  version: z.string().regex(/^\d{4}\.[1-4]$/),
  coverage: z.literal('curated-not-complete'),
  sources: z.array(RouteNetworkSourceSchema).min(1),
  carrierUniverses: z.array(CarrierRouteUniverseSchema).default([]),
  routes: z.array(RouteNetworkEntrySchema),
}).strict().superRefine((catalog, ctx) => {
  const sources = new Set<string>();
  catalog.sources.forEach((source, index) => {
    if (sources.has(source.id)) ctx.addIssue({ code: 'custom', path: ['sources', index, 'id'], message: 'Duplicate source ID' });
    if (source.publishedOn && source.publishedOn > source.checkedOn) {
      ctx.addIssue({ code: 'custom', path: ['sources', index, 'publishedOn'], message: 'Source was not published when checked' });
    }
    sources.add(source.id);
  });
  const routes = new Set<string>();
  catalog.routes.forEach((route, index) => {
    const key = `${route.carrier}:${route.pair.join('-')}`;
    if (routes.has(key)) ctx.addIssue({ code: 'custom', path: ['routes', index], message: 'Duplicate directional route' });
    routes.add(key);
    route.sourceIds.forEach((id) => {
      if (!sources.has(id)) ctx.addIssue({ code: 'custom', path: ['routes', index, 'sourceIds'], message: `Unknown source ${id}` });
    });
    for (const [field, ids] of [
      ['flightNumberSourceIds', route.flightNumberSourceIds ?? []],
      ['flightNumberCandidateSourceIds', route.flightNumberCandidateSourceIds ?? []],
    ] as const) {
      ids.forEach((id) => {
        if (!sources.has(id)) ctx.addIssue({ code: 'custom', path: ['routes', index, field], message: `Unknown source ${id}` });
      });
    }
  });
  const universes = new Set<string>();
  catalog.carrierUniverses.forEach((universe, index) => {
    if (universes.has(universe.carrier)) {
      ctx.addIssue({ code: 'custom', path: ['carrierUniverses', index, 'carrier'], message: 'Duplicate carrier universe' });
    }
    universes.add(universe.carrier);
    universe.sourceIds.forEach((id) => {
      if (!sources.has(id)) ctx.addIssue({ code: 'custom', path: ['carrierUniverses', index, 'sourceIds'], message: `Unknown source ${id}` });
    });
    if (universe.scope === 'complete') {
      const represented = catalog.routes.filter((route) => route.carrier === universe.carrier
        && route.status === 'published'
        && (!route.effectiveFrom || universe.asOf >= route.effectiveFrom)
        && (!route.effectiveUntil || universe.asOf <= route.effectiveUntil)).length;
      if (universe.directionalRouteDenominator !== represented) {
        ctx.addIssue({
          code: 'custom',
          path: ['carrierUniverses', index, 'directionalRouteDenominator'],
          message: `Complete carrier universe denominator ${String(universe.directionalRouteDenominator)} does not match ${represented} active published directional routes`,
        });
      }
    }
  });
});
export type RouteNetworkCatalog = z.infer<typeof RouteNetworkCatalogSchema>;

/** Reject airport typos before they can create an unselectable destination. */
export function parseRouteNetworkCatalog(raw: unknown, knownAirports?: ReadonlySet<string>): RouteNetworkCatalog {
  const catalog = RouteNetworkCatalogSchema.parse(raw);
  if (knownAirports) {
    for (const route of catalog.routes) {
      for (const code of route.pair) {
        if (!knownAirports.has(code)) throw new Error(`route-network: unknown airport ${code}`);
      }
    }
  }
  return catalog;
}
