import { FlightQuerySchema } from '../../src/lib/schemas/dated-schedules.ts';
import { normalizeTdxSchedules } from '../../server/tdx-schedules.ts';
import { TdxReplayBundleSchema } from '../../server/tdx-snapshot.ts';

/** Test-only CDP response resolver. It does not listen on a port, load env,
 * fetch, create a gateway, or refresh source provenance. Every API request
 * is either fulfilled from the saved snapshot or blocked, never proxied. */
export function createBrowserReplayResolver(input: unknown, origin: string, evaluatedAt?: number) {
  const local = new URL(origin);
  if (local.protocol !== 'http:' || local.hostname !== '127.0.0.1' || local.origin !== origin) {
    throw new Error('An exact loopback origin is required');
  }
  const bundle = TdxReplayBundleSchema.parse(input);
  if (bundle.snapshots.some((snapshot) => snapshot.redactedRows > 0)) throw new Error('Full public-field projection required');
  const evaluationTime = evaluatedAt ?? Date.parse(bundle.capturedAt);
  if (!Number.isFinite(evaluationTime)) throw new Error('Invalid replay evaluation time');
  return {
    capturedAt: bundle.capturedAt,
    evaluatedAt: new Date(evaluationTime).toISOString(),
    capturedRows: bundle.snapshots.reduce((total, snapshot) => total + snapshot.capturedRows, 0),
    resolve(url: string, method = 'GET') {
      const request = new URL(url);
      if (request.origin !== origin || request.username || request.password) return { kind: 'block' as const };
      if (!request.pathname.startsWith('/api')) return { kind: 'local-asset' as const };
      if (request.pathname !== '/api/schedules' || method !== 'GET') return { kind: 'block' as const };
      if ([...request.searchParams.keys()].some((key) => request.searchParams.getAll(key).length !== 1)) return { kind: 'block' as const };
      const parsed = FlightQuerySchema.safeParse(Object.fromEntries(request.searchParams));
      if (!parsed.success) return { kind: 'block' as const };
      const query = parsed.data;
      const snapshot = bundle.snapshots.find((item) => item.from === query.from && item.to === query.to);
      if (!snapshot) return { kind: 'block' as const };
      const capturedTime = Date.parse(snapshot.fetchedAt);
      return { kind: 'snapshot' as const,
        response: normalizeTdxSchedules(snapshot.rows, query, capturedTime, evaluationTime) };
    },
  };
}

/** Test-only integration fixture for operator evidence reviewed after the
 * saved supplier snapshot's 4-hour freshness window. It reuses the exact
 * saved public rows but treats them as if the same row set had been fetched
 * at `evaluatedAt`. This proves resolver/UI integration only; it is NOT
 * historical supplier freshness or a new TDX capture. */
export function createBrowserOperatorFixtureResolver(input: unknown, origin: string, evaluatedAt: number) {
  const local = new URL(origin);
  if (local.protocol !== 'http:' || local.hostname !== '127.0.0.1' || local.origin !== origin) {
    throw new Error('An exact loopback origin is required');
  }
  const bundle = TdxReplayBundleSchema.parse(input);
  if (bundle.snapshots.some((snapshot) => snapshot.redactedRows > 0)) throw new Error('Full public-field projection required');
  if (!Number.isFinite(evaluatedAt)) throw new Error('Invalid replay evaluation time');
  return {
    capturedAt: bundle.capturedAt,
    evaluatedAt: new Date(evaluatedAt).toISOString(),
    syntheticFreshness: true as const,
    capturedRows: bundle.snapshots.reduce((total, snapshot) => total + snapshot.capturedRows, 0),
    resolve(url: string, method = 'GET') {
      const request = new URL(url);
      if (request.origin !== origin || request.username || request.password) return { kind: 'block' as const };
      if (!request.pathname.startsWith('/api')) return { kind: 'local-asset' as const };
      if (request.pathname !== '/api/schedules' || method !== 'GET') return { kind: 'block' as const };
      if ([...request.searchParams.keys()].some((key) => request.searchParams.getAll(key).length !== 1)) return { kind: 'block' as const };
      const parsed = FlightQuerySchema.safeParse(Object.fromEntries(request.searchParams));
      if (!parsed.success) return { kind: 'block' as const };
      const query = parsed.data;
      const snapshot = bundle.snapshots.find((item) => item.from === query.from && item.to === query.to);
      if (!snapshot) return { kind: 'block' as const };
      return { kind: 'snapshot' as const,
        response: normalizeTdxSchedules(snapshot.rows, query, evaluatedAt, evaluatedAt) };
    },
  };
}
