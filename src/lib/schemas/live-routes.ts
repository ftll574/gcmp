import { z } from 'zod';

const IataAirportSchema = z.string().regex(/^[A-Z]{3}$/);
const IataCarrierSchema = z.string().regex(/^[A-Z0-9]{2,3}$/);
const IsoDateTimeSchema = z.iso.datetime({ offset: true });

export const LiveRouteCarrierSchema = z.object({
  code: IataCarrierSchema,
  name: z.string().min(1).max(120),
  days: z.array(z.enum(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])).max(7),
  seasonalNote: z.string().max(300).nullable(),
}).strict();

export const LiveRouteSchema = z.object({
  from: IataAirportSchema,
  to: IataAirportSchema,
  status: z.literal('active'),
  seasonalityLabel: z.string().max(120).nullable(),
  carriers: z.array(LiveRouteCarrierSchema).max(100),
  sourceUrl: z.string().url().refine((url) => url.startsWith('https://air-routes.com/r/')),
}).strict();

export const LiveRouteResponseSchema = z.object({
  version: z.literal(1),
  origin: IataAirportSchema,
  source: z.object({
    name: z.literal('air-routes.com current scheduled passenger routes'),
    url: z.literal('https://air-routes.com/developers'),
  }).strict(),
  checkedAt: IsoDateTimeSchema,
  expiresAt: IsoDateTimeSchema,
  routes: z.array(LiveRouteSchema).max(1500),
}).strict();

export type LiveRouteCarrier = z.infer<typeof LiveRouteCarrierSchema>;
export type LiveRoute = z.infer<typeof LiveRouteSchema>;
export type LiveRouteResponse = z.infer<typeof LiveRouteResponseSchema>;
