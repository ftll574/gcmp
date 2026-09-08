import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { crossValidateAeroDataBox } from '../../server/aerodatabox-crossvalidation.ts';

const schedules = JSON.parse(readFileSync('public/data/schedules/current.json', 'utf8'));

test('exact current BR28 independently agrees; expired CI and pre-window JX remain insufficient', () => {
  const report = { observations: [
    { from: 'TPE', to: 'SFO', date: '2026-09-07', designator: 'BR28', inferredOperator: 'BR', confidence: 'provider-asserted' },
    { from: 'TPE', to: 'HKG', date: '2026-09-07', designator: 'CI601', inferredOperator: 'CI', confidence: 'provider-asserted' },
    { from: 'TPE', to: 'HKG', date: '2026-09-07', designator: 'JX233', inferredOperator: 'JX', confidence: 'provider-asserted' },
  ] };
  const result = crossValidateAeroDataBox(report, schedules);
  expect(result.results[0]).toMatchObject({ status: 'agreement', independentCarrier: 'BR' });
  expect(result.results[0]?.independentSources[0]).toContain('aeroroutes.com');
  expect(result.results[1]?.status).toBe('insufficient-evidence'); // CI catalog expired in Mar-2025.
  expect(result.results[2]?.status).toBe('insufficient-evidence'); // JX official window begins 2026-09-09.
});

test('a provider assertion that disagrees with exact independent evidence becomes conflict', () => {
  const result = crossValidateAeroDataBox({ observations: [
    { from: 'TPE', to: 'SFO', date: '2026-09-07', designator: 'BR28', inferredOperator: 'AS', confidence: 'provider-asserted' },
  ] }, schedules);
  expect(result.results[0]).toMatchObject({ status: 'conflict', independentCarrier: 'BR', providerOperator: 'AS' });
});

test('unknown provider rows are never counted as independently verified', () => {
  const result = crossValidateAeroDataBox({ observations: [
    { from: 'TPE', to: 'HKG', date: '2026-09-08', designator: 'UO111', inferredOperator: null, confidence: 'unknown' },
  ] }, schedules);
  expect(result.summary).toMatchObject({ providerAsserted: 0, agreement: 0, providerUnknown: 1, verifiedRate: 0 });
});
