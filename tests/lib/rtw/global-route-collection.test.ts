import { describe, expect, test } from 'vitest';
import { buildGlobalRouteCatalog } from '../../../src/lib/rtw/global-route-collection.ts';
import { LiveRouteResponseSchema } from '../../../src/lib/schemas/live-routes.ts';

const checkedAt = '2026-09-11T02:00:00.000Z';
function response(origin: string, to: string, carriers: string[]) {
  return LiveRouteResponseSchema.parse({
    version: 1,
    origin,
    source: { name: 'air-routes.com current scheduled passenger routes', url: 'https://air-routes.com/developers' },
    checkedAt,
    expiresAt: '2026-09-11T02:05:00.000Z',
    routes: [{
      from: origin,
      to,
      status: 'active',
      seasonalityLabel: null,
      sourceUrl: `https://air-routes.com/r/${origin}-${to}`,
      carriers: carriers.map((code) => ({ code, name: code, days: ['Mon'], weeklySchedule: [{ day: 'Mon', times: ['09:00'] }], seasonalNote: null })),
    }],
  });
}

describe('global route collection', () => {
  test('discovers target-carrier routes independently of the existing runtime graph', () => {
    const catalog = buildGlobalRouteCatalog({
      records: [
        { origin: 'AAA', status: 200, response: response('AAA', 'BBB', ['AA', 'ZZ']) },
        { origin: 'BBB', status: 404 },
      ],
      eligibleCarriers: new Set(['AA']),
      knownAirports: new Set(['AAA', 'BBB']),
      expectedOrigins: new Set(['AAA', 'BBB']),
      checkedOn: '2026-09-11',
      version: '2026.3',
    });
    expect(catalog.routes).toEqual([expect.objectContaining({
      carrier: 'AA', pair: ['AAA', 'BBB'], status: 'published', carrierIdentity: 'provider-listed',
    })]);
    expect(catalog.carrierUniverses[0]).toMatchObject({ carrier: 'AA', scope: 'partial' });
    expect(catalog.sources[0]?.note).toContain('Complete scan of all 2 GCMP airport codes');
  });

  test('partial scans never claim a complete carrier denominator and unknown destinations are omitted', () => {
    const catalog = buildGlobalRouteCatalog({
      records: [{ origin: 'AAA', status: 200, response: response('AAA', 'XXX', ['AA']) }],
      eligibleCarriers: new Set(['AA']),
      knownAirports: new Set(['AAA', 'BBB']),
      expectedOrigins: new Set(['AAA', 'BBB']),
      checkedOn: '2026-09-11',
      version: '2026.3',
    });
    expect(catalog.routes).toHaveLength(0);
    expect(catalog.carrierUniverses).toHaveLength(0);
    expect(catalog.sources[0]?.note).toContain('Partial scan of 1/2');
    expect(catalog.sources[0]?.note).toContain('1 provider destinations');
  });

  test('rejects duplicate origin records', () => {
    expect(() => buildGlobalRouteCatalog({
      records: [{ origin: 'AAA', status: 404 }, { origin: 'AAA', status: 404 }],
      eligibleCarriers: new Set(['AA']), knownAirports: new Set(['AAA']), expectedOrigins: new Set(['AAA']),
      checkedOn: '2026-09-11', version: '2026.3',
    })).toThrow('duplicate origins');
  });
});
