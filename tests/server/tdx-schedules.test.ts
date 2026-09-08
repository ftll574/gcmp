import { describe, expect, test, vi } from 'vitest';
import { createTdxGateway, normalizeTdxSchedules, parseTdxClock } from '../../server/tdx-schedules.ts';
import { createHybridScheduleGateway } from '../../server/hybrid-schedules.ts';
import { flightDayView } from '../../src/lib/rtw/dated-flight-status.ts';

// SYNTHETIC payload shape from the official TDX/PTX documented example.
// Flight numbers/times below are test inputs, never production service evidence.
const NOW = Date.parse('2026-09-05T14:00:00Z');
const query = { from: 'TPE', to: 'SFO', start: '2026-09-07', end: '2026-09-08' };
const row = {
  AirlineID: 'BR', FlightNumber: 'BR998', DepartureAirportID: 'TPE', ArrivalAirportID: 'SFO',
  ScheduleStartDate: '2026-09-01', ScheduleEndDate: '2026-09-30',
  DepartureTime: '23:30', ArrivalTime: '06:30+1',
  Monday: true, Tuesday: false, Wednesday: false, Thursday: false, Friday: false, Saturday: false, Sunday: false,
  CodeShare: ['UA9999'], UpdateTime: '2026-09-05T20:00:00+08:00',
};
const BR = new Set(['BR']);
const normalize = (rows: unknown) => normalizeTdxSchedules(rows, query, NOW, NOW);

describe('TDX normalization', () => {
  test('dates/weekday/local +1 become references, never verified operating flights', () => {
    const result = normalize([row]); const flight = result.days[0]!.references![0]!;
    expect(flight).toMatchObject({ airlineCode: 'BR', flightNumber: '998', date: '2026-09-07', departureTime: '23:30', arrivalDate: '2026-09-08', arrivalTime: '06:30' });
    expect(flightDayView(result.days[0], BR, NOW).status).toBe('unknown');
    expect(flightDayView(result.days[1], BR, NOW).status).toBe('unknown');
  });
  test.each(['06:30-1', '06:30 (-1)'])('handles date line offset %s', (time) => {
    expect(normalize([{ ...row, ArrivalTime: time }]).days[0]?.references?.[0]?.arrivalDate).toBe('2026-09-06');
  });
  test('unknown arrival date is not inferred by comparing local clocks', () => {
    const flight = normalize([{ ...row, ArrivalTime: '06:30' }]).days[0]?.references?.[0];
    expect(flight?.arrivalTime).toBe('06:30'); expect(flight?.arrivalDate).toBeUndefined();
  });
  test.each(['24:00', '08:99', 'garbage', '06:30+9'])('invalid clock %s is not fabricated', (time) => expect(parseTdxClock(time)).toBeNull());
  test('union of split-week records preserves all published operating days', () => {
    const other = { ...row, Monday: false, Tuesday: true, ArrivalTime: '06:45+1' };
    const result = normalize([row, other]);
    expect(result.days.map((day) => day.references?.length)).toEqual([1, 1]);
  });
  test('codeshare alias rows do not become extra operator flights', () => {
    const result = normalize([row, { ...row, AirlineID: 'UA', FlightNumber: 'UA9999', CodeShare: [] }]);
    expect(result.days[0]?.references).toHaveLength(1);
    expect(result.days[0]?.references?.[0]?.airlineCode).toBe('BR');
    expect(result.days[0]?.published).toEqual([]);
  });
  test('unresolved airline/flight mismatch and explicitly flagged cargo are omitted', () => {
    expect(normalize([{ ...row, FlightNumber: 'UA998' }, { ...row, IsCargo: true }]).days[0]?.references).toEqual([]);
  });
  test('a mismatched route or expired effective period cannot supply a positive', () => {
    expect(normalize([{ ...row, DepartureAirportID: 'SFO' }, { ...row, ScheduleEndDate: '2026-09-06' }]).days[0]?.references).toEqual([]);
  });
  test('stale source updates and malformed payloads stay unknown', () => {
    expect(normalize([{ ...row, UpdateTime: '2026-09-01T00:00:00Z' }]).days[0]?.references).toEqual([]);
    expect(normalize({ error: 'not a catalog' }).days[0]?.issue).toBe('provider-error');
  });
  test('conflicting same-flight schedules are not chosen by first-match order', () => {
    expect(normalize([row, { ...row, DepartureTime: '22:00' }]).days[0]?.references).toEqual([]);
  });
  test('empty or incomplete data never provides no-flight proof', () => {
    expect(flightDayView(normalize([]).days[0], BR, NOW).status).toBe('unknown');
  });
});

describe('TDX authentication, paging, budgets and routing', () => {
  const credentials = { clientId: 'TEST-ID', clientSecret: 'TEST-SECRET', now: () => NOW };
  function mockFetch(records: unknown[] = [row]) {
    return vi.fn<typeof fetch>(async (url) => String(url).includes('/token')
      ? new Response(JSON.stringify({ access_token: 'TEST-TOKEN', expires_in: 3600, token_type: 'Bearer' }))
      : new Response(JSON.stringify(records)));
  }
  test('no keys means no external request, not a fabricated timetable', async () => {
    const fetchImpl = mockFetch(); const gateway = createTdxGateway({ fetchImpl, now: () => NOW });
    expect((await gateway.query(query)).days[0]?.issue).toBe('not-configured'); expect(fetchImpl).not.toHaveBeenCalled();
  });
  test('month request uses a route snapshot and subsequent months reuse it', async () => {
    const fetchImpl = mockFetch(); const gateway = createTdxGateway({ ...credentials, fetchImpl });
    const first = await gateway.query(query);
    await gateway.query({ ...query, start: '2026-09-01', end: '2026-09-30' });
    expect(fetchImpl).toHaveBeenCalledTimes(2); // token + one route query, not 31 days
    const url = new URL(String(fetchImpl.mock.calls[1]![0]));
    expect(url.searchParams.get('$filter')).toBe("DepartureAirportID eq 'TPE' and ArrivalAirportID eq 'SFO'");
    expect(url.toString()).not.toContain('TEST-SECRET');
    expect(JSON.stringify(first)).not.toMatch(/TEST-(ID|SECRET|TOKEN)/);
  });
  test('simultaneous identical requests coalesce', async () => {
    const fetchImpl = mockFetch(); const gateway = createTdxGateway({ ...credentials, fetchImpl });
    await Promise.all([gateway.query(query), gateway.query(query)]); expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  test('no overseas-to-overseas request is sent to the Taiwan endpoint', async () => {
    const fetchImpl = mockFetch(); const gateway = createTdxGateway({ ...credentials, fetchImpl });
    expect((await gateway.query({ ...query, from: 'LHR', to: 'JFK' })).days[0]?.issue).toBe('out-of-range');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  test('token and page calls are covered by the hard budget', async () => {
    const fetchImpl = mockFetch(); const gateway = createTdxGateway({ ...credentials, fetchImpl, dailyBudget: 1 });
    expect((await gateway.query(query)).days[0]?.issue).toBe('budget-exceeded'); expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  test('upstream errors do not leak credentials or imply no service', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('TEST-SECRET', { status: 500 }));
    const result = await createTdxGateway({ ...credentials, fetchImpl }).query(query);
    expect(result.days[0]?.issue).toBe('provider-error'); expect(JSON.stringify(result)).not.toContain('TEST-SECRET');
  });
  test('bounded pagination retrieves the following page instead of assuming the first is complete', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (url) => {
      if (String(url).includes('/token')) return new Response(JSON.stringify({ access_token: 'TEST-TOKEN', expires_in: 3600 }));
      const skip = new URL(String(url)).searchParams.get('$skip');
      return new Response(JSON.stringify(skip === '0' ? Array.from({ length: 500 }, () => row) : []));
    });
    const result = await createTdxGateway({ ...credentials, fetchImpl }).query(query);
    expect(fetchImpl).toHaveBeenCalledTimes(3); expect(result.days[0]?.references).toHaveLength(1); expect(result.days[0]?.complete).toBe(false);
  });
  test('hybrid mode defaults to TDX and never falls back to billed Cirium', async () => {
    const fetchImpl = mockFetch(); const gateway = createHybridScheduleGateway({ appId: 'paid-id', appKey: 'paid-key', fetchImpl, now: () => NOW });
    const result = await gateway.query({ from: 'TSA', to: 'HND', start: '2026-09-07', end: '2026-09-07' });
    expect(fetchImpl).not.toHaveBeenCalled(); expect(result.days[0]?.published).toHaveLength(2);
  });
  test('official-only gateway works without any API account', async () => {
    const fetchImpl = mockFetch(); const gateway = createHybridScheduleGateway({ provider: 'official', fetchImpl, now: () => NOW });
    const result = await gateway.query({ from: 'NRT', to: 'BRU', start: '2026-09-07', end: '2026-09-08' });
    expect(result.days[0]?.published).toHaveLength(1); expect(fetchImpl).not.toHaveBeenCalled();
  });
});
