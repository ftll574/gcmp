import type { DatedFlight, DatedScheduleDay, ScheduleIssue } from '../schemas/dated-schedules.ts';
import type { PublishedFlight, TimetableReference } from '../schemas/published-schedules.ts';

export interface FlightDayView {
  readonly status: 'scheduled' | 'published' | 'none' | 'unknown';
  readonly flights: ReadonlyArray<DatedFlight>;
  readonly published?: ReadonlyArray<PublishedFlight>;
  readonly references?: ReadonlyArray<TimetableReference>;
  readonly issue?: ScheduleIssue;
}

/** Positives need flight evidence; negatives additionally need complete coverage.
 * Filtering happens AFTER the provider's route query, so marketing carriers
 * or an incomplete response cannot manufacture negative availability. */
export function flightDayView(day: DatedScheduleDay | undefined, carriers: ReadonlySet<string>, now: number): FlightDayView {
  if (!day) return { status: 'unknown', flights: [], issue: 'not-queried' };
  const published = (day.published ?? []).filter((flight) => carriers.has(flight.carrier)
    && Date.parse(flight.source.checkedAt) <= now + 60000 && Date.parse(flight.source.reviewBy) > now
    && (!flight.operatorEvidence || (Date.parse(flight.operatorEvidence.checkedAt) <= now + 60000
      && Date.parse(flight.operatorEvidence.reviewBy) > now)));
  // Route-wide public evidence is useful, but its airlineCode may be a
  // marketing code. Never pass it through the operating-carrier filter.
  const references = (day.references ?? []).filter((flight) =>
    Date.parse(flight.source.checkedAt) <= now + 60000 && Date.parse(flight.source.reviewBy) > now);
  const liveFresh = Date.parse(day.expiresAt) > now && Date.parse(day.checkedAt) <= now + 60000;
  // A fresh, complete live query outranks a partial published timetable.
  if (published.length > 0 && !(day.complete && liveFresh)) {
    const flights = liveFresh && (!day.issue || day.issue === 'partial') ? day.flights.filter((flight) => carriers.has(flight.carrier)) : [];
    return { status: flights.length > 0 ? 'scheduled' : 'published', flights, published, ...(references.length ? { references } : {}), issue: 'partial' };
  }
  if (references.length > 0 && !day.complete && (!day.issue || ['partial', 'operator-unverified'].includes(day.issue))) {
    const flights = liveFresh ? day.flights.filter((flight) => carriers.has(flight.carrier)) : [];
    return { status: flights.length ? 'scheduled' : 'unknown', flights, references, issue: 'operator-unverified' };
  }
  if (day.issue && day.issue !== 'partial') return { status: 'unknown', flights: [], issue: day.issue };
  if (Date.parse(day.expiresAt) <= now || Date.parse(day.checkedAt) > now + 60000) {
    return { status: 'unknown', flights: [], issue: 'stale' };
  }
  const flights = day.flights.filter((flight) => carriers.has(flight.carrier));
  if (flights.length > 0) return { status: 'scheduled', flights, ...(!day.complete ? { issue: 'partial' as const } : {}) };
  if (day.complete) return { status: 'none', flights: [] };
  return { status: 'unknown', flights: [], issue: day.issue ?? 'partial' };
}

export function flightContactText(flight: DatedFlight): string {
  return `${flight.carrier}${flight.flightNumber} | ${flight.from} → ${flight.to}\n${flight.departureLocal.replace('T', ' ')} → ${flight.arrivalLocal.replace('T', ' ')} (local times)\nPublished schedule only. Please confirm award-seat availability and ticketing rules with the airline.`;
}
