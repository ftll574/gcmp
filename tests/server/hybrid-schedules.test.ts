import { describe, expect, test, vi } from 'vitest';
import { createHybridScheduleGateway, selectScheduleProvider } from '../../server/hybrid-schedules.ts';

describe('route-aware automatic schedule provider selection', () => {
  test('uses TDX for Taiwan routes and Cirium for global routes when both are configured', () => {
    const available = { tdx: true, cirium: true };
    expect(selectScheduleProvider('auto', { from: 'TPE', to: 'HKG' }, available)).toBe('tdx');
    expect(selectScheduleProvider('auto', { from: 'LHR', to: 'JFK' }, available)).toBe('cirium');
  });

  test('uses Cirium for Taiwan too when TDX is unavailable, and never sends global queries to Taiwan-only TDX', () => {
    expect(selectScheduleProvider('auto', { from: 'TPE', to: 'HKG' }, { tdx: false, cirium: true })).toBe('cirium');
    expect(selectScheduleProvider('auto', { from: 'LHR', to: 'JFK' }, { tdx: true, cirium: false })).toBe('official');
  });

  test('explicit provider selection is never rewritten by auto policy', () => {
    const none = { tdx: false, cirium: false };
    expect(selectScheduleProvider('tdx', { from: 'LHR', to: 'JFK' }, none)).toBe('tdx');
    expect(selectScheduleProvider('cirium', { from: 'TPE', to: 'HKG' }, none)).toBe('cirium');
    expect(selectScheduleProvider('official', { from: 'TPE', to: 'HKG' }, none)).toBe('official');
  });

  test('auto without external credentials performs no supplier request and keeps official fallback available', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const gateway = createHybridScheduleGateway({ provider: 'auto', fetchImpl, now: () => Date.parse('2026-09-11T00:00:00Z') });
    expect(gateway.configured).toBe(false);
    expect(gateway.capabilities).toMatchObject({
      selectedProvider: 'route-aware-auto',
      automaticProviderSelection: true,
      tdxConfigured: false,
      ciriumConfigured: false,
    });
    const result = await gateway.query({ from: 'HND', to: 'TSA', start: '2026-09-11', end: '2026-09-11' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.days[0]?.published?.some((flight) => flight.carrier === 'NH')).toBe(true);
  });

  test('auto global query uses Cirium exactly once when only global credentials are configured', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{"scheduledFlights":[]}'));
    const gateway = createHybridScheduleGateway({
      provider: 'auto', appId: 'fixture-id', appKey: 'fixture-key', fetchImpl,
      now: () => Date.parse('2026-09-11T00:00:00Z'),
    });
    const result = await gateway.query({ from: 'LHR', to: 'JFK', start: '2026-09-11', end: '2026-09-11' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('/from/LHR/to/JFK/departing/2026/9/11');
    expect(result.days[0]?.complete).toBe(true);
  });
});
