/** SYNTHETIC contract fixtures. These are not airline service observations. */
import { datesBetween } from '../../src/lib/calendar-date.ts';
import type { DatedFlight, DatedScheduleDay, FlightQuery, FlightQueryResponse } from '../../src/lib/schemas/dated-schedules.ts';

export const CLOCK = Date.parse('2026-09-05T06:00:00Z');
export function fixtureFlight(date = '2026-09-07', overrides: Partial<DatedFlight> = {}): DatedFlight {
  return { carrier: 'CX', flightNumber: '473', from: 'TPE', to: 'HKG', departureLocal: `${date}T18:40`, arrivalLocal: `${date}T20:40`, ...overrides };
}
export function fixtureDay(date = '2026-09-07', overrides: Partial<DatedScheduleDay> = {}): DatedScheduleDay {
  return { date, complete: true, checkedAt: new Date(CLOCK).toISOString(), expiresAt: new Date(CLOCK + 900000).toISOString(), flights: [fixtureFlight(date)], ...overrides };
}
export function fixtureResponse(query: FlightQuery, flightDates: ReadonlyArray<string> = ['2026-09-07']): FlightQueryResponse {
  return { version: 1, query, source: { name: 'Synthetic schedule fixture', url: 'https://example.com/schedules' },
    days: datesBetween(query.start, query.end).map((date) => fixtureDay(date, { flights: flightDates.includes(date)
      ? [fixtureFlight(date, { from: query.from, to: query.to })] : [] })) };
}
export function fixtureCirium(date = '2026-09-07', overrides: Record<string, unknown> = {}) {
  return {
    carrier: { fs: 'CX', iata: 'CX' }, flightNumber: '0473',
    departureAirport: { fs: 'TPE', iata: 'TPE' }, arrivalAirport: { fs: 'HKG', iata: 'HKG' },
    departureTime: `${date}T18:40:00.000`, arrivalTime: `${date}T20:40:00.000`,
    stops: 0, serviceType: 'J', isCodeshare: false, isWetlease: false, ...overrides,
  };
}
