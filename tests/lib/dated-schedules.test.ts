import { describe, expect, test } from 'vitest';
import { addCalendarDays, datesBetween, isCalendarDate, monthDates, shiftCalendarMonth } from '../../src/lib/calendar-date.ts';
import { FlightQuerySchema, FlightQueryResponseSchema } from '../../src/lib/schemas/dated-schedules.ts';
import { flightDayView } from '../../src/lib/rtw/dated-flight-status.ts';
import { CLOCK, fixtureDay, fixtureFlight, fixtureResponse } from '../fixtures/dated-schedules.ts';

const query = { from: 'TPE', to: 'HKG', start: '2026-09-01', end: '2026-09-30' };
const carriers = new Set(['CX']);
describe('calendar date contracts', () => {
  test.each(['2024-02-29', '2026-09-05', '2026-12-31'])('accepts real date %s', (date) => expect(isCalendarDate(date)).toBe(true));
  test.each(['2026-02-29', '2026-04-31', '2026-13-01', '20260905', '2026-09-05Z'])('rejects invalid date %s', (date) => expect(isCalendarDate(date)).toBe(false));
  test('month and day arithmetic respects leap years and year boundaries', () => {
    expect(monthDates('2024-02')).toHaveLength(29);
    expect(monthDates('2026-02')).toHaveLength(28);
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftCalendarMonth('2026-01', -1)).toBe('2025-12');
  });
  test('rejects unbounded or reversed ranges and same-airport queries', () => {
    expect(() => datesBetween('2026-09-01', '2026-10-02')).toThrow();
    expect(() => datesBetween('2026-09-07', '2026-09-01')).toThrow();
    expect(FlightQuerySchema.safeParse({ ...query, to: 'TPE' }).success).toBe(false);
    expect(FlightQuerySchema.safeParse({ ...query, url: 'https://evil.invalid' }).success).toBe(false);
  });
});
describe('date-specific evidence', () => {
  test('malformed confirmation and duplicated flights cannot enter the client calendar', () => {
    const single = { ...query, start: '2026-09-07', end: '2026-09-07' };
    for (const day of [
      fixtureDay(undefined, { complete: false, issue: 'provider-error' }),
      fixtureDay(undefined, { expiresAt: new Date(CLOCK + 3600000).toISOString() }),
      fixtureDay(undefined, { flights: [fixtureFlight(), fixtureFlight()] }),
    ]) expect(FlightQueryResponseSchema.safeParse({ ...fixtureResponse(single), days: [day] }).success).toBe(false);
    expect(flightDayView(fixtureDay(undefined, { complete: false }), carriers, CLOCK).issue).toBe('partial');
  });
  test('a fresh known flight is positive', () => expect(flightDayView(fixtureDay(), carriers, CLOCK).status).toBe('scheduled'));
  test('only a complete fresh response can yield a negative', () => {
    expect(flightDayView(fixtureDay(undefined, { flights: [] }), carriers, CLOCK).status).toBe('none');
    expect(flightDayView(fixtureDay(undefined, { complete: false, flights: [] }), carriers, CLOCK).status).toBe('unknown');
    expect(flightDayView(undefined, carriers, CLOCK).status).toBe('unknown');
  });
  test('operator filtering cannot turn incomplete coverage into no flights', () => {
    expect(flightDayView(fixtureDay(undefined, { complete: false }), new Set(['BR']), CLOCK).status).toBe('unknown');
    expect(flightDayView(fixtureDay(), new Set(['BR']), CLOCK).status).toBe('none');
  });
  test('partial results can prove existence, not complete counts', () => {
    const result = flightDayView(fixtureDay(undefined, { complete: false, issue: 'partial' }), carriers, CLOCK);
    expect(result.status).toBe('scheduled'); expect(result.issue).toBe('partial');
  });
  test('stale positives and stale negatives become unknown', () => {
    expect(flightDayView(fixtureDay(), carriers, CLOCK + 900001).status).toBe('unknown');
    expect(flightDayView(fixtureDay(undefined, { flights: [] }), carriers, CLOCK + 900001).status).toBe('unknown');
    expect(flightDayView(fixtureDay(), carriers, CLOCK - 120000).status).toBe('unknown');
  });
  test('response dates and route must match exactly; gaps/duplicates are invalid', () => {
    const result = fixtureResponse(query);
    expect(FlightQueryResponseSchema.safeParse(result).success).toBe(true);
    expect(FlightQueryResponseSchema.safeParse({ ...result, days: result.days.slice(1) }).success).toBe(false);
    expect(FlightQueryResponseSchema.safeParse({ ...result, days: result.days.map(() => result.days[0]) }).success).toBe(false);
    expect(FlightQueryResponseSchema.safeParse({ ...result, query: { ...query, to: 'NRT' } }).success).toBe(false);
  });
  test('arrival calendar dates may differ or go backwards across the date line', () => {
    const result = fixtureResponse({ ...query, start: '2026-09-07', end: '2026-09-07' });
    result.days[0]!.flights[0] = fixtureFlight('2026-09-07', { arrivalLocal: '2026-09-06T23:40' });
    expect(FlightQueryResponseSchema.safeParse(result).success).toBe(true);
    result.days[0]!.flights[0]!.departureLocal = '2026-09-08T00:01';
    expect(FlightQueryResponseSchema.safeParse(result).success).toBe(false);
  });
});
