import { expect, test } from 'vitest';
import { summarizeTdxSnapshot } from '../../server/tdx-schedules.ts';

// Synthetic only. These records test the review report, not real services.
const NOW = Date.parse('2026-09-05T14:00:00Z');
const row = {
  AirlineID: 'BR', FlightNumber: 'BR008', DepartureAirportID: 'TPE', ArrivalAirportID: 'SFO',
  ScheduleStartDate: '2026-09-01', ScheduleEndDate: '2026-10-24',
  DepartureTime: '23:30', ArrivalTime: '06:30+1',
  Monday: true, Tuesday: false, Wednesday: false, Thursday: false,
  Friday: false, Saturday: false, Sunday: true,
  CodeShare: [{ AirlineID: 'UA', FlightNumber: '0999' }], UpdateTime: new Date(NOW).toISOString(),
};
const summarize = (rows: unknown[]) => summarizeTdxSnapshot(rows, 'TPE', 'SFO', NOW);

test('public samples retain split fields, padding, weekdays and arrival offset for live review', () => {
  expect(summarize([row])).toMatchObject({
    summaryVersion: 3, distinctCodeshareExamples: 1, omittedCodeshareExamples: 0,
    codeshareExamples: [{
      flight: 'BR8', airlineId: 'BR', sourceFlightNumber: 'BR008', from: 'TPE', to: 'SFO',
      aliases: ['UA999'], weekdays: [1, 7], updatedAt: new Date(NOW).toISOString(),
      validFrom: '2026-09-01', validUntil: '2026-10-24',
      departureTime: '23:30', departureDayOffset: null, arrivalTime: '06:30', arrivalDayOffset: 1,
      codeshares: [{ representation: 'object', airlineId: 'UA', flightNumber: '0999', identity: 'UA999' }],
      codeshareEntries: 1, omittedCodeshareEntries: 0,
    }],
  });
});

test.each([
  { ScheduleStartDate: '2026-09-02' }, { ScheduleEndDate: '2026-10-23' },
  { Monday: false, Tuesday: true }, { DepartureTime: '22:30' },
  { ArrivalTime: '06:30-1' }, { UpdateTime: '2026-09-05T13:00:00Z' },
  { DepartureAirportID: 'SFO', ArrivalAirportID: 'TPE' },
  { CodeShare: [{ AirlineID: 'UA', FlightNumber: '999' }] },
])('same-flight samples do not collapse distinct review evidence: %j', (overrides) => {
  const summary = summarize([row, { ...row, ...overrides }, row]);
  expect(summary.receivedRows).toBe(3);
  expect(summary.codeshareExamples).toHaveLength(2);
  expect(summary.distinctCodeshareExamples).toBe(2);
  expect(summary.omittedCodeshareExamples).toBe(0);
});

test('unknown versus explicit zero arrival offset is visible without guessing a date', () => {
  const summary = summarize([{ ...row, ArrivalTime: '06:30' }, { ...row, ArrivalTime: '06:30+0' }]);
  expect(summary.codeshareExamples.map((example) => example.arrivalDayOffset)).toEqual([null, 0]);
});

test('unresolved objects and string forms are reviewable without serializing arbitrary values', () => {
  const summary = summarize([{ ...row, CodeShare: [
    'ua 0999', { FlightNumber: '999' }, { AirlineID: 'BR', FlightNumber: 'UA999' },
    { AirlineID: null, FlightNumber: null }, { AirlineID: 'TEST-SECRET', FlightNumber: 'TEST-TOKEN', extra: 'TEST-ID' },
  ], debugToken: 'TEST-TOKEN' }]);
  expect(summary.codeshareExamples[0]?.codeshares).toEqual([
    { representation: 'string', airlineId: null, flightNumber: 'UA 0999', identity: 'UA999' },
    { representation: 'object', airlineId: null, flightNumber: '999', identity: null },
    { representation: 'object', airlineId: 'BR', flightNumber: 'UA999', identity: null },
    { representation: 'object', airlineId: null, flightNumber: null, identity: null },
    { representation: 'object', airlineId: null, flightNumber: null, identity: null },
  ]);
  expect(JSON.stringify(summary)).not.toMatch(/TEST-(SECRET|TOKEN|ID)|debugToken|extra/);
  expect(summary.codeshareRepresentations).toEqual({ objects: 4, strings: 1, unresolved: 4 });
});

test('an entirely unresolved codeshare still supplies a sanitized example for review', () => {
  const summary = summarize([{ ...row, CodeShare: [{ FlightNumber: '999' }] }]);
  expect(summary.codeshareExamples).toHaveLength(1);
  expect(summary.codeshareExamples[0]?.aliases).toEqual([]);
  expect(summary.codeshareExamples[0]?.codeshares[0]?.identity).toBeNull();
});

test('sixteen-example cap is explicit and duplicate rows do not inflate omitted counts', () => {
  const rows = Array.from({ length: 40 }, (_, i) => ({ ...row, FlightNumber: `BR${i + 1}` }));
  const summary = summarize([...rows, ...rows]);
  expect(summary.receivedRows).toBe(80);
  expect(summary.codeshareExamples).toHaveLength(16);
  expect(summary.distinctCodeshareExamples).toBe(40);
  expect(summary.omittedCodeshareExamples).toBe(24);
});

test('per-example alias truncation remains explicit and full-entry differences remain distinct', () => {
  const shares = Array.from({ length: 25 }, (_, i) => ({ AirlineID: 'UA', FlightNumber: String(i + 1) }));
  const summary = summarize([
    { ...row, CodeShare: shares },
    { ...row, CodeShare: [...shares.slice(0, 24), { AirlineID: 'UA', FlightNumber: '99' }] },
  ]);
  expect(summary.codeshareExamples).toHaveLength(2);
  for (const example of summary.codeshareExamples) {
    expect(example.codeshares).toHaveLength(20);
    expect(example.codeshareEntries).toBe(25);
    expect(example.omittedCodeshareEntries).toBe(5);
    expect(example.aliasCount).toBe(25);
    expect(example.aliases).toHaveLength(20);
    expect(example.omittedAliases).toBe(5);
  }
});

test('invalid airport or time text cannot enter the public whitelist', () => {
  const summary = summarize([{ ...row, DepartureAirportID: 'TEST-SECRET', ArrivalAirportID: 'TEST-ID',
    DepartureTime: 'TEST-TOKEN', ArrivalTime: null }]);
  expect(summary.codeshareExamples[0]).toMatchObject({
    from: null, to: null, departureTime: null, arrivalTime: null, arrivalDayOffset: null,
  });
  expect(JSON.stringify(summary)).not.toMatch(/TEST-(SECRET|TOKEN|ID)/);
});

test('empty and nullable codeshares do not create invented relationship examples', () => {
  const summary = summarize([{ ...row, CodeShare: [] }, { ...row, CodeShare: null }]);
  expect(summary.codeshareExamples).toEqual([]);
  expect(summary.distinctCodeshareExamples).toBe(0);
  expect(summary.omittedCodeshareExamples).toBe(0);
});
