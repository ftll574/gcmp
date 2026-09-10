import { describe, expect, test, vi } from 'vitest';
import { createLiveRouteGateway, normalizeLiveRoutes } from '../../server/live-routes.ts';
import { LiveRouteCarrierSchema } from '../../src/lib/schemas/live-routes.ts';

const CLOCK = Date.parse('2026-09-08T01:00:00Z');
const raw = {
  from: 'TPE',
  destinations: [
    {
      route_id: 'TPE-BKK', from: 'TPE', to: 'BKK', status: 'active', seasonality_label: null,
      airlines: [
        { airline_code: 'BR', airline: 'EVA Air', schedule: [{ day: 'Mon', times: ['16:20', '08:10'] }, { day: 'Mon', times: ['08:10', 'bad-time'] }], seasonal_note: null, service_type: 'scheduled' },
        { airline_code: 'CI', airline: 'China Airlines', schedule: [{ day: 'Tue', times: [] }], seasonal_note: null, service_type: 'charter' },
      ],
      booking: { url: 'https://air-routes.com/r/TPE-BKK' },
    },
    {
      route_id: 'TPE-AMS', from: 'TPE', to: 'AMS', status: 'active', seasonality_label: null,
      airlines: [{ airline_code: 'CI', airline: 'China Airlines', schedule: [{ day: 'Wed', times: [] }], service_type: 'scheduled' }],
      booking: { url: 'https://air-routes.com/r/TPE-AMS' },
    },
    {
      route_id: 'TPE-NRT', from: 'TPE', to: 'NRT', status: 'inactive', seasonality_label: null,
      airlines: [{ airline_code: 'BR', airline: 'EVA Air', schedule: [], service_type: 'scheduled' }],
    },
  ],
};

describe('live route gateway', () => {
  test('normalizes only active scheduled passenger listings without claiming an operator', () => {
    const result = normalizeLiveRoutes(raw, 'TPE', CLOCK);
    expect(result.origin).toBe('TPE');
    expect(result.routes.map((route) => `${route.from}-${route.to}`)).toEqual(['TPE-BKK', 'TPE-AMS']);
    expect(result.routes[0]?.carriers).toEqual([{
      code: 'BR', name: 'EVA Air', days: ['Mon'],
      weeklySchedule: [{ day: 'Mon', times: ['08:10', '16:20'] }], seasonalNote: null,
    }]);
    expect(result.routes[1]?.carriers[0]?.code).toBe('CI');
    expect(result.source.url).toBe('https://air-routes.com/developers');
  });

  test('caches an origin and rejects a response for a different origin', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(raw), { status: 200, headers: { 'content-type': 'application/json' } }));
    const gateway = createLiveRouteGateway({ fetchImpl: fetchImpl as typeof fetch, now: () => CLOCK });
    await gateway.query('tpe');
    await gateway.query('TPE');
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const mismatchFetch = vi.fn(async () => new Response(JSON.stringify({ ...raw, from: 'HKG' }), { status: 200 }));
    const mismatch = createLiveRouteGateway({ fetchImpl: mismatchFetch as typeof fetch, now: () => CLOCK });
    await expect(mismatch.query('TPE')).rejects.toThrow('origin mismatch');
  });

  test('rejects contradictory normalized weekly schedule summaries', () => {
    expect(LiveRouteCarrierSchema.safeParse({
      code: 'BR', name: 'EVA Air', days: ['Mon'], weeklySchedule: [{ day: 'Tue', times: ['08:10'] }], seasonalNote: null,
    }).success).toBe(false);
    expect(LiveRouteCarrierSchema.safeParse({
      code: 'BR', name: 'EVA Air', days: ['Mon'], weeklySchedule: [{ day: 'Mon', times: ['08:10', '08:10'] }], seasonalNote: null,
    }).success).toBe(false);
  });
});
