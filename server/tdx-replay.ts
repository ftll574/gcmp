import { addCalendarDays } from '../src/lib/calendar-date.ts';
import { normalizeTdxSchedules, summarizeTdxSnapshot, TDX_NORMALIZER_VERSION } from './tdx-schedules.ts';
import { TdxReplayBundleSchema } from './tdx-snapshot.ts';

/** Saved whitelisted rows -> CURRENT normalizer at ORIGINAL capture time ->
 * historical regression report. No gateway, credentials, environment-file
 * load, HTTP fetch, fallback data or refreshed provenance in this path. */
export function replayTdxCapture(input: unknown, replayedAt = Date.now()) {
  const bundle = TdxReplayBundleSchema.parse(input);
  return {
    replayVersion: 1, mode: 'offline-replay' as const, liveVerification: false,
    externalRequests: 0, replayedAt: new Date(replayedAt).toISOString(),
    capturedAt: bundle.capturedAt, capturedWithNormalizer: bundle.capturedWithNormalizer,
    normalizerVersion: TDX_NORMALIZER_VERSION,
    projectionComplete: bundle.snapshots.every((snapshot) => snapshot.redactedRows === 0),
    routes: bundle.snapshots.map((snapshot) => {
      const capturedTime = Date.parse(snapshot.fetchedAt);
      return {
        from: snapshot.from, to: snapshot.to, evaluatedAt: snapshot.fetchedAt,
        receivedRows: snapshot.receivedRows, capturedRows: snapshot.capturedRows, redactedRows: snapshot.redactedRows,
        summary: summarizeTdxSnapshot(snapshot.rows, snapshot.from, snapshot.to, capturedTime),
        windows: [0, 30, 90].map((offset) => {
          const start = addCalendarDays(bundle.queryStart, offset);
          const result = normalizeTdxSchedules(snapshot.rows,
            { from: snapshot.from, to: snapshot.to, start, end: addCalendarDays(start, 29) }, capturedTime, capturedTime);
          const references = result.days.flatMap((day) => day.references ?? []);
          return {
            start, end: result.query.end,
            daysWithTimetableReferences: result.days.filter((day) => day.references?.length).length,
            referenceOccurrences: references.length,
            referenceFlightNumbers: [...new Set(references.map((flight) => flight.airlineCode + flight.flightNumber))].sort(),
            publishedOccurrences: result.days.flatMap((day) => day.published ?? []).length,
            // Keep actual dates/validity for offline review, not just totals.
            result,
          };
        }),
      };
    }),
    notes: [
      'Historical replay at each original snapshot timestamp; no new authentication or flight verification.',
      'projectionComplete means no rows were redacted by the public-field whitelist, NOT complete route/date coverage.',
      'Redacted rows are null placeholders; absent fields cannot be reconstructed. This is not a raw-response archive.',
      'Operator identity remains unverified. Do not serve this historical replay as a current schedule API.',
    ],
  };
}
