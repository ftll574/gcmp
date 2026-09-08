import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { runAeroDataBoxCalibration } from '../server/aerodatabox-calibration.ts';

const input = 'test-results/tdx-live/snapshot.json';
const output = 'test-results/aerodatabox-calibration';
try {
  if (existsSync('.env.aerodatabox.local')) process.loadEnvFile('.env.aerodatabox.local');
  if (!existsSync(input) || statSync(input).size > 32_000_000) throw new Error('Missing or oversized TDX snapshot');
  const snapshot = JSON.parse(readFileSync(input, 'utf8'));
  const result = await runAeroDataBoxCalibration({ snapshot, apiKey: process.env.AERODATABOX_RAPIDAPI_KEY, limit: 18 });
  mkdirSync(output, { recursive: true });
  writeFileSync(`${output}/report.json`, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ configured: result.configured, externalRequests: result.externalRequests,
    targets: result.targets.length, ...('summary' in result ? result.summary : {}) }, null, 2));
  console.log(`Calibration report saved: ${output}/report.json`);
  if (!result.configured) {
    console.log('No AeroDataBox RapidAPI key configured. Target plan was generated with zero external requests.');
    process.exitCode = 2;
  }
} catch {
  console.error('AeroDataBox calibration could not run. No API key or provider response content was logged.');
  process.exitCode = 1;
}
