import { z } from 'zod';

const Airport = z.object({ code: z.string().regex(/^[A-Z]{3}$/) }).passthrough();
const Carrier = z.object({ code: z.string().regex(/^[A-Z0-9]{2}$/), name: z.string().optional() }).passthrough();
const OperatingFlight = z.object({
  carrier: Carrier,
  equipmentType: z.object({ code: z.string().optional(), name: z.string().optional() }).passthrough().optional(),
}).passthrough();
const MarketingFlight = z.object({
  number: z.string().regex(/^\d{1,4}[A-Z]?$/),
  carrier: Carrier,
  operatingFlight: OperatingFlight,
}).passthrough();
const Segment = z.object({
  origin: Airport,
  destination: Airport,
  departureDateTime: z.string(),
  arrivalDateTime: z.string(),
  marketingFlight: MarketingFlight,
}).passthrough();
const Connection = z.object({ segments: z.array(z.unknown()).max(12) }).passthrough();
const Itinerary = z.object({ connections: z.array(Connection).max(12) }).passthrough();
const AvailableOffersPayload = z.object({ itineraries: z.array(Itinerary).max(500) }).passthrough();

const localDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::[0-5]\d(?:\.\d{1,3})?)?$/;

export interface AfklScheduleQuery {
  readonly from: string;
  readonly to: string;
  readonly date: string;
  readonly host: 'AF' | 'KL';
  readonly travelCountry?: string;
}

export interface AfklOfficialSegment {
  readonly marketingCarrier: string;
  readonly marketingFlightNumber: string;
  readonly operatingCarrier: string;
  readonly from: string;
  readonly to: string;
  readonly departureLocal: string;
  readonly arrivalLocal: string;
  readonly equipmentType?: string;
}

export interface AfklNormalizedDay {
  readonly date: string;
  readonly complete: boolean;
  readonly segments: AfklOfficialSegment[];
  readonly droppedRows: number;
}

export function buildAfklAvailableOffersRequest(query: Pick<AfklScheduleQuery, 'from' | 'to' | 'date'>) {
  if (!/^[A-Z]{3}$/.test(query.from) || !/^[A-Z]{3}$/.test(query.to) || query.from === query.to) {
    throw new Error('AFKL query requires distinct three-letter IATA airports');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(query.date) || Number.isNaN(Date.parse(`${query.date}T00:00:00Z`))) {
    throw new Error('AFKL query requires YYYY-MM-DD departure date');
  }
  return {
    commercialCabins: ['ALL'],
    passengerCount: { ADT: 1, CHD: 0, INF: 0 },
    requestedConnections: [{
      departureDate: query.date,
      origin: { airport: { code: query.from } },
      destination: { airport: { code: query.to } },
    }],
  } as const;
}

/** Normalize only exact nonstop segments returned by the official Offers API.
 * Fare duplicates are collapsed. Marketing and operating identities remain
 * separate: a marketing designator is never rewritten into an operator
 * designator when the carriers differ. */
export function normalizeAfklAvailableOffers(
  raw: unknown,
  query: Pick<AfklScheduleQuery, 'from' | 'to' | 'date'>,
): AfklNormalizedDay {
  const payload = AvailableOffersPayload.safeParse(raw);
  if (!payload.success) return { date: query.date, complete: false, segments: [], droppedRows: 1 };
  const normalized = new Map<string, AfklOfficialSegment>();
  let droppedRows = 0;
  let complete = true;

  for (const itinerary of payload.data.itineraries) {
    for (const connection of itinerary.connections) {
      // A multi-segment connection proves availability with a transfer, not a
      // nonstop route. Preserve conservative route semantics by ignoring it.
      if (connection.segments.length !== 1) continue;
      const parsed = Segment.safeParse(connection.segments[0]);
      if (!parsed.success) { complete = false; droppedRows++; continue; }
      const segment = parsed.data;
      if (segment.origin.code !== query.from || segment.destination.code !== query.to) continue;
      if (!localDateTimePattern.test(segment.departureDateTime) || !localDateTimePattern.test(segment.arrivalDateTime)) {
        complete = false; droppedRows++; continue;
      }
      if (segment.departureDateTime.slice(0, 10) !== query.date) continue;
      const flightNumber = segment.marketingFlight.number.replace(/^0+(?=\d)/, '');
      const row: AfklOfficialSegment = {
        marketingCarrier: segment.marketingFlight.carrier.code,
        marketingFlightNumber: flightNumber,
        operatingCarrier: segment.marketingFlight.operatingFlight.carrier.code,
        from: segment.origin.code,
        to: segment.destination.code,
        departureLocal: segment.departureDateTime.slice(0, 16),
        arrivalLocal: segment.arrivalDateTime.slice(0, 16),
        ...(segment.marketingFlight.operatingFlight.equipmentType?.code
          ? { equipmentType: segment.marketingFlight.operatingFlight.equipmentType.code }
          : {}),
      };
      const key = [row.marketingCarrier, row.marketingFlightNumber, row.operatingCarrier, row.departureLocal, row.arrivalLocal].join(':');
      normalized.set(key, row);
    }
  }
  return {
    date: query.date,
    complete,
    segments: [...normalized.values()].sort((a, b) => a.departureLocal.localeCompare(b.departureLocal)
      || a.marketingCarrier.localeCompare(b.marketingCarrier)
      || a.marketingFlightNumber.localeCompare(b.marketingFlightNumber)),
    droppedRows,
  };
}

export const AFKL_OFFERS_URL = 'https://api.airfranceklm.com/opendata/offers/v1/available-offers';

export function buildAfklHeaders(apiKey: string, query: Pick<AfklScheduleQuery, 'host' | 'travelCountry'>): Record<string, string> {
  if (!apiKey.trim()) throw new Error('AFKL API key is required');
  return {
    Accept: 'application/hal+json;charset=utf8',
    'Content-Type': 'application/json',
    'Accept-Language': 'en-US',
    'AFKL-TRAVEL-Host': query.host,
    'AFKL-TRAVEL-Country': query.travelCountry ?? 'US',
    'api-key': apiKey,
  };
}
