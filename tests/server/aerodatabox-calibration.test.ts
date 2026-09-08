import { readFileSync } from 'node:fs';
import { expect, test, vi } from 'vitest';
import { buildAeroDataBoxCalibrationTargets, runAeroDataBoxCalibration, runAeroDataBoxTargets } from '../../server/aerodatabox-calibration.ts';

const snapshot = JSON.parse(readFileSync('tests/fixtures/tdx-live-snapshot-2026-09-06.json', 'utf8'));

test('offline target planning spends no quota and excludes already-promoted EVA identities', async () => {
  const targets = buildAeroDataBoxCalibrationTargets(snapshot, 18);
  expect(targets).toHaveLength(18);
  expect(new Set(targets.map((item) => `${item.from}:${item.to}`))).toEqual(new Set(['HKG:TPE', 'TPE:HKG', 'TPE:SFO']));
  expect(targets.some((item) => ['BR8', 'BR18', 'BR851', 'BR852'].includes(item.designator))).toBe(false);
  const fetchImpl = vi.fn();
  const result = await runAeroDataBoxCalibration({ snapshot, fetchImpl, limit: 18 });
  expect(result).toMatchObject({ configured: false, externalRequests: 0 });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('free-quota runner uses exact RapidAPI flight-number/date endpoint and only sanitized observations', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
    expect(String(input)).toMatch(/^https:\/\/aerodatabox\.p\.rapidapi\.com\/flights\/number\/[A-Z0-9]+\/2026-09-/);
    expect(new Headers(init?.headers).get('X-RapidAPI-Key')).toBe('TEST-KEY');
    return new Response(JSON.stringify([{ number: decodeURIComponent(new URL(String(input)).pathname.split('/')[3]!),
      codeshareStatus: 'IsOperator', isCargo: false, airline: { iata: 'CX', name: 'Test airline' },
      departure: { airport: { iata: 'TPE' } }, arrival: { airport: { iata: 'HKG' } }, secret: 'TEST-SECRET' }]));
  });
  const result = await runAeroDataBoxCalibration({ snapshot, apiKey: 'TEST-KEY', fetchImpl, limit: 2, sleep: async () => {} });
  expect(result.externalRequests).toBe(2);
  expect(JSON.stringify(result)).not.toMatch(/TEST-(KEY|SECRET)/);
  expect(result.observations).toHaveLength(2);
});

test('provider assertions remain supporting evidence; unknown and contradictory signals stay unresolved', async () => {
  let call = 0;
  const fetchImpl = vi.fn<typeof fetch>(async (input) => {
    const number = decodeURIComponent(new URL(String(input)).pathname.split('/')[3]!);
    call++;
    const body = call === 1
      ? [{ number, codeshareStatus: 'Unknown', isCargo: false, airline: { iata: number.slice(0, 2) } }]
      : [{ number, codeshareStatus: 'IsOperator', isCargo: false, airline: { iata: 'AA' } }, { number, codeshareStatus: 'IsOperator', isCargo: false, airline: { iata: 'BA' } }];
    return new Response(JSON.stringify(body));
  });
  const result = await runAeroDataBoxCalibration({ snapshot, apiKey: 'TEST-KEY', fetchImpl, limit: 2, sleep: async () => {} });
  expect(result.observations[0]?.confidence).toBe('unknown');
  expect(result.observations[1]?.confidence).toBe('conflict');
  expect(result.observations.every((item) => item.inferredOperator === null)).toBe(true);
});

test('a single IsOperator response is only provider-asserted, never high confidence', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async (input) => {
    const number = decodeURIComponent(new URL(String(input)).pathname.split('/')[3]!);
    return new Response(JSON.stringify([{ number, codeshareStatus: 'IsOperator', isCargo: false,
      airline: { iata: number.slice(0, 2) } }]));
  });
  const result = await runAeroDataBoxCalibration({ snapshot, apiKey: 'TEST-KEY', fetchImpl, limit: 1, sleep: async () => {} });
  expect(result.observations[0]?.confidence).toBe('provider-asserted');
  expect(result.summary).toMatchObject({ providerAsserted: 1, unknown: 0, conflicts: 0 });
});

test('explicit known-control targets reuse the bounded runner without snapshot sampling', async () => {
  const target = { from: 'TPE', to: 'SFO', date: '2026-09-12', designator: 'JX12' };
  const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify([{ number: 'JX 12', codeshareStatus: 'IsOperator',
    isCargo: false, airline: { iata: 'JX' }, departure: { airport: { iata: 'TPE' } }, arrival: { airport: { iata: 'SFO' } } }])));
  const result = await runAeroDataBoxTargets({ targets: [target], apiKey: 'TEST-KEY', fetchImpl, sleep: async () => {} });
  expect(result.externalRequests).toBe(1);
  expect(result.observations[0]).toMatchObject({ designator: 'JX12', inferredOperator: 'JX', confidence: 'provider-asserted' });
});
