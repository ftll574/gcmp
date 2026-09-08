import { z } from 'zod';
import { datesBetween, isCalendarDate } from '../calendar-date.ts';
import { PublishedFlightSchema, TimetableReferenceSchema, type PublishedFlight } from './published-schedules.ts';

const DateSchema = z.string().refine(isCalendarDate, 'Expected a real YYYY-MM-DD date');
const AirportCode = z.string().regex(/^[A-Z]{3}$/);
const LocalTimeSchema = z.string().refine((value) =>
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) && isCalendarDate(value.slice(0, 10)),
  'Expected local YYYY-MM-DDTHH:mm without a timezone suffix',
);

export const FlightQuerySchema = z.object({
  from: AirportCode, to: AirportCode, start: DateSchema, end: DateSchema,
}).strict().superRefine((query, ctx) => {
  if (query.from === query.to) ctx.addIssue({ code: 'custom', message: 'Airports must differ' });
  try { datesBetween(query.start, query.end); }
  catch { ctx.addIssue({ code: 'custom', message: 'Invalid range (maximum 31 dates)' }); }
});
export type FlightQuery = z.infer<typeof FlightQuerySchema>;

export const DatedFlightSchema = z.object({
  carrier: z.string().regex(/^[A-Z0-9]{2}$/),
  flightNumber: z.string().regex(/^\d{1,4}[A-Z]?$/),
  from: AirportCode, to: AirportCode,
  departureLocal: LocalTimeSchema, arrivalLocal: LocalTimeSchema,
  departureZone: z.string().max(100).optional(), arrivalZone: z.string().max(100).optional(),
}).strict();
export type DatedFlight = z.infer<typeof DatedFlightSchema>;
export type FlightSelection = DatedFlight | PublishedFlight;

export function selectedDepartureDate(flight: FlightSelection): string {
  return 'date' in flight ? flight.date : flight.departureLocal.slice(0, 10);
}

export const ScheduleIssueSchema = z.enum([
  'not-configured', 'not-queried', 'out-of-range', 'provider-error', 'partial', 'stale', 'budget-exceeded', 'operator-unverified',
]);
export type ScheduleIssue = z.infer<typeof ScheduleIssueSchema>;

export const DatedScheduleDaySchema = z.object({
  date: DateSchema,
  complete: z.boolean(),
  checkedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  flights: z.array(DatedFlightSchema).max(2000),
  published: z.array(PublishedFlightSchema).max(2000).optional(),
  references: z.array(TimetableReferenceSchema).max(2000).optional(),
  issue: ScheduleIssueSchema.optional(),
}).strict().superRefine((day, ctx) => {
  if (Date.parse(day.expiresAt) < Date.parse(day.checkedAt)) ctx.addIssue({ code: 'custom', message: 'Invalid freshness window' });
  if (Date.parse(day.expiresAt) - Date.parse(day.checkedAt) > 900000) ctx.addIssue({ code: 'custom', message: 'Freshness cannot exceed 15 minutes' });
  if (day.complete && day.issue) ctx.addIssue({ code: 'custom', message: 'Incomplete/error result cannot assert complete coverage' });
  if (day.issue && day.issue !== 'partial' && day.flights.length > 0) ctx.addIssue({ code: 'custom', message: 'Error results cannot supply confirmed flights' });
  const identities = day.flights.map((flight) => `${flight.carrier}:${flight.flightNumber}:${flight.departureLocal}`);
  if (new Set(identities).size !== identities.length) ctx.addIssue({ code: 'custom', message: 'Duplicate operating flight' });
  if (day.flights.some((flight) => flight.departureLocal.slice(0, 10) !== day.date)) {
    ctx.addIssue({ code: 'custom', message: 'Flight departs on another local date' });
  }
  if (day.published?.some((flight) => flight.date !== day.date)) ctx.addIssue({ code: 'custom', message: 'Published occurrence on another date' });
  if (day.references?.some((flight) => flight.date !== day.date)) ctx.addIssue({ code: 'custom', message: 'Timetable reference on another date' });
  if (day.complete && day.references?.length) ctx.addIssue({ code: 'custom', message: 'Unresolved operating identities cannot assert complete coverage' });
});
export type DatedScheduleDay = z.infer<typeof DatedScheduleDaySchema>;

export const FlightQueryResponseSchema = z.object({
  version: z.literal(1), query: FlightQuerySchema,
  source: z.object({ name: z.string().min(1).max(100), url: z.string().url().refine((v) => v.startsWith('https://')) }).strict(),
  days: z.array(DatedScheduleDaySchema).max(31),
}).strict().superRefine((result, ctx) => {
  let expected: string[];
  try { expected = datesBetween(result.query.start, result.query.end); } catch { return; }
  const actual = result.days.map((day) => day.date);
  if (expected.length !== actual.length || expected.some((day, i) => day !== actual[i])) {
    ctx.addIssue({ code: 'custom', message: 'Days must cover the exact requested range, in order' });
  }
  for (const day of result.days) {
    if ([...day.flights, ...(day.published ?? []), ...(day.references ?? [])].some((flight) => flight.from !== result.query.from || flight.to !== result.query.to)) {
      ctx.addIssue({ code: 'custom', message: 'Flight does not match the requested ordered pair' });
    }
  }
});
export type FlightQueryResponse = z.infer<typeof FlightQueryResponseSchema>;
