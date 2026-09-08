import { describe, expect, test } from 'vitest';
import { buildNextLegIndex, flightNumberSuffix } from '../../../src/lib/rtw/next-leg-discovery.ts';
import { RouteNetworkCatalogSchema, type RouteNetworkEntry } from '../../../src/lib/schemas/route-network.ts';
import type { ScheduleEntry } from '../../../src/lib/schemas/flight-schedules.ts';
import type { NetworkGapEntry } from '../../../src/lib/schemas/network-gaps.ts';
import { OfficialScheduleCatalogSchema } from '../../../src/lib/schemas/published-schedules.ts';

function network(routes: Partial<RouteNetworkEntry>[] = [{}]) {
  return RouteNetworkCatalogSchema.parse({
    version: '2026.3', coverage: 'curated-not-complete',
    sources: [{ id: 'fixture', url: 'https://example.com/route', checkedOn: '2026-09-05', publishedOn: '2025-01-01', note: 'Test fixture only.' }],
    routes: routes.map((item) => ({ carrier: 'CX', pair: ['TPE', 'HKG'], service: 'nonstop', status: 'published', sourceIds: ['fixture'], ...item })),
  });
}
function schedule(overrides: Partial<ScheduleEntry> = {}): ScheduleEntry {
  return { carrier: 'CX', pair: ['TPE', 'HKG'], daysOfWeek: [6], status: 'operating', confidence: 'chart-verified', sourceUrls: ['https://example.com/schedule'], ...overrides };
}
function gap(overrides: Partial<NetworkGapEntry> = {}): NetworkGapEntry {
  return { carrier: 'CX', pair: ['TPE', 'HKG'], status: 'not-flown', since: '2026', until: null, action: 'warn', confidence: 'chart-verified', evidence: ['https://example.com/gap'], ...overrides };
}
const base = { network: network(), schedules: [], eligibleCarriers: new Set(['CX', 'BR']), referenceDate: '2026-09-05' };
const officialCatalog = OfficialScheduleCatalogSchema.parse({
  version: 1,
  sources: {
    official: {
      name: 'Fixture airline publication', url: 'https://example.com/official', kind: 'airline-publication',
      checkedAt: '2026-09-05T00:00:00Z', reviewBy: '2026-10-05T00:00:00Z',
    },
  },
  services: [{
    id: 'cx852', carrier: 'CX', flightNumber: '852', from: 'HKG', to: 'SEA',
    effectiveFrom: '2026-09-01', effectiveUntil: '2026-09-30', daysOfWeek: [1, 2, 3, 4, 6], sourceId: 'official',
  }],
  flightNumberReferences: [{
    id: 'sq877', carrier: 'SQ', from: 'TPE', to: 'SIN', flightNumbers: ['877'], sourceId: 'official',
  }],
});

describe('next-leg discovery', () => {
  test('network-only evidence is directional and never fabricates a schedule', () => {
    const result = buildNextLegIndex(base);
    expect(result.get('TPE')?.[0]?.options[0]?.scheduleStatus).toBe('unknown');
    expect(result.get('TPE')?.[0]?.options[0]?.schedules).toEqual([]);
    expect(result.get('TPE')?.[0]?.options[0]?.flightNumbers).toEqual([]);
    expect(result.has('HKG')).toBe(false);
  });
  test('provider-listed route remains non-operating until stronger evidence promotes it', () => {
    const listed = buildNextLegIndex({
      ...base,
      network: network([{ carrierIdentity: 'provider-listed' }]),
    }).get('TPE')?.[0]?.options[0];
    expect(listed?.identityStatus).toBe('provider-listed');
    expect(listed?.flightNumbers).toEqual([]);

    const promoted = buildNextLegIndex({
      ...base,
      network: network([{ carrierIdentity: 'provider-listed' }]),
      schedules: [schedule({ flightNumbers: ['CX473'] })],
    }).get('TPE')?.[0]?.options[0];
    expect(promoted?.identityStatus).toBeUndefined();
    expect(promoted?.flightNumbers).toEqual(['CX473']);
  });
  test('preserves original publication date even after recently inspecting the source', () => {
    expect(buildNextLegIndex(base).get('TPE')?.[0]?.options[0]?.networkSources[0]).toMatchObject({ checkedOn: '2026-09-05', publishedOn: '2025-01-01' });
  });
  test('empty eligibility never falls back to all airlines', () => {
    expect(buildNextLegIndex({ ...base, eligibleCarriers: new Set() }).size).toBe(0);
  });
  test('unknown airport endpoints cannot create selectable records', () => {
    expect(buildNextLegIndex({ ...base, knownAirports: new Set(['TPE']) }).size).toBe(0);
  });
  test('deduplicates route and schedule evidence without losing either source', () => {
    const option = buildNextLegIndex({
      ...base,
      schedules: [
        schedule({ flightNumbers: ['CX473', 'CX475'] }),
        schedule({ flightNumbers: ['CX473'] }),
      ],
    }).get('TPE')?.[0]?.options;
    expect(option).toHaveLength(1);
    expect(option?.[0]?.networkSources).toHaveLength(1);
    expect(option?.[0]?.schedules).toHaveLength(2);
    expect(option?.[0]?.flightNumbers).toEqual(['CX473', 'CX475']);
    expect(option?.[0]?.scheduleStatus).toBe('covered');
  });
  test('normalizes sourced designators to the suffix stored on a leg', () => {
    expect(flightNumberSuffix('BR', 'BR024')).toBe('024');
    expect(flightNumberSuffix('JX', 'JX0032')).toBe('0032');
    expect(flightNumberSuffix('CX', '473')).toBe('473');
    expect(flightNumberSuffix('BR', 'CX473')).toBeNull();
  });
  test('official flight-number reference is selectable without inventing a weekday claim', () => {
    const result = buildNextLegIndex({
      network: null, schedules: [], officialSchedules: officialCatalog,
      eligibleCarriers: new Set(['SQ']), referenceDate: '2026-09-07',
      evidenceNow: Date.parse('2026-09-07T00:00:00Z'), knownAirports: new Set(['TPE', 'SIN']),
    });
    const option = result.get('TPE')?.find((destination) => destination.iata === 'SIN')?.options[0];
    expect(option?.flightNumbers).toEqual(['SQ877']);
    expect(option?.scheduleStatus).toBe('unknown');
    expect(option?.flightNumberSources[0]?.url).toBe('https://example.com/official');
  });
  test('official service contributes exact designator and real weekday status', () => {
    const monday = buildNextLegIndex({
      network: null, schedules: [], officialSchedules: officialCatalog,
      eligibleCarriers: new Set(['CX']), referenceDate: '2026-09-07',
      evidenceNow: Date.parse('2026-09-07T00:00:00Z'), knownAirports: new Set(['HKG', 'SEA']),
    }).get('HKG')?.[0]?.options[0];
    const friday = buildNextLegIndex({
      network: null, schedules: [], officialSchedules: officialCatalog,
      eligibleCarriers: new Set(['CX']), referenceDate: '2026-09-11',
      evidenceNow: Date.parse('2026-09-07T00:00:00Z'), knownAirports: new Set(['HKG', 'SEA']),
    }).get('HKG')?.[0]?.options[0];
    expect(monday?.flightNumbers).toEqual(['CX852']);
    expect(monday?.scheduleStatus).toBe('covered');
    expect(friday?.flightNumbers).toEqual(['CX852']);
    expect(friday?.scheduleStatus).toBe('weekday-mismatch');
  });
  test('expired official evidence contributes neither route nor flight number', () => {
    expect(buildNextLegIndex({
      network: null, schedules: [], officialSchedules: officialCatalog,
      eligibleCarriers: new Set(['SQ']), referenceDate: '2026-09-07',
      evidenceNow: Date.parse('2026-10-06T00:00:00Z'), knownAirports: new Set(['TPE', 'SIN']),
    }).size).toBe(0);
  });
  test('official references stay directional and never create the reverse pair', () => {
    const result = buildNextLegIndex({
      network: null, schedules: [], officialSchedules: officialCatalog,
      eligibleCarriers: new Set(['SQ']), referenceDate: '2026-09-07',
      evidenceNow: Date.parse('2026-09-07T00:00:00Z'), knownAirports: new Set(['TPE', 'SIN']),
    });
    expect(result.has('TPE')).toBe(true);
    expect(result.has('SIN')).toBe(false);
  });
  test('retains independently selectable operators for one destination', () => {
    const result = buildNextLegIndex({ ...base, network: network([{}, { carrier: 'BR' }]) });
    expect(result.get('TPE')).toHaveLength(1);
    expect(result.get('TPE')?.[0]?.options.map((row) => row.carrier)).toEqual(['BR', 'CX']);
  });
  test('checks actual recorded weekdays as well as the observation window', () => {
    expect(buildNextLegIndex({ ...base, schedules: [schedule({ daysOfWeek: [1] })] }).get('TPE')?.[0]?.options[0]?.scheduleStatus).toBe('weekday-mismatch');
  });
  test.each([
    ['expired', { effectiveUntil: '2026-08-31' }],
    ['future', { effectiveFrom: '2026-10-01' }],
    ['seasonal', { seasonStart: '12-01', seasonEnd: '03-31' }],
  ])('%s schedule observations remain clearly unverified', (_label, bounds) => {
    const result = buildNextLegIndex({ ...base, schedules: [schedule(bounds)] });
    expect(result.get('TPE')?.[0]?.options[0]?.scheduleStatus).toBe('outside-window');
  });
  test('network validity alone does not assert operating days', () => {
    const result = buildNextLegIndex({ ...base, network: network([{ effectiveFrom: '2026-10-01' }]) });
    expect(result.get('TPE')?.[0]?.options[0]?.scheduleStatus).toBe('outside-window');
  });
  test('active explicit suspension wins over generic positive evidence', () => {
    expect(buildNextLegIndex({ ...base, schedules: [schedule(), schedule({ status: 'suspended' })] }).size).toBe(0);
    expect(buildNextLegIndex({ ...base, network: network([{ status: 'suspended' }]), schedules: [schedule()] }).size).toBe(0);
  });
  test('expired suspension does not erase a currently observed schedule', () => {
    const result = buildNextLegIndex({ ...base, schedules: [schedule({ status: 'suspended', effectiveUntil: '2025-12-31' }), schedule()] });
    expect(result.get('TPE')?.[0]?.options[0]?.scheduleStatus).toBe('covered');
  });
  test('a carrier suspension cannot hide the competing operator', () => {
    const result = buildNextLegIndex({ ...base, network: network([{}, { carrier: 'BR' }]), schedules: [schedule({ status: 'suspended' })] });
    expect(result.get('TPE')?.[0]?.options.map((row) => row.carrier)).toEqual(['BR']);
  });
  test('known active network gaps override generic route suggestions', () => {
    expect(buildNextLegIndex({ ...base, networkGaps: [gap()] }).size).toBe(0);
    expect(buildNextLegIndex({ ...base, networkGaps: [gap({ pair: ['HKG', 'TPE'] })] }).size).toBe(0);
  });
  test('closed, future and different-carrier gaps do not hide unrelated service', () => {
    for (const record of [gap({ until: '2025' }), gap({ since: '2027' }), gap({ carrier: 'BR' })]) {
      expect(buildNextLegIndex({ ...base, networkGaps: [record] }).has('TPE')).toBe(true);
    }
  });
  test('missing network gracefully uses schedules, and missing both returns empty', () => {
    expect(buildNextLegIndex({ ...base, network: null, schedules: [schedule()] }).has('TPE')).toBe(true);
    expect(buildNextLegIndex({ ...base, network: null }).size).toBe(0);
  });
  test('origin order is TPE-first and all other airports alphabetical', () => {
    const result = buildNextLegIndex({ ...base, network: network([{ pair: ['SFO', 'HKG'] }, {}, { pair: ['LAX', 'HKG'] }]) });
    expect([...result.keys()]).toEqual(['TPE', 'LAX', 'SFO']);
  });
  test('origin scope materializes only the requested departure airport', () => {
    const result = buildNextLegIndex({
      ...base,
      network: network([{ pair: ['SFO', 'HKG'] }, {}, { pair: ['LAX', 'HKG'] }]),
      origin: 'SFO',
    });
    expect([...result.keys()]).toEqual(['SFO']);
    expect(result.get('SFO')?.map((destination) => destination.iata)).toEqual(['HKG']);
  });
});
