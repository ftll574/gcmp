import { addCalendarDays, datesBetween } from '../calendar-date.ts';
import { FlightQuerySchema, type FlightQuery, type FlightQueryResponse } from '../schemas/dated-schedules.ts';
import { type OfficialScheduleCatalog, type PublishedFlight } from '../schemas/published-schedules.ts';
import { isoWeekday } from './schedule-days.ts';

/** A missing flight in a partial publication never asserts route-wide absence.
 * Effective dates + explicit exceptions determine occurrences, reviewBy only
 * controls evidence freshness. Consulting a bundled file does not re-verify it. */
export function publishedFlightsOn(catalog: OfficialScheduleCatalog, query: Pick<FlightQuery, 'from' | 'to'>, date: string, now: number): PublishedFlight[] {
  const flights = new Map<string, PublishedFlight>();
  const conflicts = new Set<string>();
  for (const row of catalog.services) {
    const source = catalog.sources[row.sourceId];
    if (!source || Date.parse(source.reviewBy) <= now || Date.parse(source.checkedAt) > now + 60000) continue;
    if (row.from !== query.from || row.to !== query.to || date < row.effectiveFrom || date > row.effectiveUntil) continue;
    if (row.removedDates.includes(date) || (!row.addedDates.includes(date) && !row.daysOfWeek.includes(isoWeekday(date)))) continue;
    const flight: PublishedFlight = {
      carrier: row.carrier, flightNumber: row.flightNumber, from: row.from, to: row.to, date,
      effectiveFrom: row.effectiveFrom, effectiveUntil: row.effectiveUntil, source,
      ...(row.departureTime !== undefined ? { departureTime: row.departureTime } : {}),
      ...(row.arrivalTime !== undefined ? { arrivalTime: row.arrivalTime } : {}),
      ...(row.arrivalDayOffset !== undefined ? { arrivalDate: addCalendarDays(date, row.arrivalDayOffset) } : {}),
    };
    const key = `${row.carrier}:${row.flightNumber}`;
    const previous = flights.get(key);
    if (previous && (previous.departureTime !== flight.departureTime || previous.arrivalTime !== flight.arrivalTime || previous.arrivalDate !== flight.arrivalDate)) conflicts.add(key);
    flights.set(key, flight);
  }
  for (const key of conflicts) flights.delete(key);
  return [...flights.values()].sort((a, b) => (a.departureTime ?? '99:99').localeCompare(b.departureTime ?? '99:99') || a.carrier.localeCompare(b.carrier) || a.flightNumber.localeCompare(b.flightNumber));
}

export function queryOfficialSchedules(catalog: OfficialScheduleCatalog, input: FlightQuery, now: number): FlightQueryResponse {
  const query = FlightQuerySchema.parse(input);
  return {
    version: 1, query,
    source: { name: 'Official timetable publications', url: 'https://www.ana.co.jp/en/kr/plan-book/routes/international-route-information/' },
    days: datesBetween(query.start, query.end).map((date) => ({
      date, complete: false, flights: [], published: publishedFlightsOn(catalog, query, date, now),
      checkedAt: new Date(now).toISOString(), expiresAt: new Date(now + 900000).toISOString(),
      issue: 'partial',
    })),
  };
}

/** A fresh COMPLETE day is authoritative; no static publication overrides a
 * live negative. Partial positives dedupe by operating flight number. */
export function mergeOfficialSchedules(primary: FlightQueryResponse, fallback: FlightQueryResponse, now: number): FlightQueryResponse {
  if (JSON.stringify(primary.query) !== JSON.stringify(fallback.query)) {
    if (Object.entries(primary.query).some(([key, value]) => fallback.query[key as keyof FlightQuery] !== value)) throw new Error('Mismatched schedule queries');
  }
  const byDate = new Map(fallback.days.map((day) => [day.date, day]));
  return { ...primary, days: primary.days.map((day) => {
    const fresh = Date.parse(day.expiresAt) > now && Date.parse(day.checkedAt) <= now + 60000;
    if (day.complete && fresh) return day;
    const occupied = new Set((fresh ? day.flights : []).map((flight) => `${flight.carrier}:${flight.flightNumber}`));
    const observations = [...(day.published ?? []), ...(byDate.get(day.date)?.published ?? [])];
    const unique = new Map<string, PublishedFlight>();
    for (const flight of observations) {
      const key = `${flight.carrier}:${flight.flightNumber}`;
      if (occupied.has(key) || unique.has(key)) continue;
      if (Date.parse(flight.source.reviewBy) <= now || Date.parse(flight.source.checkedAt) > now + 60000) continue;
      unique.set(key, flight); // Fresh primary TDX detail outranks a date-only fallback.
    }
    return { ...day, published: [...unique.values()] };
  }) };
}
