import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { crossValidateAeroDataBox } from '../server/aerodatabox-crossvalidation.ts';

const input = 'test-results/aerodatabox-calibration/report.json';
const schedule = 'public/data/schedules/current.json';
const output = 'test-results/aerodatabox-calibration/crossvalidation.json';
try {
  if (!existsSync(input)) throw new Error('Missing calibration report');
  const result = crossValidateAeroDataBox(JSON.parse(readFileSync(input, 'utf8')), JSON.parse(readFileSync(schedule, 'utf8')));
  mkdirSync('test-results/aerodatabox-calibration', { recursive: true });
  writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result.summary, null, 2));
  console.log(`Cross-validation saved: ${output}`);
} catch {
  console.error('AeroDataBox cross-validation could not run. No provider key or raw response content was logged.');
  process.exitCode = 1;
}
