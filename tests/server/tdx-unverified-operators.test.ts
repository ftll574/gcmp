import { expect, test } from 'vitest';
import { normalizeTdxSchedules, summarizeTdxSnapshot } from '../../server/tdx-schedules.ts';
import { FlightQueryResponseSchema } from '../../src/lib/schemas/dated-schedules.ts';
import { flightDayView } from '../../src/lib/rtw/dated-flight-status.ts';

// Synthetic shape regression prompted by the user's 2026-09-05T16:09Z
// report: all 1,111 rows parsed, but zero CodeShare entries were reported.
// These invented times/identities are NOT a reconstruction of the live rows.
const NOW = Date.parse('2026-09-05T16:09:44Z');
const query = { from: 'TPE', to: 'SFO', start: '2026-09-07', end: '2026-09-08' };
const row = {
  AirlineID: 'BR', FlightNumber: 'BR998', DepartureAirportID: 'TPE', ArrivalAirportID: 'SFO',
  ScheduleStartDate: '2026-09-01', ScheduleEndDate: '2026-10-24',
  DepartureTime: '23:30', ArrivalTime: '06:30-1',
  Monday: true, Tuesday: false, Wednesday: false, Thursday: false,
  Friday: false, Saturday: false, Sunday: false, UpdateTime: new Date(NOW).toISOString(),
};

test.each([undefined, null, []].map((value) => [value]))('missing/null/empty CodeShare %j never certifies the operator', (CodeShare) => {
  const result = normalizeTdxSchedules([{ ...row, ...(CodeShare === undefined ? {} : { CodeShare }) }], query, NOW, NOW);
  expect(result.days[0]?.published).toEqual([]);
  expect(result.days[0]?.references).toEqual([expect.objectContaining({
    airlineCode: 'BR', flightNumber: '998', operatorStatus: 'unverified', date: '2026-09-07',
    departureTime: '23:30', arrivalTime: '06:30', arrivalDate: '2026-09-06',
  })]);
  expect(result.days[0]?.references?.[0]).not.toHaveProperty('carrier');
  for (const eligible of [new Set(['BR', 'UA', 'TG', 'AV']), new Set(['CX', 'AS'])]) {
    const view = flightDayView(result.days[0], eligible, NOW);
    expect(view.status).toBe('unknown');
    expect(view.issue).toBe('operator-unverified');
    expect(view.references).toHaveLength(1); // route evidence, never alliance-filtered as an operator
  }
  expect(result.days[1]?.references).toEqual([]);
  expect(flightDayView(result.days[1], new Set(['BR']), NOW).status).toBe('unknown');
});

test('no flight-number length or carrier blacklist decides operator identity', () => {
  const rows = [['BR', '998'], ['AS', '7218'], ['CX', '1'], ['UA', '9999']].map(([AirlineID, number]) => ({
    ...row, AirlineID, FlightNumber: AirlineID! + number!,
  }));
  const day = normalizeTdxSchedules(rows, query, NOW, NOW).days[0]!;
  expect(day.published).toEqual([]);
  expect(day.references?.map((r) => r.airlineCode + r.flightNumber)).toEqual(['BR998', 'AS7218', 'CX1', 'UA9999']);
});

test('unverified reference is rejected in the selectable published-flight collection', () => {
  const result = normalizeTdxSchedules([row], query, NOW, NOW);
  expect(FlightQueryResponseSchema.safeParse(result).success).toBe(true);
  const day = result.days[0]!;
  expect(FlightQueryResponseSchema.safeParse({ ...result, days: [{ ...day, published: day.references }, result.days[1]] }).success).toBe(false);
  expect(FlightQueryResponseSchema.safeParse({ ...result, days: [{ ...day, complete: true, issue: undefined }, result.days[1]] }).success).toBe(false);
});

test('expired references cannot survive a source review deadline or produce no-flight evidence', () => {
  const day = normalizeTdxSchedules([row], query, NOW, NOW).days[0]!;
  const view = flightDayView(day, new Set(['BR']), NOW + 4 * 3600000);
  expect(view.status).toBe('unknown');
  expect(view.references ?? []).toEqual([]);
});

test('unpublished dates beyond the source window remain unknown', () => {
  const result = normalizeTdxSchedules([row], { ...query, start: '2026-12-04', end: '2026-12-05' }, NOW, NOW);
  for (const day of result.days) {
    expect(day.complete).toBe(false);
    expect(day.references).toEqual([]);
    expect(flightDayView(day, new Set(['BR']), NOW).status).toBe('unknown');
  }
});

test('diagnostics distinguish absent, null, empty, populated and invalid CodeShare fields', () => {
  const summary = summarizeTdxSnapshot([
    row, { ...row, CodeShare: null }, { ...row, CodeShare: [] },
    { ...row, CodeShare: [{ AirlineID: 'UA', FlightNumber: '999' }] },
    { ...row, CodeShare: 'TEST-SECRET' },
  ], 'TPE', 'SFO', NOW);
  expect(summary).toMatchObject({ summaryVersion: 3, receivedRows: 5, parsedRows: 4, rejectedRows: 1,
    codeshareFieldStates: { missing: 1, null: 1, emptyArray: 1, populatedArray: 1, invalid: 1 } });
  expect(summary.timetableExamples).toHaveLength(4);
  expect(JSON.stringify(summary)).not.toContain('TEST-SECRET');
});

test('zero-codeshare snapshots still provide bounded public examples, not empty diagnostics', () => {
  const rows = Array.from({ length: 40 }, (_, i) => ({ ...row, FlightNumber: `BR${i + 1}`, secret: 'TEST-TOKEN' }));
  const summary = summarizeTdxSnapshot([...rows, ...rows], 'TPE', 'SFO', NOW);
  expect(summary.timetableExamples).toHaveLength(16);
  expect(summary).toMatchObject({ distinctTimetableExamples: 40, omittedTimetableExamples: 24 });
  expect(summary.codeshareExamples).toEqual([]);
  expect(summary.timetableExamples[0]).toMatchObject({ flight: 'BR1', codeshareFieldState: 'missing', weekdays: [1], arrivalDayOffset: -1 });
  expect(JSON.stringify(summary)).not.toContain('TEST-TOKEN');
});
