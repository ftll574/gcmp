import { z } from 'zod';

const CalendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Expected a real calendar date');
const LocalTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const Iata = z.string().regex(/^[A-Z]{3}$/);
const Carrier = z.string().regex(/^[A-Z0-9]{2}$/);
const FlightNumber = z.string().regex(/^\d{1,4}[A-Z]?$/);

export const SeasonalRtwSourceSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1),
  url: z.string().url().refine((url) => url.startsWith('https://')),
  kind: z.enum(['airline-publication', 'industry-timetable']),
  checkedOn: CalendarDate,
  note: z.string().min(1).optional(),
}).strict();

export const SeasonalFlightPatternSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  carrier: Carrier,
  flightNumber: FlightNumber,
  from: Iata,
  to: Iata,
  effectiveFrom: CalendarDate,
  effectiveUntil: CalendarDate,
  daysOfWeek: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  departureTime: LocalTime,
  arrivalTime: LocalTime,
  arrivalDayOffset: z.number().int().min(0).max(2),
  sourceIds: z.array(z.string().min(1)).min(1),
}).strict().superRefine((pattern, ctx) => {
  if (pattern.from === pattern.to || pattern.effectiveFrom > pattern.effectiveUntil) {
    ctx.addIssue({ code: 'custom', message: 'Invalid route or effective window' });
  }
  if (new Set(pattern.daysOfWeek).size !== pattern.daysOfWeek.length) {
    ctx.addIssue({ code: 'custom', message: 'Duplicate operating weekday' });
  }
  if (new Set(pattern.sourceIds).size !== pattern.sourceIds.length) {
    ctx.addIssue({ code: 'custom', message: 'Duplicate source id on pattern' });
  }
});

export const SeasonalRtwSegmentSchema = z.object({
  from: Iata,
  to: Iata,
  patternIds: z.array(z.string().min(1)).min(1),
}).strict().superRefine((segment, ctx) => {
  if (segment.from === segment.to) ctx.addIssue({ code: 'custom', message: 'Segment endpoints must differ' });
  if (new Set(segment.patternIds).size !== segment.patternIds.length) {
    ctx.addIssue({ code: 'custom', message: 'Duplicate pattern id on segment' });
  }
});

export const SeasonalRtwTemplateSchema = z.object({
  version: z.literal(1),
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  label: z.string().min(1),
  productId: z.string().min(1),
  checkedOn: CalendarDate,
  searchStart: CalendarDate,
  searchEnd: CalendarDate,
  minimumFullDaysAtStop: z.number().int().min(0).max(30),
  sources: z.array(SeasonalRtwSourceSchema).min(1),
  patterns: z.array(SeasonalFlightPatternSchema).min(1),
  segments: z.array(SeasonalRtwSegmentSchema).min(1),
}).strict().superRefine((template, ctx) => {
  if (template.searchStart > template.searchEnd) {
    ctx.addIssue({ code: 'custom', path: ['searchStart'], message: 'Search window is reversed' });
  }
  const sourceIds = new Set<string>();
  for (const [index, source] of template.sources.entries()) {
    if (sourceIds.has(source.id)) ctx.addIssue({ code: 'custom', path: ['sources', index, 'id'], message: 'Duplicate source id' });
    sourceIds.add(source.id);
  }
  const patterns = new Map<string, z.infer<typeof SeasonalFlightPatternSchema>>();
  for (const [index, pattern] of template.patterns.entries()) {
    if (patterns.has(pattern.id)) ctx.addIssue({ code: 'custom', path: ['patterns', index, 'id'], message: 'Duplicate pattern id' });
    patterns.set(pattern.id, pattern);
    if (pattern.effectiveFrom < template.searchStart || pattern.effectiveUntil > template.searchEnd) {
      ctx.addIssue({ code: 'custom', path: ['patterns', index], message: 'Pattern must stay inside template search window' });
    }
    for (const sourceId of pattern.sourceIds) {
      if (!sourceIds.has(sourceId)) ctx.addIssue({ code: 'custom', path: ['patterns', index, 'sourceIds'], message: `Unknown source ${sourceId}` });
    }
  }
  for (const [index, segment] of template.segments.entries()) {
    const previous = template.segments[index - 1];
    if (previous && previous.to !== segment.from) {
      ctx.addIssue({ code: 'custom', path: ['segments', index, 'from'], message: 'Segment chain is not contiguous' });
    }
    for (const patternId of segment.patternIds) {
      const pattern = patterns.get(patternId);
      if (!pattern) {
        ctx.addIssue({ code: 'custom', path: ['segments', index, 'patternIds'], message: `Unknown pattern ${patternId}` });
      } else if (pattern.from !== segment.from || pattern.to !== segment.to) {
        ctx.addIssue({ code: 'custom', path: ['segments', index, 'patternIds'], message: `Pattern ${patternId} does not match segment` });
      }
    }
  }
});

export type SeasonalRtwTemplate = z.infer<typeof SeasonalRtwTemplateSchema>;
export type SeasonalFlightPattern = z.infer<typeof SeasonalFlightPatternSchema>;
