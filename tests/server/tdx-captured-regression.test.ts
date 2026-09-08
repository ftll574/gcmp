import { afterEach, expect, test, vi } from 'vitest';
import { capturedRows, capturedServices, CAPTURED_AT } from '../fixtures/tdx-captured-2026-09-06.ts';
import { normalizeTdxSchedules, summarizeTdxSnapshot } from '../../server/tdx-schedules.ts';
import { flightDayView } from '../../src/lib/rtw/dated-flight-status.ts';
import { OPERATOR_EVIDENCE_CHECKED_AT } from '../../server/operator-evidence.ts';

// Real, selected public facts from the user's capture. Evaluate at the original
// timestamp, never refresh provenance or load account credentials. No live API.
const NOW = Date.parse(CAPTURED_AT);
const EVIDENCE_NOW = Date.parse(OPERATOR_EVIDENCE_CHECKED_AT) + 60_000;
const carriers = new Set(['BR', 'CX', 'AS', 'JX']);
afterEach(() => { vi.unstubAllGlobals(); });
const service = (number: string) => capturedServices.find((entry) => entry.sourceFlightNumber === number)!;
function query(number: string, start: string, end = start) {
  const entry = service(number);
  return normalizeTdxSchedules(capturedRows(entry), { from: entry.from, to: entry.to, start, end }, Date.parse(entry.fetchedAt), EVIDENCE_NOW);
}

test.each(capturedServices)('$sourceFlightNumber: real empty-share rows preserve all split-period dates with only bounded operator promotion', (entry) => {
  const rows = capturedRows(entry);
  expect(summarizeTdxSnapshot(rows, entry.from, entry.to, NOW).codeshareFieldStates)
    .toEqual({ missing: 0, null: 0, emptyArray: rows.length, populatedArray: 0, invalid: 0 });
  for (const [start, end, expected] of [
    ['2026-09-05', '2026-10-04', entry.sourceFlightNumber === 'JX233' ? 29 : 30],
    ['2026-10-05', '2026-11-03', 20],
  ] as const) {
    const result = query(entry.sourceFlightNumber, start, end);
    expect(result.days.flatMap((day) => [...(day.published ?? []), ...(day.references ?? [])])).toHaveLength(expected);
    expect(result.days.filter((day) => (day.published?.length ?? 0) + (day.references?.length ?? 0) > 0)).toHaveLength(expected);
    for (const day of result.days) {
      expect(day.complete).toBe(false);
      expect(day.flights).toEqual([]);
      if (day.published?.length) {
        expect(day.references).toEqual([]);
        if (entry.sourceFlightNumber === 'BR008') {
          expect(day.published[0]).toMatchObject({ carrier: 'BR', flightNumber: '8', operatorEvidence: { name: 'EVA Air official flight status' } });
        } else {
          expect(day.published[0]).toMatchObject({ carrier: 'JX', operatorEvidence: { name: 'STARLUX official timetable API' } });
          expect(day.date >= '2026-09-09' && day.date <= '2026-09-15').toBe(true);
        }
        expect(flightDayView(day, carriers, EVIDENCE_NOW).status).toBe('published');
      } else {
        expect(day.published ?? []).toEqual([]);
        expect(flightDayView(day, carriers, EVIDENCE_NOW).status).toBe('unknown');
      }
    }
  }
});

test.each(capturedServices)('$sourceFlightNumber: source order and identical duplicates cannot lose or multiply a day', (entry) => {
  const rows = capturedRows(entry);
  const input = { from: entry.from, to: entry.to, start: '2026-10-01', end: '2026-10-31' };
  const fetchedAt = Date.parse(entry.fetchedAt);
  const original = normalizeTdxSchedules(rows, input, fetchedAt, NOW);
  expect(normalizeTdxSchedules([...rows].reverse(), input, fetchedAt, NOW)).toEqual(original);
  expect(normalizeTdxSchedules([...rows, ...rows], input, fetchedAt, NOW)).toEqual(original);
});

test('the real 28-row JX233 split preserves four weekday-specific clocks and a genuinely unlisted date', () => {
  expect(capturedRows(service('JX233'))).toHaveLength(28);
  expect(query('JX233', '2026-09-05').days[0]?.references).toEqual([]);
  const result = query('JX233', '2026-09-06', '2026-09-10');
  expect(result.days.map((day) => (day.published?.[0] ?? day.references?.[0])?.departureTime))
    .toEqual(['08:30', '08:20', '08:05', '08:05', '08:10']);
});

test('BR008 padding and the September/October clock change do not invent an arrival date', () => {
  const flights = query('BR008', '2026-09-30', '2026-10-01').days.flatMap((day) => day.published ?? []);
  expect(flights.map((flight) => flight.flightNumber)).toEqual(['8', '8']);
  expect(flights.map((flight) => flight.arrivalTime)).toEqual(['06:45', '06:35']);
  expect(flights.every((flight) => flight.arrivalDate === undefined)).toBe(true);
  expect(flights.every((flight) => flight.operatorEvidence?.name === 'EVA Air official flight status')).toBe(true);
});

test('observed +1 and -1 offsets remain explicit even across the publication boundary', () => {
  expect(query('CX408', '2026-10-24').days[0]?.references?.[0])
    .toMatchObject({ date: '2026-10-24', arrivalDate: '2026-10-25', arrivalTime: '00:35' });
  expect(query('JX012', '2026-09-05').days[0]?.references?.[0])
    .toMatchObject({ date: '2026-09-05', arrivalDate: '2026-09-04', arrivalTime: '20:30' });
});

test('AS7218 and JX012 have identical clocks but cannot be resolved by a time or airline heuristic', () => {
  const rows = [...capturedRows(service('AS7218')), ...capturedRows(service('JX012'))];
  const result = normalizeTdxSchedules(rows, { from: 'TPE', to: 'SFO', start: '2026-09-07', end: '2026-09-07' },
    Date.parse(service('JX012').fetchedAt), NOW);
  expect(result.days[0]?.references?.map((flight) => flight.airlineCode + flight.flightNumber)).toEqual(['AS7218', 'JX12']);
  expect(result.days[0]?.published).toEqual([]);
});

test('expired and unpublished real data stay unknown without fetching or refreshing provenance', () => {
  const network = vi.fn(() => { throw new Error('Network forbidden'); }); vi.stubGlobal('fetch', network);
  for (const entry of capturedServices) {
    const result = query(entry.sourceFlightNumber, '2026-10-24', '2026-10-25');
    expect(result.days[1]?.references).toEqual([]);
    const afterExpiry = flightDayView(result.days[0], carriers, NOW + 5 * 3600000);
    expect(afterExpiry.status).toBe('unknown'); expect(afterExpiry.references ?? []).toEqual([]);
    const evidence = result.days[0]?.published?.[0] ?? result.days[0]?.references?.[0];
    expect(evidence?.source.checkedAt).toBe(entry.fetchedAt);
    expect(query(entry.sourceFlightNumber, '2026-12-04', '2027-01-02').days.every((day) =>
      !day.complete && !day.references?.length && !day.published?.length && flightDayView(day, carriers, EVIDENCE_NOW).status === 'unknown')).toBe(true);
  }
  expect(network).not.toHaveBeenCalled();
});
