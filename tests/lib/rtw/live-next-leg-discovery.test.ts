import { describe, expect, test } from 'vitest';
import { LiveRouteResponseSchema } from '../../../src/lib/schemas/live-routes.ts';
import { mergeLiveNextLegDestinations } from '../../../src/lib/rtw/live-next-leg-discovery.ts';
import type { NextLegDestination } from '../../../src/lib/rtw/next-leg-discovery.ts';

const live = LiveRouteResponseSchema.parse({
  version: 1,
  origin: 'TPE',
  source: { name: 'air-routes.com current scheduled passenger routes', url: 'https://air-routes.com/developers' },
  checkedAt: '2026-09-08T01:00:00.000Z',
  expiresAt: '2026-09-08T01:05:00.000Z',
  routes: [
    { from: 'TPE', to: 'BKK', status: 'active', seasonalityLabel: null, sourceUrl: 'https://air-routes.com/r/TPE-BKK', carriers: [
      { code: 'BR', name: 'EVA Air', days: ['Tue'], weeklySchedule: [{ day: 'Tue', times: ['08:10'] }], seasonalNote: null },
      { code: 'CI', name: 'China Airlines', days: ['Tue'], weeklySchedule: [{ day: 'Tue', times: ['17:30'] }], seasonalNote: null },
    ] },
    { from: 'TPE', to: 'ZZZ', status: 'active', seasonalityLabel: null, sourceUrl: 'https://air-routes.com/r/TPE-ZZZ', carriers: [
      { code: 'BR', name: 'EVA Air', days: [], seasonalNote: null },
    ] },
  ],
});

const staticDestinations: NextLegDestination[] = [{
  iata: 'BKK',
  options: [{
    carrier: 'BR', from: 'TPE', to: 'BKK', flightNumbers: [], scheduleStatus: 'unknown',
    networkSources: [{ id: 'eva-current', url: 'https://www.evaair.com/', checkedOn: '2026-09-08', note: 'Current EVA route evidence.' }],
    schedules: [], flightNumberSources: [], routeWindow: null,
  }],
}];

describe('live next-leg discovery merge', () => {
  test('keeps confirmed evidence and adds eligible provider-listed candidates without duplicates', () => {
    const result = mergeLiveNextLegDestinations(
      staticDestinations,
      live,
      new Set(['BR', 'CI']),
      new Set(['TPE', 'BKK']),
    );
    expect(result).toHaveLength(1);
    const options = result[0]!.options;
    expect(options.map((option) => option.carrier)).toEqual(['BR', 'CI']);
    expect(options[0]?.identityStatus).toBeUndefined();
    expect(options[0]?.liveWeeklySchedule).toEqual([{ day: 'Tue', times: ['08:10'] }]);
    expect(options[1]?.identityStatus).toBe('provider-listed');
    expect(options[1]?.liveWeeklySchedule).toEqual([{ day: 'Tue', times: ['17:30'] }]);
    expect(options[1]?.networkSources[0]?.url).toBe('https://air-routes.com/r/TPE-BKK');
  });

  test('filters ineligible carriers and airport codes outside the local airport catalog', () => {
    const result = mergeLiveNextLegDestinations([], live, new Set(['BR']), new Set(['TPE', 'BKK']));
    expect(result.map((destination) => destination.iata)).toEqual(['BKK']);
    expect(result[0]?.options.map((option) => option.carrier)).toEqual(['BR']);
  });
});
