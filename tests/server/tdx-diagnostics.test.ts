import { expect, test, vi } from 'vitest';
import { diagnoseTdx } from '../../server/tdx-diagnostics.ts';
import { OPERATOR_EVIDENCE_CHECKED_AT } from '../../server/operator-evidence.ts';

// Entirely synthetic: no local env is loaded and no external requests occur.
const NOW = Date.parse('2026-09-05T14:00:00Z');
const credentials = { clientId: 'TEST-ID', clientSecret: 'TEST-SECRET', now: () => NOW };
const token = () => new Response(JSON.stringify({ access_token: 'TEST-TOKEN', expires_in: 3600, token_type: 'Bearer' }));

test('missing credentials require no network and are not called an authentication success', async () => {
  const fetchImpl = vi.fn<typeof fetch>();
  const report = await diagnoseTdx({ now: () => NOW, fetchImpl });
  expect(report.verdict).toBe('missing-credentials');
  expect(fetchImpl).not.toHaveBeenCalled();
});

test.each([401, 403, 500])('authentication HTTP %i is summarized without provider text or retries', async (status) => {
  const fetchImpl = vi.fn<typeof fetch>(async () => new Response('TEST-SECRET TEST-TOKEN', { status }));
  const report = await diagnoseTdx({ ...credentials, fetchImpl });
  expect(report.verdict).toBe('authentication-failed');
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(report)).not.toMatch(/TEST-(SECRET|ID|TOKEN)/);
});

test('valid authentication but data HTTP 403 reports service access denied', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async (input) => String(input).endsWith('/token')
    ? token() : new Response('TEST-SECRET', { status: 403 }));
  const report = await diagnoseTdx({ ...credentials, fetchImpl });
  expect(report.verdict).toBe('timetable-access-denied');
  expect(report.dataAccessible).toBe(false);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(report)).not.toContain('TEST-');
});

test('quota failures stop subsequent queries', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async () => new Response('', { status: 429 }));
  expect((await diagnoseTdx({ ...credentials, fetchImpl })).verdict).toBe('quota-limited');
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test('empty successful data is explicitly not a verified flight result', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async (input) => String(input).endsWith('/token') ? token() : new Response('[]'));
  const report = await diagnoseTdx({ ...credentials, fetchImpl });
  expect(report.verdict).toBe('endpoint-accessible-no-published-flights');
  expect(report.dataAccessible).toBe(true);
  expect(report.routes).toHaveLength(3);
  expect(fetchImpl).toHaveBeenCalledTimes(4); // token plus three snapshots, not 270 daily calls
});

test('normalized publications and valid periods are reported with no credentials', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async (input) => {
    if (String(input).endsWith('/token')) return token();
    const filter = new URL(String(input)).searchParams.get('$filter') ?? '';
    const endpoints = [...filter.matchAll(/'([A-Z]{3})'/g)].map((match) => match[1]);
    return new Response(JSON.stringify([{
      AirlineID: 'BR', FlightNumber: 'BR999', DepartureAirportID: endpoints[0], ArrivalAirportID: endpoints[1],
      ScheduleStartDate: '2026-09-01', ScheduleEndDate: '2026-10-24', DepartureTime: '12:00', ArrivalTime: '13:00+1',
      Monday: true, Tuesday: true, Wednesday: true, Thursday: true, Friday: true, Saturday: true, Sunday: true,
      CodeShare: [], UpdateTime: new Date(NOW).toISOString(),
    }]));
  });
  const report = await diagnoseTdx({ ...credentials, fetchImpl });
  expect(report.verdict).toBe('timetable-references-found-operator-unverified');
  expect(report.routes[0]?.windows[0]).toMatchObject({
    daysWithPublishedFlights: 0, publishedOccurrences: 0, byCarrier: [],
    daysWithTimetableReferences: 30, referenceFlightNumbers: ['BR999'], referenceDatesWithArrivalDate: 30, sourceValidUntil: '2026-10-24',
  });
  expect(report.routes[0]?.windows[2]?.publishedOccurrences).toBe(0);
  expect(report.routes[0]?.windows[2]?.referenceOccurrences).toBe(0);
  expect(fetchImpl).toHaveBeenCalledTimes(4);
  expect(JSON.stringify(report)).not.toMatch(/TEST-(SECRET|ID|TOKEN)/);
});

test('network exception text never enters diagnostics', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async () => { throw new Error('TEST-SECRET'); });
  const report = await diagnoseTdx({ ...credentials, fetchImpl });
  expect(report.verdict).toBe('connection-or-response-failed');
  expect(JSON.stringify(report)).not.toContain('TEST-SECRET');
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test('HTTP 200 invalid token body is not mislabeled successful authentication', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}'));
  const report = await diagnoseTdx({ ...credentials, fetchImpl });
  expect(report.verdict).toBe('connection-or-response-failed');
  expect(report.dataAccessible).toBe(false);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test('v4 report separates bounded operator positives from unresolved references', async () => {
  const operatorNow = Date.parse(OPERATOR_EVIDENCE_CHECKED_AT) + 60_000;
  const fetchImpl = vi.fn<typeof fetch>(async (input) => {
    if (String(input).endsWith('/token')) return token();
    const filter = new URL(String(input)).searchParams.get('$filter') ?? '';
    const endpoints = [...filter.matchAll(/'([A-Z]{3})'/g)].map((match) => match[1]);
    const own = {
      AirlineID: 'BR', FlightNumber: 'BR008', DepartureAirportID: endpoints[0], ArrivalAirportID: endpoints[1],
      ScheduleStartDate: '2026-09-01', ScheduleEndDate: '2026-10-24', DepartureTime: '12:00', ArrivalTime: '13:00+1',
      Monday: true, Tuesday: true, Wednesday: true, Thursday: true, Friday: true, Saturday: true, Sunday: true,
      CodeShare: [{ AirlineID: 'UA', FlightNumber: '0999', secret: 'TEST-SECRET' }],
      UpdateTime: new Date(operatorNow).toISOString(), debugToken: 'TEST-TOKEN',
    };
    return new Response(JSON.stringify([own, { ...own, AirlineID: 'UA', FlightNumber: 'UA999', CodeShare: [] }]));
  });
  const report = await diagnoseTdx({ ...credentials, now: () => operatorNow, fetchImpl });
  expect(report).toMatchObject({ reportVersion: 4, normalizerVersion: '4-bounded-operator-evidence',
    verdict: 'published-flights-found-partial-operator-acceptance', operatingCarrierAcceptance: 'partial' });
  expect(report.routes[0]?.windows[0]?.byCarrier).toEqual([]);
  expect(report.routes[0]?.windows[0]?.byAirlineCode).toEqual([{ airlineCode: 'BR', flightNumbers: ['BR8'], occurrences: 30, days: 30 }]);
  expect(report.routes[2]?.windows[0]?.byCarrier).toEqual([{ carrier: 'BR', flightNumbers: ['BR8'], occurrences: 30, days: 30 }]);
  expect(report.timetableSnapshots).toHaveLength(3);
  expect(report.timetableSnapshots[0]).toMatchObject({ receivedRows: 2, parsedRows: 2, rejectedRows: 0,
    codeshareRepresentations: { objects: 1, strings: 0, unresolved: 0 },
    codeshareExamples: [{ flight: 'BR8', aliases: ['UA999'], validFrom: '2026-09-01', validUntil: '2026-10-24', departureTime: '12:00', arrivalTime: '13:00' }],
  });
  expect(JSON.stringify(report)).not.toMatch(/TEST-(SECRET|ID|TOKEN)|debugToken/);
  expect(fetchImpl).toHaveBeenCalledTimes(4); // diagnostics collect no additional network requests
});
