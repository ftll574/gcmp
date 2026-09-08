import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { runAeroDataBoxTargets, type CalibrationTarget } from '../server/aerodatabox-calibration.ts';

interface Control extends CalibrationTarget { expectedOperator: string; evidence: string; }
const controls: Control[] = [
  // Keep positive controls in the near-term window that this free endpoint
  // actually returned during calibration. Farther dates produced many empty
  // results despite independent evidence, so emptiness is a coverage gap,
  // not an operator disagreement.
  { from: 'TPE', to: 'HKG', date: '2026-09-07', designator: 'BR851', expectedOperator: 'BR', evidence: 'EVA official flight status' },
  { from: 'HKG', to: 'TPE', date: '2026-09-07', designator: 'BR852', expectedOperator: 'BR', evidence: 'EVA official flight status' },
  { from: 'TPE', to: 'SFO', date: '2026-09-07', designator: 'BR8', expectedOperator: 'BR', evidence: 'EVA official flight status' },
  { from: 'TPE', to: 'SFO', date: '2026-09-07', designator: 'BR18', expectedOperator: 'BR', evidence: 'EVA official flight status' },
  { from: 'TPE', to: 'SFO', date: '2026-09-07', designator: 'BR28', expectedOperator: 'BR', evidence: 'chart-verified airline filing' },
  { from: 'TPE', to: 'HKG', date: '2026-09-12', designator: 'JX233', expectedOperator: 'JX', evidence: 'STARLUX official timetable API' },
  { from: 'HKG', to: 'TPE', date: '2026-09-12', designator: 'JX234', expectedOperator: 'JX', evidence: 'STARLUX official timetable API' },
  { from: 'TPE', to: 'SFO', date: '2026-09-12', designator: 'JX12', expectedOperator: 'JX', evidence: 'STARLUX official timetable API' },
];

try {
  if (existsSync('.env.aerodatabox.local')) process.loadEnvFile('.env.aerodatabox.local');
  const result = await runAeroDataBoxTargets({ targets: controls, apiKey: process.env.AERODATABOX_RAPIDAPI_KEY });
  const checks = controls.map((control, index) => {
    const observation = result.observations[index];
    const actual = observation?.inferredOperator ?? null;
    return { ...control, providerOperator: actual, providerConfidence: observation?.confidence ?? 'unknown',
      agreement: actual === control.expectedOperator };
  });
  const summary = { controls: checks.length, agreement: checks.filter((item) => item.agreement).length,
    disagreement: checks.filter((item) => item.providerOperator !== null && !item.agreement).length,
    unknown: checks.filter((item) => item.providerOperator === null).length,
    agreementRate: checks.length ? checks.filter((item) => item.agreement).length / checks.length : 0,
    externalRequests: result.externalRequests };
  mkdirSync('test-results/aerodatabox-calibration', { recursive: true });
  writeFileSync('test-results/aerodatabox-calibration/known-controls.json', JSON.stringify({ summary, checks }, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
  if (!result.configured) process.exitCode = 2;
} catch {
  console.error('AeroDataBox known-control calibration failed without logging credentials or raw provider responses.');
  process.exitCode = 1;
}
