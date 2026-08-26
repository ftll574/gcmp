import { describe, expect, test } from 'vitest';
import type { ScheduleEntry } from '../../../src/lib/schemas/flight-schedules.ts';
import {
  allianceMemberCarriers,
  destinationsForCarrier,
  groupDestinationsByGeo,
} from '../../../src/lib/rtw/route-discovery.ts';

function entry(overrides: Partial<ScheduleEntry> & Pick<ScheduleEntry, 'carrier' | 'pair'>): ScheduleEntry {
  return {
    daysOfWeek: [1, 4],
    status: 'operating',
    confidence: 'chart-verified',
    sourceUrls: ['https://example.com/timetable'],
    ...overrides,
  };
}

describe('destinationsForCarrier', () => {
  const entries: ScheduleEntry[] = [
    entry({ carrier: 'BR', pair: ['TPE', 'LHR'] }),
    entry({ carrier: 'BR', pair: ['TPE', 'CDG'] }),
    entry({ carrier: 'BR', pair: ['KHH', 'KIX'] }),
    // Same destination twice via a season window + weaker confidence:
    entry({ carrier: 'BR', pair: ['TPE', 'YVR'], seasonStart: '06-01', seasonEnd: '08-31', confidence: 'community-corrected' }),
    entry({ carrier: 'BR', pair: ['TPE', 'YVR'] }),
    // Suspended rows never surface (network-gaps owns "route gone"):
    entry({ carrier: 'BR', pair: ['TPE', 'GUM'], status: 'suspended' }),
    // Another carrier must be filtered out entirely:
    entry({ carrier: 'CI', pair: ['TPE', 'SIN'] }),
  ];

  test('groups by origin, TPE first then alphabetical, destinations sorted', () => {
    const result = destinationsForCarrier(entries, 'BR');

    expect([...result.keys()]).toEqual(['TPE', 'KHH']);
    expect(result.get('TPE')?.map((d) => d.iata)).toEqual(['CDG', 'LHR', 'YVR']);
    expect(result.get('KHH')?.map((d) => d.iata)).toEqual(['KIX']);
  });

  test('dedupes a destination to its strongest confidence row', () => {
    const result = destinationsForCarrier(entries, 'BR');
    const yvr = result.get('TPE')?.find((d) => d.iata === 'YVR');

    expect(yvr?.confidence).toBe('chart-verified');
  });

  test('suspended-only pairs are omitted entirely', () => {
    const result = destinationsForCarrier(entries, 'BR');
    expect(result.get('TPE')?.some((d) => d.iata === 'GUM')).toBe(false);
  });

  test('a carrier without catalog rows yields an empty map (honest gap)', () => {
    const result = destinationsForCarrier(entries, 'CX');
    expect(result.size).toBe(0);
  });
});

describe('allianceMemberCarriers', () => {
  const memberships = [
    { airline: 'BR', airlineName: 'EVA Air', status: 'member', alliance: 'star' },
    { airline: 'CA', airlineName: 'Air China', status: 'member', alliance: 'star' },
    { airline: 'AX', airlineName: 'Connect affiliate', status: 'affiliate', alliance: 'oneworld' },
    { airline: 'XX', airlineName: 'Former member', status: 'former', alliance: 'star' },
    { airline: 'UO', airlineName: 'Connect partner', status: 'connect', alliance: 'oneworld' },
  ];

  test('keeps member+affiliate of the requested alliance, sorted by code', () => {
    expect(allianceMemberCarriers(memberships, 'star')).toEqual([
      { code: 'BR', name: 'EVA Air' },
      { code: 'CA', name: 'Air China' },
    ]);
    expect(allianceMemberCarriers(memberships, 'oneworld')).toEqual([
      { code: 'AX', name: 'Connect affiliate' },
    ]);
  });

  test('former/connect partners never leak into the eligible pool', () => {
    const codes = allianceMemberCarriers(memberships, 'star').map((c) => c.code);
    expect(codes).not.toContain('XX');
    const oneworldCodes = allianceMemberCarriers(memberships, 'oneworld').map((c) => c.code);
    expect(oneworldCodes).not.toContain('UO');
  });

  test('empty membership list yields empty pool', () => {
    expect(allianceMemberCarriers([], 'star')).toEqual([]);
  });
});

describe('groupDestinationsByGeo', () => {
  const list = [
    { iata: 'LHR', confidence: 'chart-verified' },
    { iata: 'CDG', confidence: 'chart-verified' },
    { iata: 'NRT', confidence: 'chart-verified' },
    { iata: 'BKK', confidence: 'community-corrected' },
    { iata: 'XXX', confidence: 'chart-verified' }, // airport unknown to the index
  ] as const;

  const countryOf = (iata: string) =>
    ({ LHR: 'GB', CDG: 'FR', NRT: 'JP', BKK: 'TH' })[iata];
  const continentOf = (country: string) =>
    ({ GB: 'europe', FR: 'europe', JP: 'asia', TH: 'asia' })[country];
  const subregionOf = (country: string) =>
    ({ JP: 'northeast-asia', TH: 'southeast-asia', GB: 'western-europe' })[country];

  test('tiers continent → subregion → country with canonical ordering', () => {
    const groups = groupDestinationsByGeo([...list], countryOf, continentOf, subregionOf);

    // XXX has no airport row → explicit unmapped bucket, ordered last.
    expect(groups.map((g) => g.continent)).toEqual(['asia', 'europe', 'unmapped']);
    const asia = groups[0];
    if (!asia) throw new Error('missing asia');
    // Subregions alphabetical; countries alphabetical within each.
    expect(asia.subregions.map((s) => s.subregion)).toEqual(['northeast-asia', 'southeast-asia']);
    expect(asia.subregions[0]?.countries.map((c) => c.country)).toEqual(['JP']);
    expect(asia.subregions[1]?.countries[0]?.destinations.map((d) => d.iata)).toEqual(['BKK']);
    const europe = groups[1];
    if (!europe) throw new Error('missing europe');
    // FR has no subregion row → hangs under the null tier last.
    expect(europe.subregions.map((s) => s.subregion)).toEqual(['western-europe', null]);
    expect(europe.subregions[1]?.countries.map((c) => c.country)).toEqual(['FR']);
  });

  test('unknown airports land in an explicit unmapped continent bucket', () => {
    const groups = groupDestinationsByGeo(
      [{ iata: 'XXX', confidence: 'chart-verified' }],
      () => undefined,
      () => undefined,
      () => undefined,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.continent).toBe('unmapped');
    expect(groups[0]?.subregions[0]?.subregion).toBeNull();
    expect(groups[0]?.subregions[0]?.countries[0]?.country).toBe('??');
  });

  test('empty input yields no groups', () => {
    expect(groupDestinationsByGeo([], countryOf, continentOf, subregionOf)).toEqual([]);
  });
});
