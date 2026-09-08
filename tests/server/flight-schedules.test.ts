import { describe, expect, test, vi } from 'vitest';
import { createScheduleGateway, normalizeCiriumDay } from '../../server/flight-schedules.ts';
import { flightDayView } from '../../src/lib/rtw/dated-flight-status.ts';
import { CLOCK, fixtureCirium } from '../fixtures/dated-schedules.ts';

const pair = { from: 'TPE', to: 'HKG' };
const date = '2026-09-07';
const query = { ...pair, start: date, end: date };
function normalize(rows: unknown[]) { return normalizeCiriumDay({ scheduledFlights: rows }, pair, date, CLOCK); }
describe('supplier normalization (synthetic fixtures)', () => {
  test('keeps operating identity and local timestamps without UTC shifting', () => {
    const result = normalize([fixtureCirium()]);
    expect(result.complete).toBe(true); expect(result.flights[0]?.carrier).toBe('CX');
    expect(result.flights[0]?.flightNumber).toBe('473');
    expect(result.flights[0]?.departureLocal).toBe('2026-09-07T18:40');
  });
  test('deduplicates a marketed codeshare using its explicit operator identity', () => {
    const result = normalize([fixtureCirium(), fixtureCirium(date, {
      carrier: { fs: 'AY', iata: 'AY' }, flightNumber: '9999', isCodeshare: true,
      operator: { carrier: { fs: 'CX', iata: 'CX' }, flightNumber: '473' },
    })]);
    expect(result.complete).toBe(true); expect(result.flights).toHaveLength(1);
    expect(result.flights[0]?.carrier).toBe('CX');
  });
  test('translates provider codes through the appendix rather than guessing IATA', () => {
    const result = normalizeCiriumDay({ scheduledFlights: [fixtureCirium(date, {
      carrier: undefined, carrierFsCode: 'CATHAY-FS', departureAirport: undefined, departureAirportFsCode: 'TAOYUAN-FS',
    })], appendix: { airlines: [{ fs: 'CATHAY-FS', iata: 'CX' }], airports: [{ fs: 'TAOYUAN-FS', iata: 'TPE' }] } }, pair, date, CLOCK);
    expect(result.flights[0]?.carrier).toBe('CX'); expect(result.complete).toBe(true);
  });
  test.each([
    { isCodeshare: true }, { isWetlease: true }, { carrier: undefined, carrierFsCode: 'ZZZ' },
    { departureTime: '2026-09-07T18:40:00Z' }, { departureTime: '2026-09-08T00:01:00.000' },
    { departureAirport: { iata: 'HKG' } }, { arrivalTime: '2026-02-30T12:00:00.000' },
  ])('unresolved/malformed passenger rows are unknown, never negative: %j', (override) => {
    const result = normalize([fixtureCirium(date, override)]);
    expect(result.complete).toBe(false); expect(result.flights).toHaveLength(0);
  });
  test('excludes cargo, surface and intermediate-stop flights', () => {
    const result = normalize([fixtureCirium(date, { serviceType: 'F' }), fixtureCirium(date, { serviceType: 'U' }), fixtureCirium(date, { stops: 1 })]);
    expect(result.complete).toBe(true); expect(result.flights).toHaveLength(0);
  });
  test('a contradictory duplicate is omitted and makes coverage partial', () => {
    const result = normalize([fixtureCirium(), fixtureCirium(date, { arrivalTime: '2026-09-07T22:00:00.000' })]);
    expect(result.complete).toBe(false); expect(result.flights).toHaveLength(0);
  });
  test('only a successful explicit empty array means no matching service', () => {
    expect(normalize([]).complete).toBe(true);
    expect(normalizeCiriumDay({}, pair, date, CLOCK).complete).toBe(false);
    expect(normalizeCiriumDay({ scheduledFlights: [], error: { message: 'secret' } }, pair, date, CLOCK).issue).toBe('provider-error');
  });
});
describe('bounded gateway', () => {
  test('limits concurrent upstream calls to four across a full-month query', async () => {
    let active = 0; let peak = 0;
    const fetchImpl = vi.fn(async () => {
      active++; peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active--; return new Response('{"scheduledFlights":[]}');
    });
    const gateway = createScheduleGateway({ appId: 'id', appKey: 'key', now: () => CLOCK, fetchImpl });
    await gateway.query({ ...query, end: '2026-09-30' });
    expect(peak).toBeLessThanOrEqual(4); expect(fetchImpl).toHaveBeenCalledTimes(24);
  });
  test('without credentials there are no upstream calls and no invented flights', async () => {
    const fetchImpl = vi.fn();
    const result = await createScheduleGateway({ now: () => CLOCK, fetchImpl }).query(query);
    expect(fetchImpl).not.toHaveBeenCalled(); expect(result.days[0]?.issue).toBe('not-configured');
  });
  test('uses secret headers, caches and coalesces identical queries', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ scheduledFlights: [fixtureCirium()] })));
    let clock = CLOCK;
    const gateway = createScheduleGateway({ appId: 'fixture-id', appKey: 'fixture-secret', fetchImpl, now: () => clock });
    const [result] = await Promise.all([gateway.query(query), gateway.query(query)]);
    await gateway.query(query); expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(call[0])).toContain('/from/TPE/to/HKG/departing/2026/9/7');
    expect(String(call[0])).not.toContain('fixture-secret');
    expect(call[1].headers).toMatchObject({ appId: 'fixture-id', appKey: 'fixture-secret' });
    expect(JSON.stringify(result)).not.toContain('fixture-secret');
    clock += 900001; await gateway.query(query); expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  test.each([401, 403, 404, 429, 500])('HTTP %i stays unknown, never zero flights', async (status) => {
    const gateway = createScheduleGateway({ appId: 'id', appKey: 'secret', now: () => CLOCK,
      fetchImpl: async () => new Response('secret provider error', { status }) });
    const result = await gateway.query(query);
    expect(result.days[0]?.issue).toBe('provider-error');
    expect(flightDayView(result.days[0], new Set(['CX']), CLOCK).status).toBe('unknown');
    expect(JSON.stringify(result)).not.toContain('secret');
  });
  test('invalid JSON, timeout and oversized payloads are errors', async () => {
    for (const fetchImpl of [async () => new Response('not json'), async () => { throw new Error('secret'); },
      async () => new Response('[]', { headers: { 'content-length': '3000000' } })]) {
      const result = await createScheduleGateway({ appId: 'id', appKey: 'key', now: () => CLOCK, fetchImpl }).query(query);
      expect(result.days[0]?.issue).toBe('provider-error');
    }
  });
  test('date-range and global-budget guards prevent excess calls', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"scheduledFlights":[]}'));
    const gateway = createScheduleGateway({ appId: 'id', appKey: 'key', now: () => CLOCK, fetchImpl, dailyBudget: 2 });
    const result = await gateway.query({ ...query, end: '2026-09-09' });
    expect(fetchImpl).toHaveBeenCalledTimes(2); expect(result.days[2]?.issue).toBe('budget-exceeded');
    await expect(gateway.query({ ...query, end: '2027-09-09' })).rejects.toThrow();
    await expect(gateway.query({ ...query, from: 'https://evil.invalid' })).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  test('the client cannot make paid calls outside the application query horizon', async () => {
    const fetchImpl = vi.fn();
    const result = await createScheduleGateway({ appId: 'id', appKey: 'key', now: () => CLOCK, fetchImpl }).query({ ...query, start: '2028-01-01', end: '2028-01-01' });
    expect(result.days[0]?.issue).toBe('out-of-range'); expect(fetchImpl).not.toHaveBeenCalled();
  });
});
