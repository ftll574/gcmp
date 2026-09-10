import { z } from 'zod';

const IataAirportSchema = z.string().regex(/^[A-Z]{3}$/);
const IataCarrierSchema = z.string().regex(/^[A-Z0-9]{2,3}$/);
const IsoDateTimeSchema = z.iso.datetime({ offset: true });
const WeekdaySchema = z.enum(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
const LocalClockSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

export const LiveRouteWeeklyScheduleSchema = z.object({
  day: WeekdaySchema,
  /** Provider-published local departure clocks. Empty means the provider
   * lists the operating weekday but does not publish a departure time. */
  times: z.array(LocalClockSchema).max(40),
}).strict().superRefine((row, ctx) => {
  if (new Set(row.times).size !== row.times.length) {
    ctx.addIssue({ code: 'custom', path: ['times'], message: 'Duplicate weekly departure time' });
  }
});

export const LiveRouteCarrierSchema = z.object({
  code: IataCarrierSchema,
  name: z.string().min(1).max(120),
  days: z.array(WeekdaySchema).max(7),
  /** Current weekly provider signal only. This is intentionally NOT a dated
   * operating-flight claim and cannot populate an itinerary by itself. */
  weeklySchedule: z.array(LiveRouteWeeklyScheduleSchema).max(7).default([]),
  seasonalNote: z.string().max(300).nullable(),
}).strict().superRefine((carrier, ctx) => {
  if (new Set(carrier.days).size !== carrier.days.length) {
    ctx.addIssue({ code: 'custom', path: ['days'], message: 'Duplicate operating weekday' });
  }
  const weeklyDays = carrier.weeklySchedule.map((row) => row.day);
  if (new Set(weeklyDays).size !== weeklyDays.length) {
    ctx.addIssue({ code: 'custom', path: ['weeklySchedule'], message: 'Duplicate weekly schedule day' });
  }
  // Empty weeklySchedule remains accepted for backward-compatible parsing of
  // older cached v1 responses. Once schedule rows are present they must agree
  // exactly with the legacy `days` summary.
  if (weeklyDays.length > 0 && (weeklyDays.length !== carrier.days.length || weeklyDays.some((day, index) => day !== carrier.days[index]))) {
    ctx.addIssue({ code: 'custom', path: ['weeklySchedule'], message: 'Weekly schedule days must match days summary' });
  }
});

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
export type LiveRouteWeeklySchedule = z.infer<typeof LiveRouteWeeklyScheduleSchema>;
export type LiveRoute = z.infer<typeof LiveRouteSchema>;
export type LiveRouteResponse = z.infer<typeof LiveRouteResponseSchema>;
