import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { replayTdxCapture } from '../server/tdx-replay.ts';

// Deliberately separate from verify-tdx: NEVER load env or run a live fallback.
const input = 'test-results/tdx-live/snapshot.json';
const output = 'test-results/tdx-replay';
try {
  if (process.argv.length > 2) throw new Error('Unsupported replay arguments');
  if (!existsSync(input)) {
    console.log('No saved public timetable snapshot. Offline replay made zero external requests and did not load credentials.');
    console.log('Existing verification summaries cannot reconstruct the missing rows. The next account-holder capture can save them.');
    process.exitCode = 2;
  } else {
    if (statSync(input).size > 32_000_000) throw new Error('Snapshot exceeds file limit');
    const report = replayTdxCapture(JSON.parse(readFileSync(input, 'utf8')));
    mkdirSync(output, { recursive: true });
    writeFileSync(`${output}/replay.json`, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ mode: report.mode, liveVerification: report.liveVerification,
      externalRequests: report.externalRequests, capturedAt: report.capturedAt,
      normalizerVersion: report.normalizerVersion, projectionComplete: report.projectionComplete,
      routes: report.routes.map((route) => ({ from: route.from, to: route.to, capturedRows: route.capturedRows,
        redactedRows: route.redactedRows, windows: route.windows.map((window) => ({
          start: window.start, end: window.end, daysWithTimetableReferences: window.daysWithTimetableReferences,
          referenceOccurrences: window.referenceOccurrences, referenceFlightNumbers: window.referenceFlightNumbers,
          publishedOccurrences: window.publishedOccurrences,
        })) })),
    }, null, 2));
    console.log(`Historical replay saved: ${output}/replay.json`);
    if (!report.projectionComplete) process.exitCode = 2;
  }
} catch {
  console.error('Offline replay rejected an invalid or unreadable snapshot. No credentials, raw input or error details were logged; no live fallback was attempted.');
  process.exitCode = 1;
}
