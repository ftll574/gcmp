import { expect, test } from 'vitest';
import { LiveRouteResponseSchema } from '../../../src/lib/schemas/live-routes.ts';
import { buildValidatedStaticRouteCatalog, validateStaticRouteCandidates } from '../../../src/lib/rtw/static-route-validation.ts';

test('classifies exact carrier, pair-only and missing-route evidence conservatively', () => {
  const response = LiveRouteResponseSchema.parse({
    version: 1,
    origin: 'TPE',
    source: { name: 'air-routes.com current scheduled passenger routes', url: 'https://air-routes.com/developers' },
    checkedAt: '2026-09-11T00:00:00.000Z',
    expiresAt: '2026-09-12T00:00:00.000Z',
    routes: [{
      from: 'TPE', to: 'HKG', status: 'active', seasonalityLabel: null,
      carriers: [{ code: 'BR', name: 'EVA Air', days: ['Fri'], weeklySchedule: [{ day: 'Fri', times: ['08:00'] }], seasonalNote: null }],
      sourceUrl: 'https://air-routes.com/r/TPE-HKG',
    }],
  });
  const result = validateStaticRouteCandidates([
    { carrier: 'BR', from: 'TPE', to: 'HKG' },
    { carrier: 'CX', from: 'TPE', to: 'HKG' },
    { carrier: 'BR', from: 'TPE', to: 'NRT' },
    { carrier: 'BR', from: 'SFO', to: 'TPE' },
  ], new Map([['TPE', response]]));
  expect(result.map((row) => row.status)).toEqual([
    'confirmed-current', 'carrier-not-listed', 'route-not-listed', 'unresolved',
  ]);
  const catalog = buildValidatedStaticRouteCatalog({
    validation: result,
    responsesByOrigin: new Map([['TPE', response]]),
    version: '2026.3',
  });
  expect(catalog.routes).toEqual([expect.objectContaining({
    carrier: 'BR', pair: ['TPE', 'HKG'], carrierIdentity: 'provider-listed', status: 'published',
  })]);
  expect(catalog.sources).toHaveLength(1);
});
