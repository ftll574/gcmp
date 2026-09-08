import { expect, test } from 'vitest';
import { normalizeTdxSchedules, summarizeTdxSnapshot } from '../../server/tdx-schedules.ts';
import { flightDayView } from '../../src/lib/rtw/dated-flight-status.ts';

// Synthetic inputs matching the official GeneralFlightSchedule/CodeShare
// schemas, NOT a claim about these airlines' actual flights or times.
const NOW = Date.parse('2026-09-05T14:00:00Z');
const query = { from: 'TPE', to: 'SFO', start: '2026-09-07', end: '2026-09-08' };
const base = {
  AirlineID: 'BR', FlightNumber: 'BR998', DepartureAirportID: 'TPE', ArrivalAirportID: 'SFO',
  ScheduleStartDate: '2026-09-01', ScheduleEndDate: '2026-10-24',
  DepartureTime: '23:30', ArrivalTime: '06:30+1',
  Monday: true, Tuesday: true, Wednesday: false, Thursday: false,
  Friday: false, Saturday: false, Sunday: false, CodeShare: [], UpdateTime: new Date(NOW).toISOString(),
};
const secondary = { ...base, AirlineID: 'UA', FlightNumber: 'UA0999' };
const normalize = (rows: unknown[]) => normalizeTdxSchedules(rows, query, NOW, NOW);
const numbers = (rows: unknown[], index = 0) => normalize(rows).days[index]!.references!.map((f) => f.airlineCode + f.flightNumber);

test('official split-field codeshares dedupe reference candidates without certifying eligibility', () => {
  const rows = [{ ...base, CodeShare: [{ AirlineID: 'UA', FlightNumber: '999' }] }, secondary];
  expect(numbers(rows)).toEqual(['BR998']);
  const result = normalize(rows);
  expect(flightDayView(result.days[0], new Set(['UA']), NOW).status).toBe('unknown');
  expect(flightDayView(result.days[0], new Set(['BR']), NOW).status).toBe('unknown');
  expect(result.days[0]?.published).toEqual([]);
});

test.each(['UA999', 'ua 0999', { FlightNumber: 'UA0999' }, { AirlineID: 'UA', FlightNumber: '0999' },
  { AirlineID: 'UA', FlightNumber: 'UA999' }])('normalizes supported alias representation %j', (share) => {
  expect(numbers([{ ...base, CodeShare: [share] }, secondary])).toEqual(['BR998']);
});

test.each([{ FlightNumber: '999' }, { AirlineID: 'BR', FlightNumber: 'UA999' }, { AirlineID: null, FlightNumber: null }])(
  'unresolved/contradictory alias %j does not invent a carrier', (share) => {
    expect(numbers([{ ...base, CodeShare: [share] }, secondary])).toEqual(['BR998', 'UA999']);
  },
);

test('a self reference with different zero padding does not delete the operating row', () => {
  expect(numbers([{ ...base, CodeShare: [{ AirlineID: 'BR', FlightNumber: '998' }] }])).toEqual(['BR998']);
});

test.each([
  { ScheduleEndDate: '2026-09-06' }, { ScheduleStartDate: '2026-09-08' }, { Monday: false },
  { DepartureAirportID: 'HKG' }, { UpdateTime: '2026-09-01T00:00:00Z' },
  { IsCargo: true }, { IsCodeShare: true }, { DepartureTime: '23:30+1' },
])('out-of-scope alias owner %j cannot suppress another flight', (overrides) => {
  const owner = { ...base, ...overrides, CodeShare: [{ AirlineID: 'UA', FlightNumber: '999' }] };
  expect(numbers([owner, secondary])).toEqual(['UA999']);
});

test('alias suppression follows the owner weekday rather than all dates in the snapshot', () => {
  const rows = [{ ...base, Tuesday: false, CodeShare: [{ AirlineID: 'UA', FlightNumber: '999' }] }, secondary];
  expect(numbers(rows)).toEqual(['BR998']); expect(numbers(rows, 1)).toEqual(['UA999']);
});

test('reciprocal contradictory claims are not resolved by inventing the operator', () => {
  const result = normalize([{ ...base, CodeShare: [{ AirlineID: 'UA', FlightNumber: '999' }] },
    { ...secondary, CodeShare: [{ AirlineID: 'BR', FlightNumber: '998' }] }]);
  expect(result.days[0]?.published).toEqual([]);
  expect(result.days[0]?.references).toEqual([]);
  expect(flightDayView(result.days[0], new Set(['BR', 'UA']), NOW).status).toBe('unknown');
});

test('nullable documented times and aliases preserve date-only evidence without inventing midnight', () => {
  const result = normalize([{ ...base, CodeShare: null, DepartureTime: null, ArrivalTime: null }]);
  expect(result.days[0]?.references?.[0]).toMatchObject({ airlineCode: 'BR', flightNumber: '998', date: '2026-09-07' });
  expect(result.days[0]?.references?.[0]?.departureTime).toBeUndefined();
  expect(result.days[0]?.references?.[0]?.arrivalDate).toBeUndefined();
  expect(result.days[0]?.complete).toBe(false);
});

test('normalization does not mutate source records', () => {
  const rows = [{ ...base, CodeShare: [{ AirlineID: 'UA', FlightNumber: '999' }] }, secondary];
  const before = JSON.stringify(rows); normalize(rows); expect(JSON.stringify(rows)).toBe(before);
});

test('snapshot diagnostics count malformed values but never serialize their content', () => {
  const summary = summarizeTdxSnapshot([
    { ...base, CodeShare: ['UA999', { AirlineID: 'UA', FlightNumber: 'TEST-SECRET' }] },
    { error: 'TEST-TOKEN' },
  ], 'TPE', 'SFO', NOW);
  expect(summary).toMatchObject({ receivedRows: 2, parsedRows: 1, rejectedRows: 1,
    codeshareRepresentations: { objects: 1, strings: 1, unresolved: 1 } });
  expect(JSON.stringify(summary)).not.toMatch(/TEST-(SECRET|TOKEN)/);
});

test('snapshot diagnostics cap distinct examples without losing row counts', () => {
  const rows = Array.from({ length: 40 }, (_, i) => ({ ...base, FlightNumber: `BR${i + 1}`, CodeShare: ['UA999'] }));
  const summary = summarizeTdxSnapshot(rows, 'TPE', 'SFO', NOW);
  expect(summary.receivedRows).toBe(40); expect(summary.codeshareExamples).toHaveLength(16);
});
