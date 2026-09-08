import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { diagnoseTdx } from '../server/tdx-diagnostics.ts';
import { TdxReplayBundleSchema, type TdxReplaySnapshot } from '../server/tdx-snapshot.ts';

// Explicitly run by the account holder in a local terminal. This command
// never displays credentials or raw provider errors and never loads VITE_ secrets.
try {
  if (existsSync('.env.schedules.local')) process.loadEnvFile('.env.schedules.local');
  const snapshots: TdxReplaySnapshot[] = [];
  const report = await diagnoseTdx({
    clientId: process.env.TDX_CLIENT_ID, clientSecret: process.env.TDX_CLIENT_SECRET,
    onReplaySnapshot: (snapshot) => snapshots.push(snapshot),
  });
  const directory = 'test-results/tdx-live';
  mkdirSync(directory, { recursive: true });
  // Persist ONLY whitelisted public fields from the same existing requests.
  // Failed auth/no capture must not destroy an earlier usable snapshot.
  if (snapshots.length > 0) {
    const bundle = TdxReplayBundleSchema.parse({
      snapshotVersion: 1, purpose: 'offline-normalizer-regression',
      capturedWithNormalizer: report.normalizerVersion, capturedAt: report.checkedAt,
      queryStart: report.routes[0]!.windows[0]!.start, snapshots,
    });
    if (existsSync(`${directory}/snapshot.json`)) copyFileSync(`${directory}/snapshot.json`, `${directory}/snapshot.previous.json`);
    writeFileSync(`${directory}/snapshot.json`, JSON.stringify(bundle, null, 2) + '\n');
  }
  // Keep the previous account-holder run for an honest before/after comparison.
  if (existsSync(`${directory}/verification.json`)) copyFileSync(`${directory}/verification.json`, `${directory}/verification.previous.json`);
  writeFileSync(`${directory}/verification.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({
    reportVersion: report.reportVersion, normalizerVersion: report.normalizerVersion,
    checkedAt: report.checkedAt, verdict: report.verdict, requests: report.requests,
    operatingCarrierAcceptance: report.operatingCarrierAcceptance,
    routes: report.routes.map((route) => ({ from: route.from, to: route.to,
      windows: route.windows.map((window) => ({ start: window.start, end: window.end,
        daysWithPublishedFlights: window.daysWithPublishedFlights, carriers: window.carriers,
        daysWithTimetableReferences: window.daysWithTimetableReferences,
        referenceOccurrences: window.referenceOccurrences,
        sourceValidUntil: window.sourceValidUntil })),
    })),
  }, null, 2));
  console.log(`Report saved: ${directory}/verification.json`);
  console.log(snapshots.length > 0
    ? `Public replay snapshot saved: ${directory}/snapshot.json. Subsequent normalizer checks can use npm.cmd run schedules:replay without network access.`
    : 'No new replay snapshot was captured; any previous snapshot remains unchanged.');
  if (report.verdict === 'timetable-references-found-operator-unverified' || report.verdict === 'published-flights-found-partial-operator-acceptance') {
    console.log('Timetable access succeeded. Operating-carrier acceptance is incomplete; exit code 2 is an acceptance warning, not a credential failure.');
  }
  if (report.verdict !== 'published-flights-found') process.exitCode = 2;
} catch {
  console.error('TDX verification could not finish. Check local configuration and connectivity. No credentials or raw error content was logged.');
  process.exitCode = 1;
}
