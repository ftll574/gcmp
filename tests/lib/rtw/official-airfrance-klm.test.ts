import { describe, expect, test, vi } from 'vitest';
import {
  AFKL_OFFERS_URL,
  buildAfklAvailableOffersRequest,
  normalizeAfklAvailableOffers,
} from '../../../src/lib/rtw/official-airfrance-klm.ts';
import { createAfklOfficialScheduleGateway } from '../../../server/airfrance-klm-schedules.ts';

const query = { host: 'AF' as const, from: 'CDG', to: 'JFK', date: '2026-11-02' };

function segment(marketingCarrier: string, number: string, operatingCarrier = marketingCarrier) {
  return {
    origin: { code: 'CDG' }, destination: { code: 'JFK' },
    departureDateTime: '2026-11-02T10:30:00', arrivalDateTime: '2026-11-02T13:10:00',
    marketingFlight: {
      number, carrier: { code: marketingCarrier, name: marketingCarrier },
      operatingFlight: { carrier: { code: operatingCarrier, name: operatingCarrier }, equipmentType: { code: '359' } },
    },
  };
}

describe('Air France-KLM official Offers adapter', () => {
  test('builds the documented one-adult exact-route request without credentials', () => {
    expect(buildAfklAvailableOffersRequest(query)).toEqual({
      commercialCabins: ['ALL'], passengerCount: { ADT: 1, CHD: 0, INF: 0 },
      requestedConnections: [{ departureDate: '2026-11-02', origin: { airport: { code: 'CDG' } }, destination: { airport: { code: 'JFK' } } }],
    });
    expect(AFKL_OFFERS_URL).toBe('https://api.airfranceklm.com/opendata/offers/v1/available-offers');
  });

  test('preserves marketing and operating identities and deduplicates fare copies', () => {
    const direct = segment('AF', '0008');
    const codeshare = segment('KL', '2301', 'AF');
    const result = normalizeAfklAvailableOffers({ itineraries: [
      { connections: [{ segments: [direct] }] },
      { connections: [{ segments: [direct] }] },
      { connections: [{ segments: [codeshare] }] },
      { connections: [{ segments: [segment('AF', '1111'), segment('AF', '2222')] }] },
    ] }, query);
    expect(result.complete).toBe(true);
    expect(result.droppedRows).toBe(0);
    expect(result.segments).toEqual([
      expect.objectContaining({ marketingCarrier: 'AF', marketingFlightNumber: '8', operatingCarrier: 'AF', equipmentType: '359' }),
      expect.objectContaining({ marketingCarrier: 'KL', marketingFlightNumber: '2301', operatingCarrier: 'AF' }),
    ]);
  });

  test('marks malformed direct rows partial instead of inventing schedule data', () => {
    const result = normalizeAfklAvailableOffers({ itineraries: [{ connections: [{ segments: [{ ...segment('AF', '8'), departureDateTime: 'bad' }] }] }] }, query);
    expect(result).toMatchObject({ complete: false, droppedRows: 1, segments: [] });
  });

  test('never calls the network without an API key', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const gateway = createAfklOfficialScheduleGateway({ fetchImpl });
    expect(gateway.configured).toBe(false);
    await expect(gateway.queryDay(query)).rejects.toThrow('not configured');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('uses header credentials and normalizes a successful official response', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ itineraries: [{ connections: [{ segments: [segment('AF', '008')] }] }] }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    const gateway = createAfklOfficialScheduleGateway({ apiKey: 'secret-test-key', fetchImpl });
    const result = await gateway.queryDay(query);
    expect(result.segments[0]).toMatchObject({ marketingCarrier: 'AF', marketingFlightNumber: '8', operatingCarrier: 'AF' });
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe(AFKL_OFFERS_URL);
    expect(init?.headers).toMatchObject({ 'api-key': 'secret-test-key', 'AFKL-TRAVEL-Host': 'AF' });
    expect(String(init?.body)).not.toContain('secret-test-key');
  });
});
