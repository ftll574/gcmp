import { afterEach, expect, test, vi } from 'vitest';
import { createBrowserOperatorFixtureResolver, createBrowserReplayResolver } from '../../scripts/lib/tdx-browser-replay.ts';
import { captureTdxReplaySnapshot } from '../../server/tdx-snapshot.ts';
import { OPERATOR_EVIDENCE_CHECKED_AT } from '../../server/operator-evidence.ts';

// Synthetic transport-boundary tests, not airline operating evidence.
const NOW = Date.parse('2026-09-05T17:09:57Z');
const origin = 'http://127.0.0.1:5196';
const row = {
  AirlineID: 'BR', FlightNumber: 'BR998', DepartureAirportID: 'TPE', ArrivalAirportID: 'SFO',
  ScheduleStartDate: '2026-09-01', ScheduleEndDate: '2026-10-24',
  DepartureTime: '10:15', ArrivalTime: '06:45',
  Monday: true, Tuesday: true, Wednesday: true, Thursday: true, Friday: true, Saturday: true, Sunday: true,
  CodeShare: [], UpdateTime: new Date(NOW).toISOString(),
};
const bundle = (rows: unknown[] = [row]) => ({
  snapshotVersion: 1, purpose: 'offline-normalizer-regression', capturedWithNormalizer: '4-bounded-operator-evidence',
  capturedAt: new Date(NOW).toISOString(), queryStart: '2026-09-05',
  snapshots: [captureTdxReplaySnapshot(rows, 'TPE', 'SFO', NOW)],
});
const query = '/api/schedules?from=TPE&to=SFO&start=2026-10-01&end=2026-10-31';
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

test('calendar replay covers the exact browser month at original capture time without fetch', () => {
  const network = vi.fn(() => { throw new Error('Network prohibited'); }); vi.stubGlobal('fetch', network);
  const fixture = createBrowserReplayResolver(bundle(), origin);
  const result = fixture.resolve(origin + query);
  expect(result.kind).toBe('snapshot');
  if (result.kind !== 'snapshot') throw new Error('Expected recorded response');
  expect(result.response.days).toHaveLength(31);
  expect(result.response.days.filter((day) => day.references?.length)).toHaveLength(24);
  expect(result.response.days[0]?.references?.[0]?.source.checkedAt).toBe(new Date(NOW).toISOString());
  expect(result.response.days.every((day) => !day.complete && !day.published?.length)).toBe(true);
  expect(network).not.toHaveBeenCalled();
});

test('a later bounded replay may combine still-fresh TDX rows with newly reviewed operator evidence', () => {
  const evaluatedAt = Date.parse(OPERATOR_EVIDENCE_CHECKED_AT) + 60_000;
  const fixture = createBrowserReplayResolver(bundle([{ ...row, FlightNumber: 'BR008' }]), origin, evaluatedAt);
  const result = fixture.resolve(origin + query);
  expect(result.kind).toBe('snapshot');
  if (result.kind !== 'snapshot') throw new Error('Expected recorded response');
  expect(fixture.evaluatedAt).toBe(new Date(evaluatedAt).toISOString());
  expect(result.response.days.filter((day) => day.published?.length)).toHaveLength(24);
  expect(result.response.days[0]?.published?.[0]).toMatchObject({
    carrier: 'BR', flightNumber: '8', operatorEvidence: { name: 'EVA Air official flight status' },
  });
  expect(result.response.days.every((day) => !day.complete && !day.references?.length)).toBe(true);
});

test('operator fixture can test later evidence without claiming historical supplier freshness', () => {
  const evaluatedAt = Date.parse('2026-09-05T23:46:00Z');
  const input = bundle([{ ...row, FlightNumber: 'BR008' }]);
  const historical = createBrowserReplayResolver(input, origin, evaluatedAt).resolve(origin + query);
  expect(historical.kind).toBe('snapshot');
  if (historical.kind !== 'snapshot') throw new Error('Expected historical response');
  expect(historical.response.days.every((day) => !day.published?.length && !day.references?.length)).toBe(true);

  const fixture = createBrowserOperatorFixtureResolver(input, origin, evaluatedAt);
  const result = fixture.resolve(origin + query);
  expect(fixture.syntheticFreshness).toBe(true);
  expect(fixture.evaluatedAt).toBe(new Date(evaluatedAt).toISOString());
  expect(result.kind).toBe('snapshot');
  if (result.kind !== 'snapshot') throw new Error('Expected fixture response');
  expect(result.response.days.filter((day) => day.published?.length)).toHaveLength(24);
  expect(result.response.days.find((day) => day.published?.length)?.published?.[0]?.source.checkedAt)
    .toBe(new Date(evaluatedAt).toISOString());
});

test.each([
  'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token',
  'https://booking.evaair.com/',
  'http://localhost:5196' + query,
  'http://127.0.0.1:8787' + query,
  origin + '/api/schedules/health', origin + '/api', origin + '/api/anything',
  origin + query + '&from=TPE', origin + query + '&secret=not-a-real-secret',
  origin + query.replace('from=TPE', 'from=HKG'),
  origin + query.replace('end=2026-10-31', 'end=2026-11-30'),
])('unexpected destination or API input is blocked, never passed to Vite: %s', (url) => {
  expect(createBrowserReplayResolver(bundle(), origin).resolve(url).kind).toBe('block');
});

test('non-GET API requests cannot escape the interception boundary', () => {
  expect(createBrowserReplayResolver(bundle(), origin).resolve(origin + query, 'POST').kind).toBe('block');
});
test('same-origin static assets may load; credentials in URLs are rejected', () => {
  const fixture = createBrowserReplayResolver(bundle(), origin);
  expect(fixture.resolve(origin + '/src/App.tsx').kind).toBe('local-asset');
  expect(fixture.resolve('http://user:password@127.0.0.1:5196/src/App.tsx').kind).toBe('block');
});
test.each(['https://127.0.0.1:5196', 'http://0.0.0.0:5196', origin + '/', 'http://example.com'])('rejects nonexact loopback origin %s', (url) => {
  expect(() => createBrowserReplayResolver(bundle(), url)).toThrow();
});
test('redacted or malformed snapshots cannot produce a partial browser success', () => {
  expect(() => createBrowserReplayResolver(bundle([{ ...row, IsCargo: 'invalid-marker' }]), origin)).toThrow();
  expect(() => createBrowserReplayResolver({}, origin)).toThrow();
});
