import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, expect, test, vi } from 'vitest';
import { captureTdxReplaySnapshot, TdxReplayBundleSchema, type TdxReplaySnapshot } from '../../server/tdx-snapshot.ts';
import { replayTdxCapture } from '../../server/tdx-replay.ts';
import { normalizeTdxSchedules, summarizeTdxSnapshot } from '../../server/tdx-schedules.ts';
import { diagnoseTdx } from '../../server/tdx-diagnostics.ts';

// Synthetic only: tests neither load a local credential file nor query TDX.
const NOW = Date.parse('2026-09-05T16:00:00Z');
const row = {
  AirlineID: 'BR', FlightNumber: 'BR998', DepartureAirportID: 'TPE', ArrivalAirportID: 'SFO',
  ScheduleStartDate: '2026-09-01', ScheduleEndDate: '2026-10-24',
  DepartureTime: '23:30', ArrivalTime: '06:30+1',
  Monday: true, Tuesday: true, Wednesday: false, Thursday: false, Friday: true, Saturday: true, Sunday: true,
  UpdateTime: new Date(NOW).toISOString(),
};
const capture = (rows: unknown[] = [row]) => captureTdxReplaySnapshot(rows, 'TPE', 'SFO', NOW);
const bundle = (rows: unknown[] = [row]) => ({
  snapshotVersion: 1, purpose: 'offline-normalizer-regression', capturedWithNormalizer: '3-unverified-operators',
  capturedAt: new Date(NOW).toISOString(), queryStart: '2026-09-05', snapshots: [capture(rows)],
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

test('capture removes unknown keys and nested secrets without mutating input', () => {
  const rows = [{ ...row, token: 'TEST-TOKEN', headers: { Authorization: 'TEST-SECRET' },
    CodeShare: [{ AirlineID: 'UA', FlightNumber: '0999', clientSecret: 'TEST-SECRET' }] }];
  const before = JSON.stringify(rows);
  const result = capture(rows);
  expect(result).toMatchObject({ receivedRows: 1, capturedRows: 1, redactedRows: 0 });
  expect(result.rows[0]?.CodeShare).toEqual([{ AirlineID: 'UA', FlightNumber: '0999' }]);
  expect(JSON.stringify(result)).not.toMatch(/TEST-|token|headers|clientSecret/);
  expect(JSON.stringify(rows)).toBe(before);
});

test.each([
  { DepartureTime: 'TEST-SECRET' }, { FlightNumber: 'TEST-TOKEN' }, { DepartureAirportID: 'TEST-ID' },
  { ServiceType: 'TEST-SECRET' }, { IsCargo: 'TEST-TOKEN' },
  { CodeShare: [{ AirlineID: 'UA', FlightNumber: 'TEST-SECRET' }] },
  { CodeShare: 'TEST-SECRET' },
])('unsupported known-field content is redacted, never silently discarded: %j', (override) => {
  const result = capture([{ ...row, ...override }]);
  expect(result).toMatchObject({ receivedRows: 1, capturedRows: 0, redactedRows: 1, rows: [null] });
  expect(JSON.stringify(result)).not.toContain('TEST-');
  expect(replayTdxCapture(bundle([{ ...row, ...override }]), NOW).projectionComplete).toBe(false);
});

test('missing, null, empty and populated shares survive JSON without guessing', () => {
  const source = [row, { ...row, CodeShare: null }, { ...row, CodeShare: [] },
    { ...row, CodeShare: [{ AirlineID: 'UA', FlightNumber: '0999' }, 'UA 0999', { FlightNumber: '999' }] }];
  const saved = JSON.parse(JSON.stringify(capture(source))) as TdxReplaySnapshot;
  expect(Object.hasOwn(saved.rows[0]!, 'CodeShare')).toBe(false);
  expect(saved.rows[1]?.CodeShare).toBeNull();
  expect(saved.rows[2]?.CodeShare).toEqual([]);
  expect(summarizeTdxSnapshot(saved.rows, 'TPE', 'SFO', NOW).codeshareFieldStates)
    .toEqual({ missing: 1, null: 1, emptyArray: 1, populatedArray: 1, invalid: 0 });
});

test('captures all safe rows, not only the sixteen diagnostic examples', () => {
  const rows = Array.from({ length: 40 }, (_, i) => ({ ...row, FlightNumber: `BR${i + 1}` }));
  expect(capture(rows)).toMatchObject({ receivedRows: 40, capturedRows: 40, redactedRows: 0 });
  expect(capture(rows).rows).toHaveLength(40);
});

test('replay preserves split weeks, periods, null times, offsets, aliases and exclusion flags', () => {
  const rows = [row, { ...row, Monday: false, Tuesday: false, Wednesday: true, ArrivalTime: '07:00-1' },
    { ...row, FlightNumber: 'BR018', DepartureTime: null, ArrivalTime: null, CodeShare: null },
    { ...row, AirlineID: 'UA', FlightNumber: 'UA0999' },
    { ...row, FlightNumber: 'BR028', CodeShare: [{ AirlineID: 'UA', FlightNumber: '0999' }] },
    { ...row, FlightNumber: 'BR029', ServiceType: 'F' },
    { ...row, FlightNumber: 'BR030', IsCargo: true },
    { ...row, FlightNumber: 'BR031', IsWetlease: true },
    { ...row, FlightNumber: 'BR032', IsCodeShare: true },
    { ...row, FlightNumber: 'BR033', ScheduleStartDate: '2026-10-01', ArrivalTime: '06:30+0' }];
  const replay = replayTdxCapture(bundle(rows), NOW + 100 * 86400000);
  expect(replay.projectionComplete).toBe(true);
  for (const window of replay.routes[0]!.windows) {
    expect(window.result).toEqual(normalizeTdxSchedules(rows, window.result.query, NOW, NOW));
  }
  expect(replay.routes[0]?.windows[2]?.referenceOccurrences).toBe(0);
  expect(replay.routes[0]?.windows[2]?.result.days.every((day) => !day.complete)).toBe(true);
});

test('historical clock is explicit and never changes source provenance or calls fetch', () => {
  const network = vi.fn(() => { throw new Error('Network prohibited'); }); vi.stubGlobal('fetch', network);
  const replay = replayTdxCapture(bundle(), NOW + 100 * 86400000);
  expect(network).not.toHaveBeenCalled();
  expect(replay).toMatchObject({ mode: 'offline-replay', liveVerification: false, externalRequests: 0,
    capturedAt: new Date(NOW).toISOString() });
  const first = replay.routes[0]!.windows[0]!.result.days.flatMap((day) => day.references ?? [])[0]!;
  expect(first.source.checkedAt).toBe(new Date(NOW).toISOString());
  expect(Date.parse(first.source.reviewBy)).toBeLessThan(NOW + 100 * 86400000);
  expect(replay.routes[0]!.windows.every((window) => window.publishedOccurrences === 0)).toBe(true);
});

test('projection rejects oversized input and bundle tampering, not a partial success', () => {
  expect(() => capture(Array.from({ length: 2501 }, () => row))).toThrow();
  expect(TdxReplayBundleSchema.safeParse({ ...bundle(), token: 'TEST-TOKEN' }).success).toBe(false);
  expect(TdxReplayBundleSchema.safeParse({ ...bundle(), snapshots: [{ ...capture(), receivedRows: 2 }] }).success).toBe(false);
  expect(TdxReplayBundleSchema.safeParse({ ...bundle(), snapshots: [capture(), capture()] }).success).toBe(false);
  expect(TdxReplayBundleSchema.safeParse({ ...bundle(), capturedAt: '2026-09-01T00:00:00Z' }).success).toBe(false);
});

test('diagnostic capture reuses exactly the existing three route requests', async () => {
  const snapshots: TdxReplaySnapshot[] = [];
  const fetchImpl = vi.fn<typeof fetch>(async (input) => {
    if (String(input).endsWith('/token')) return new Response(JSON.stringify({ access_token: 'TEST-TOKEN', expires_in: 3600 }));
    const filter = new URL(String(input)).searchParams.get('$filter') ?? '';
    const endpoints = [...filter.matchAll(/'([A-Z]{3})'/g)].map((match) => match[1]);
    return new Response(JSON.stringify([{ ...row, DepartureAirportID: endpoints[0], ArrivalAirportID: endpoints[1], debug: 'TEST-SECRET' }]));
  });
  const report = await diagnoseTdx({ clientId: 'TEST-ID', clientSecret: 'TEST-SECRET', now: () => NOW, fetchImpl,
    onReplaySnapshot: (snapshot) => snapshots.push(snapshot) });
  expect(fetchImpl).toHaveBeenCalledTimes(4);
  expect(report.requests).toHaveLength(4);
  expect(snapshots).toHaveLength(3);
  expect(JSON.stringify(snapshots)).not.toMatch(/TEST-|debug/);
});

test('a failed authentication never produces a replay snapshot', async () => {
  const onReplaySnapshot = vi.fn();
  await diagnoseTdx({ clientId: 'TEST-ID', clientSecret: 'TEST-SECRET', now: () => NOW,
    fetchImpl: vi.fn(async () => new Response('', { status: 403 })), onReplaySnapshot });
  expect(onReplaySnapshot).not.toHaveBeenCalled();
});

test.each(['missing', 'invalid', 'valid'] as const)('offline CLI %s input never loads env, modifies live evidence or starts live fallback', (kind) => {
  const directory = mkdtempSync(join(tmpdir(), 'gcmp-replay-'));
  try {
    const live = join(directory, 'test-results/tdx-live'); mkdirSync(live, { recursive: true });
    writeFileSync(join(live, 'verification.json'), 'ORIGINAL-LIVE-REPORT');
    writeFileSync(join(directory, '.env.schedules.local'), 'TDX_CLIENT_SECRET=TEST-SECRET');
    if (kind !== 'missing') writeFileSync(join(live, 'snapshot.json'), kind === 'valid' ? JSON.stringify(bundle()) : '{TEST-SECRET');
    // Fail the child immediately if the offline command tries either entry point.
    const guard = 'data:text/javascript,' + encodeURIComponent(
      'process.loadEnvFile = () => process.exit(90); globalThis.fetch = () => process.exit(91);');
    const child = spawnSync(process.execPath, ['--import', guard, '--import', import.meta.resolve('tsx'), resolve('scripts/replay-tdx.ts')],
      { cwd: directory, encoding: 'utf8', timeout: 20000 });
    expect(child.error).toBeUndefined();
    expect(child.status).toBe(kind === 'valid' ? 0 : kind === 'missing' ? 2 : 1);
    expect(child.stdout + child.stderr).not.toContain('TEST-SECRET');
    expect(readFileSync(join(live, 'verification.json'), 'utf8')).toBe('ORIGINAL-LIVE-REPORT');
    expect(existsSync(join(directory, 'test-results/tdx-replay/replay.json'))).toBe(kind === 'valid');
    if (kind === 'valid') {
      const replay = JSON.parse(readFileSync(join(directory, 'test-results/tdx-replay/replay.json'), 'utf8'));
      expect(replay).toMatchObject({ mode: 'offline-replay', externalRequests: 0, liveVerification: false });
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
