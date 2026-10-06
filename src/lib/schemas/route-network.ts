import { isKnownAirport } from '../airport-identity.ts';
import {routeWithinExplicitServiceWindow} from '../rtw/route-date-semantics.ts';
import { z } from 'zod';
import { carrierIdentityKey, carrierRouteKey } from '../carrier-identity.ts';

export const CarrierEntityKeySchema = z.string().regex(/^[A-Z]{2}\+[A-Z0-9]{3}\+[a-z0-9]+(?:-[a-z0-9]+)*$/);
/** IATA 2F is a controlled duplicate; code-only records have no safe entity identity. */
const SHARED_IATA_CODES = new Set(['2F']);

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
  /** Exact source cutoff for short-lived snapshot evidence; after this UTC instant it is stale. */
  freshUntilUTC: z.iso.datetime({ offset: true }).refine((value) => value.endsWith('Z'), 'Freshness deadline must be UTC').optional(),
  /** Generator review policy, never a passenger service period. */
  routeReviewWindow: z.object({from:DateSchema,until:DateSchema,basis:z.literal('generated-freshness-policy')}).strict().refine(w=>w.from<=w.until,'Inverted source review window').optional(),
  note: z.string().min(1),
}).strict();
export type RouteNetworkSource = z.infer<typeof RouteNetworkSourceSchema>;

/** Carrier-level denominator readiness is intentionally separate from route
 * rows. `complete` is a strong claim: every directional nonstop route in the
 * stated carrier universe must be represented by source-backed evidence.
 * Anything less stays `partial`; there is no "near complete" shortcut. */
export const CarrierRouteUniverseSchema = z.object({
  carrier: z.string().regex(/^[A-Z0-9]{2,3}$/),
  carrierEntityKey: CarrierEntityKeySchema.optional(),
  carrierEntityName: z.string().min(1).optional(),
  scope: z.enum(['partial', 'complete']),
  asOf: DateSchema,
  directionalRouteDenominator: z.number().int().positive().optional(),
  sourceIds: z.array(SourceIdSchema).min(1),
  note: z.string().min(1),
}).strict().superRefine((universe, ctx) => {
  if (SHARED_IATA_CODES.has(universe.carrier) && !universe.carrierEntityKey) ctx.addIssue({ code: 'custom', path: ['carrierEntityKey'], message: `Shared IATA code ${universe.carrier} requires a qualified carrier entity key` });
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
  carrierEntityKey: CarrierEntityKeySchema.optional(),
  carrierEntityName: z.string().min(1).optional(),
  pair: z.tuple([z.string().regex(/^[A-Z]{3}$/), z.string().regex(/^[A-Z]{3}$/)]),
  service: z.literal('nonstop'),
  /** Registered plans are evidence only; never upgrade carrier identity, confirmed designators or dated selectable services. */
  registeredPlans: z.array(z.object({registrationId:z.string().min(1),registeredOperator:z.string().regex(/^[A-Z0-9]{2,3}$/),registeredOperatorICAO:z.string().regex(/^[A-Z]{3}$/).optional(),carrierEntityKey:CarrierEntityKeySchema.optional(),flightNumberRaw:z.string().regex(/^\d{1,4}$/),effectiveFrom:DateSchema,effectiveUntil:DateSchema,weekdays:z.array(z.number().int().min(1).max(7)).min(1),departureUTC:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),arrivalUTC:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),arrivalDayOffset:z.null(),codeshareRaw:z.string().optional(),codeshareCompleteness:z.literal('unknown').optional(),stageNumber:z.number().int().positive().optional(),versionConflict:z.boolean().optional(),confidence:z.literal('high-confidence-schema-inference'),sourceId:SourceIdSchema}).strict()).optional(),
  /** `identity-unresolved` preserves a sourced route relationship that is no
   * longer safe to present as a current plannable carrier-route because no
   * same-carrier commercial designator can be corroborated. */
  status: z.enum(['published', 'suspended', 'identity-unresolved']),
  /** A listed/marketing carrier is useful for route discovery but is not
   * automatically the operating carrier. Dated/operator evidence must
   * promote it before itinerary persistence. */
  carrierIdentity: z.enum(['operating', 'provider-listed', 'unknown']).optional(),
  /** Independently reviewed official directional nonstop route evidence.
   * Allows listed-carrier discovery without a designator; never proves the
   * actual operator or a dated flight. Unmarked provider graphs stay gated. */
  routeEvidence: z.literal('official-directed').optional(),
  /** Route-level admission; registered-plan enrichment must never attach to this row. */
  routeEvidenceScope: z.literal('route-only').optional(),
  /** Exact designators backed strongly enough for route planning. They still
   * do not assert a weekday, time, award seat, or date-specific operation. */
  flightNumbers: z.array(FlightDesignatorSchema).optional(),
  flightNumberSourceIds: z.array(SourceIdSchema).optional(),
  /** Source-specific dated scheduled operating-carrier observations. These
   * designators are current only while the source is fresh and at least one
   * recorded schedule occurrence remains in the future. */
  timeBoundFlightNumbers: z.array(z.object({
    flightNumber: FlightDesignatorSchema,
    sourceId: SourceIdSchema,
    candidateSourceIds: z.array(SourceIdSchema).min(1),
    occurrencesUTC: z.array(z.iso.datetime({ offset: true }).refine((value) => value.endsWith('Z'), 'Occurrence timestamp must be UTC')).min(1),
  }).strict()).optional(),
  /** Useful designators from standing/marketing/reference layers that need a
   * date/operator recheck before itinerary persistence. */
  flightNumberCandidates: z.array(FlightDesignatorSchema).optional(),
  flightNumberCandidateSourceIds: z.array(SourceIdSchema).optional(),
  sourceIds: z.array(SourceIdSchema).min(1),
  effectiveFrom: DateSchema.optional(),
  effectiveUntil: DateSchema.optional(),
}).strict().superRefine((entry, ctx) => {
  if (SHARED_IATA_CODES.has(entry.carrier) && !entry.carrierEntityKey) ctx.addIssue({ code: 'custom', path: ['carrierEntityKey'], message: `Shared IATA code ${entry.carrier} requires a qualified carrier entity key` });
  if (entry.pair[0] === entry.pair[1]) {
    ctx.addIssue({ code: 'custom', path: ['pair'], message: 'Endpoints must differ' });
  }
  if (entry.routeEvidenceScope === 'route-only' && (entry.carrierIdentity !== 'provider-listed' || entry.routeEvidence !== 'official-directed' || entry.registeredPlans !== undefined || entry.flightNumbers !== undefined || entry.flightNumberCandidates !== undefined || entry.effectiveFrom !== undefined || entry.effectiveUntil !== undefined)) {
    ctx.addIssue({ code: 'custom', path: ['routeEvidenceScope'], message: 'Route-only evidence must remain an undated provider-listed relationship without plan or flight-number promotion' });
  }
  if (entry.effectiveFrom && entry.effectiveUntil && entry.effectiveFrom > entry.effectiveUntil) {
    ctx.addIssue({ code: 'custom', path: ['effectiveUntil'], message: 'Inverted validity window' });
  }
  if (new Set(entry.sourceIds).size !== entry.sourceIds.length) {
    ctx.addIssue({ code: 'custom', path: ['sourceIds'], message: 'Duplicate source reference' });
  }
  for (const plan of entry.registeredPlans ?? []) {
    if ((plan.registeredOperator !== entry.carrier && !(entry.carrierEntityKey && plan.registeredOperatorICAO === entry.carrierEntityKey.split('+')[1])) || (entry.carrierEntityKey && (plan.carrierEntityKey !== entry.carrierEntityKey || plan.registeredOperatorICAO !== entry.carrierEntityKey.split('+')[1])) || (plan.carrierEntityKey !== undefined && plan.carrierEntityKey !== entry.carrierEntityKey) || plan.effectiveFrom > plan.effectiveUntil || new Set(plan.weekdays).size !== plan.weekdays.length) ctx.addIssue({code:'custom',path:['registeredPlans'],message:'Invalid registered plan operator, entity, interval or weekdays'});
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
    ['flightNumbers', 'flightNumberSourceIds', (entry.flightNumbers ?? []).filter((number) => !(entry.timeBoundFlightNumbers ?? []).some((evidence) => evidence.flightNumber === number)), entry.flightNumberSourceIds ?? []],
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
    const key = carrierRouteKey(route, ...route.pair);
    if (routes.has(key)) ctx.addIssue({ code: 'custom', path: ['routes', index], message: 'Duplicate directional route' });
    routes.add(key);
    for(const plan of route.registeredPlans ?? []) if(!route.sourceIds.includes(plan.sourceId)) ctx.addIssue({code:'custom',path:['routes',index,'registeredPlans'],message:'Registered plan requires route source reference'});
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
  const routeSources = new Map(catalog.sources.map(source => [source.id, source]));
  const identityByCode = new Map<string, Set<string>>();
  for (const [routeIndex, route] of catalog.routes.entries()) {
    const datedNumbers = new Set<string>();
    for (const [evidenceIndex, evidence] of (route.timeBoundFlightNumbers ?? []).entries()) {
      const source = routeSources.get(evidence.sourceId);
      if (!source || !source.freshUntilUTC) {
        ctx.addIssue({ code: 'custom', path: ['routes', routeIndex, 'timeBoundFlightNumbers', evidenceIndex, 'sourceId'], message: 'Time-bound flight number requires a source with an explicit freshness deadline' });
      }
      if (!(route.flightNumbers ?? []).includes(evidence.flightNumber)) {
        ctx.addIssue({ code: 'custom', path: ['routes', routeIndex, 'timeBoundFlightNumbers', evidenceIndex, 'flightNumber'], message: 'Time-bound evidence must refer to a confirmed flight number' });
      }
      if (datedNumbers.has(evidence.flightNumber)) {
        ctx.addIssue({ code: 'custom', path: ['routes', routeIndex, 'timeBoundFlightNumbers', evidenceIndex], message: 'Duplicate time-bound flight number evidence' });
      }
      datedNumbers.add(evidence.flightNumber);
      if (!(route.flightNumberCandidates ?? []).every((number) => number !== evidence.flightNumber)) {
        ctx.addIssue({ code: 'custom', path: ['routes', routeIndex, 'timeBoundFlightNumbers', evidenceIndex], message: 'Time-bound confirmed numbers may not remain in the candidate list' });
      }
      if (new Set(evidence.candidateSourceIds).size !== evidence.candidateSourceIds.length) {
        ctx.addIssue({ code: 'custom', path: ['routes', routeIndex, 'timeBoundFlightNumbers', evidenceIndex, 'candidateSourceIds'], message: 'Duplicate pre-promotion candidate source reference' });
      }
      for (const sourceId of evidence.candidateSourceIds) {
        if (!sources.has(sourceId)) ctx.addIssue({ code: 'custom', path: ['routes', routeIndex, 'timeBoundFlightNumbers', evidenceIndex, 'candidateSourceIds'], message: `Unknown pre-promotion candidate source ${sourceId}` });
      }
      if (new Set(evidence.occurrencesUTC).size !== evidence.occurrencesUTC.length) {
        ctx.addIssue({ code: 'custom', path: ['routes', routeIndex, 'timeBoundFlightNumbers', evidenceIndex, 'occurrencesUTC'], message: 'Duplicate observed flight time' });
      }
    }
    const identities = identityByCode.get(route.carrier) ?? new Set<string>();
    identities.add(carrierIdentityKey(route));
    identityByCode.set(route.carrier, identities);
  }
  for (const [code, identities] of identityByCode) {
    if (identities.size > 1 && catalog.routes.some(route => route.carrier === code && !route.carrierEntityKey)) {
      ctx.addIssue({ code: 'custom', path: ['routes'], message: `Ambiguous shared carrier code ${code} requires qualified entity keys on every route` });
    }
  }
  const universes = new Set<string>();
  catalog.carrierUniverses.forEach((universe, index) => {
    const universeKey = carrierIdentityKey(universe);
    if (universes.has(universeKey)) {
      ctx.addIssue({ code: 'custom', path: ['carrierUniverses', index, 'carrier'], message: 'Duplicate carrier universe' });
    }
    universes.add(universeKey);
    universe.sourceIds.forEach((id) => {
      if (!sources.has(id)) ctx.addIssue({ code: 'custom', path: ['carrierUniverses', index, 'sourceIds'], message: `Unknown source ${id}` });
    });
    if (universe.scope === 'complete') {
      const represented = catalog.routes.filter((route) => carrierIdentityKey(route) === universeKey
        && route.status === 'published'
        && routeWithinExplicitServiceWindow(route, universe.asOf, routeSources)).length;
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
        if (!isKnownAirport(code, knownAirports)) throw new Error(`route-network: unknown airport ${code}`);
      }
    }
  }
  return catalog;
}
