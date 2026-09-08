import { z } from 'zod';
import { isCalendarDate } from '../calendar-date.ts';

const DateValue = z.string().refine(isCalendarDate, 'Expected a real calendar date');
const TimeValue = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const PublicationSourceSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url().refine((url) => url.startsWith('https://')),
  kind: z.enum(['airline-publication', 'government-timetable', 'industry-timetable']),
  checkedAt: z.string().datetime(),
  reviewBy: z.string().datetime(),
  publishedOn: DateValue.optional(),
}).strict().superRefine((source, ctx) => {
  const interval = Date.parse(source.reviewBy) - Date.parse(source.checkedAt);
  if (interval <= 0 || interval > 31 * 86400000) ctx.addIssue({ code: 'custom', message: 'Review window must be positive and at most 31 days' });
  if (source.publishedOn && source.publishedOn > source.checkedAt.slice(0, 10)) ctx.addIssue({ code: 'custom', message: 'Publication cannot postdate verification' });
});
export type PublicationSource = z.infer<typeof PublicationSourceSchema>;

/**
 * Exact operating flight designators published by an airline for one
 * directional airport pair, but without enough timetable detail to claim an
 * operating weekday/date. These are selectable planning hints; date/time
 * availability stays unknown until a dated schedule lookup confirms them.
 */
export const FlightNumberReferenceSchema = z.object({
  id: z.string().min(1),
  carrier: z.string().regex(/^[A-Z0-9]{2}$/),
  from: z.string().regex(/^[A-Z]{3}$/),
  to: z.string().regex(/^[A-Z]{3}$/),
  flightNumbers: z.array(z.string().regex(/^\d{1,4}[A-Z]?$/)).min(1),
  sourceId: z.string().min(1),
  note: z.string().min(1).optional(),
}).strict().superRefine((row, ctx) => {
  if (row.from === row.to) ctx.addIssue({ code: 'custom', message: 'Reference route must be directional' });
  if (new Set(row.flightNumbers).size !== row.flightNumbers.length) ctx.addIssue({ code: 'custom', message: 'Duplicate flight numbers' });
});
export type FlightNumberReference = z.infer<typeof FlightNumberReferenceSchema>;

/** A dated occurrence derived from an identified official publication, NOT
 * a live lookup. A date is useful even when the source omits the clock time.
 * Missing arrival dates/times stay absent; never invent midnight or +1. */
const TimetableFields = {
  flightNumber: z.string().regex(/^\d{1,4}[A-Z]?$/),
  from: z.string().regex(/^[A-Z]{3}$/), to: z.string().regex(/^[A-Z]{3}$/),
  date: DateValue,
  departureTime: TimeValue.optional(),
  arrivalTime: TimeValue.optional(), arrivalDate: DateValue.optional(),
  effectiveFrom: DateValue, effectiveUntil: DateValue,
  source: PublicationSourceSchema,
};
export const PublishedFlightSchema = z.object({
  carrier: z.string().regex(/^[A-Z0-9]{2}$/), ...TimetableFields,
  /** Independent evidence that the displayed carrier is the operator.
   * Optional for airline-owned publications whose source already establishes
   * the operator; required by the TDX adapter before promoting a reference. */
  operatorEvidence: PublicationSourceSchema.optional(),
}).strict().superRefine((flight, ctx) => {
  if (flight.from === flight.to || flight.date < flight.effectiveFrom || flight.date > flight.effectiveUntil) {
    ctx.addIssue({ code: 'custom', message: 'Flight must fall within its directional publication window' });
  }
});
export type PublishedFlight = z.infer<typeof PublishedFlightSchema>;

/** Published dates/flight designators without established operating identity.
 * Deliberately NO `carrier`: this is not assignable to FlightSelection and must
 * never populate an itinerary's operatingCarrier or alliance eligibility. */
export const TimetableReferenceSchema = z.object({
  airlineCode: z.string().regex(/^[A-Z0-9]{2}$/),
  operatorStatus: z.enum(['unverified', 'known-other-operator']),
  knownOperatingCarrier: z.string().regex(/^[A-Z0-9]{2}$/).optional(),
  operatorEvidence: PublicationSourceSchema.optional(),
  ...TimetableFields,
}).strict().superRefine((flight, ctx) => {
  if (flight.from === flight.to || flight.date < flight.effectiveFrom || flight.date > flight.effectiveUntil) {
    ctx.addIssue({ code: 'custom', message: 'Reference must fall within its directional publication window' });
  }
  if (flight.operatorStatus === 'known-other-operator' && (!flight.knownOperatingCarrier || !flight.operatorEvidence)) {
    ctx.addIssue({ code: 'custom', message: 'Known-other-operator reference requires carrier and evidence' });
  }
  if (flight.operatorStatus === 'unverified' && (flight.knownOperatingCarrier || flight.operatorEvidence)) {
    ctx.addIssue({ code: 'custom', message: 'Unverified reference cannot claim an operator' });
  }
});
export type TimetableReference = z.infer<typeof TimetableReferenceSchema>;

export const OfficialServiceSchema = z.object({
  id: z.string().min(1), carrier: z.string().regex(/^[A-Z0-9]{2}$/),
  flightNumber: z.string().regex(/^\d{1,4}[A-Z]?$/),
  from: z.string().regex(/^[A-Z]{3}$/), to: z.string().regex(/^[A-Z]{3}$/),
  effectiveFrom: DateValue, effectiveUntil: DateValue,
  daysOfWeek: z.array(z.number().int().min(1).max(7)).max(7),
  addedDates: z.array(DateValue).default([]), removedDates: z.array(DateValue).default([]),
  departureTime: TimeValue.optional(), arrivalTime: TimeValue.optional(),
  arrivalDayOffset: z.number().int().min(-1).max(2).optional(),
  sourceId: z.string().min(1),
}).strict().superRefine((row, ctx) => {
  if (row.from === row.to || row.effectiveFrom > row.effectiveUntil) ctx.addIssue({ code: 'custom', message: 'Invalid route or validity window' });
  if (new Set(row.daysOfWeek).size !== row.daysOfWeek.length) ctx.addIssue({ code: 'custom', message: 'Duplicate weekdays' });
  if (new Set(row.addedDates).size !== row.addedDates.length || new Set(row.removedDates).size !== row.removedDates.length) ctx.addIssue({ code: 'custom', message: 'Duplicate exceptions' });
  if (row.addedDates.some((date) => row.removedDates.includes(date))) ctx.addIssue({ code: 'custom', message: 'Conflicting date exceptions' });
  if ([...row.addedDates, ...row.removedDates].some((date) => date < row.effectiveFrom || date > row.effectiveUntil)) ctx.addIssue({ code: 'custom', message: 'Exception outside validity window' });
  if (row.arrivalDayOffset !== undefined && row.arrivalTime === undefined) ctx.addIssue({ code: 'custom', message: 'Arrival offset requires a published arrival time' });
});
export type OfficialService = z.infer<typeof OfficialServiceSchema>;
export const OfficialScheduleCatalogSchema = z.object({
  version: z.literal(1),
  sources: z.record(z.string(), PublicationSourceSchema),
  services: z.array(OfficialServiceSchema),
  flightNumberReferences: z.array(FlightNumberReferenceSchema).default([]),
}).strict().superRefine((catalog, ctx) => {
  const ids = new Set<string>();
  for (const row of catalog.services) {
    if (ids.has(row.id) || !catalog.sources[row.sourceId]) ctx.addIssue({ code: 'custom', message: 'Duplicate service ID or missing source' });
    ids.add(row.id);
  }
  for (const row of catalog.flightNumberReferences) {
    if (ids.has(row.id) || !catalog.sources[row.sourceId]) ctx.addIssue({ code: 'custom', message: 'Duplicate reference ID or missing source' });
    ids.add(row.id);
  }
});
export type OfficialScheduleCatalog = z.infer<typeof OfficialScheduleCatalogSchema>;
