import type { SeasonalFlightPattern, SeasonalRtwTemplate } from '../schemas/rtw-seasonal.ts';
import { isoWeekday } from './schedule-days.ts';

export interface SeasonalItineraryFlight {
  readonly patternId: string;
  readonly carrier: string;
  readonly flightNumber: string;
  readonly from: string;
  readonly to: string;
  readonly date: string;
  readonly departureTime: string;
  readonly arrivalTime: string;
  readonly arrivalDate: string;
  readonly sourceIds: ReadonlyArray<string>;
}

export type SeasonalItineraryResult =
  | {
      readonly ok: true;
      readonly requestedStartDate: string;
      readonly actualStartDate: string;
      readonly endDate: string;
      readonly flights: ReadonlyArray<SeasonalItineraryFlight>;
    }
  | {
      readonly ok: false;
      readonly reason: 'invalid-start-date' | 'outside-search-window' | 'no-flight';
      readonly requestedStartDate: string;
      readonly failedSegmentIndex?: number;
      readonly earliestDate?: string;
    };

export interface SeasonalPlannerLeg {
  readonly from: string;
  readonly to: string;
  readonly operatingCarrier: string;
  readonly flightNumber: string;
  readonly departsOn: string;
  readonly stopover: boolean;
}

export function seasonalItineraryLegs(
  result: Extract<SeasonalItineraryResult, { ok: true }>,
): SeasonalPlannerLeg[] {
  return result.flights.map((flight, index) => ({
    from: flight.from,
    to: flight.to,
    operatingCarrier: flight.carrier,
    flightNumber: flight.flightNumber,
    departsOn: flight.date,
    stopover: index < result.flights.length - 1,
  }));
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

function patternOperates(pattern: SeasonalFlightPattern, date: string): boolean {
  return date >= pattern.effectiveFrom
    && date <= pattern.effectiveUntil
    && pattern.daysOfWeek.includes(isoWeekday(date));
}

function flightOn(pattern: SeasonalFlightPattern, date: string): SeasonalItineraryFlight {
  return {
    patternId: pattern.id,
    carrier: pattern.carrier,
    flightNumber: pattern.flightNumber,
    from: pattern.from,
    to: pattern.to,
    date,
    departureTime: pattern.departureTime,
    arrivalTime: pattern.arrivalTime,
    arrivalDate: addDays(date, pattern.arrivalDayOffset),
    sourceIds: pattern.sourceIds,
  };
}

/**
 * Greedy deterministic RTW date solver.
 *
 *  requested start
 *       │
 *       ▼
 *  earliest operating flight on segment 1
 *       │
 *       ├─ arrival day + minimumFullDaysAtStop + 1 calendar day
 *       ▼
 *  earliest operating flight on segment 2 ... repeat
 *
 * The extra `+1` is deliberate: if a flight arrives on Monday and one full
 * day is requested, Tuesday remains entirely at the stop and Wednesday is the
 * earliest next departure. This solver proves schedule realizability only;
 * it never claims award inventory or minimum-connection-time compliance.
 */
export function findSeasonalItinerary(
  template: SeasonalRtwTemplate,
  requestedStartDate: string,
): SeasonalItineraryResult {
  if (!isCalendarDate(requestedStartDate)) {
    return { ok: false, reason: 'invalid-start-date', requestedStartDate };
  }
  if (requestedStartDate < template.searchStart || requestedStartDate > template.searchEnd) {
    return { ok: false, reason: 'outside-search-window', requestedStartDate };
  }

  const patterns = new Map(template.patterns.map((pattern) => [pattern.id, pattern]));
  const flights: SeasonalItineraryFlight[] = [];
  let earliest = requestedStartDate;

  for (let index = 0; index < template.segments.length; index++) {
    const segment = template.segments[index]!;
    const candidates = segment.patternIds.map((id) => patterns.get(id)!).filter(Boolean);
    let chosen: SeasonalItineraryFlight | undefined;
    for (let date = earliest; date <= template.searchEnd; date = addDays(date, 1)) {
      const active = candidates
        .filter((pattern) => patternOperates(pattern, date))
        .sort((a, b) => a.departureTime.localeCompare(b.departureTime)
          || a.carrier.localeCompare(b.carrier)
          || a.flightNumber.localeCompare(b.flightNumber)
          || a.id.localeCompare(b.id));
      if (active[0]) {
        chosen = flightOn(active[0], date);
        break;
      }
    }
    if (!chosen) {
      return {
        ok: false,
        reason: 'no-flight',
        requestedStartDate,
        failedSegmentIndex: index,
        earliestDate: earliest,
      };
    }
    flights.push(chosen);
    if (index < template.segments.length - 1) {
      earliest = addDays(chosen.arrivalDate, template.minimumFullDaysAtStop + 1);
    }
  }

  return {
    ok: true,
    requestedStartDate,
    actualStartDate: flights[0]!.date,
    endDate: flights.at(-1)!.arrivalDate,
    flights,
  };
}
