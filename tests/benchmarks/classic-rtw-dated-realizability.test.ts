import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { validateRtwRoute } from '../../src/lib/rtw/validate.ts';
import { AllianceCatalogSchema } from '../../src/lib/schemas/alliance.ts';
import { CountryContinentCatalogSchema } from '../../src/lib/schemas/country-continent.ts';
import { RouteNetworkCatalogSchema } from '../../src/lib/schemas/route-network.ts';
import { RtwRuleCatalogSchema } from '../../src/lib/schemas/rtw-rule.ts';
import type { Leg } from '../../src/lib/types.ts';

const DateSchema = z.iso.date();
const TimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const SourceSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  kind: z.enum(['airline-publication', 'industry-timetable']),
  url: z.string().url().refine((url) => url.startsWith('https://')),
  note: z.string().min(1),
}).strict();
const FlightSchema = z.object({
  date: DateSchema,
  carrier: z.string().regex(/^[A-Z0-9]{2}$/),
  flightNumber: z.string().regex(/^\d{1,4}[A-Z]?$/),
  from: z.string().regex(/^[A-Z]{3}$/),
  to: z.string().regex(/^[A-Z]{3}$/),
  departureTime: TimeSchema,
  arrivalTime: TimeSchema,
  arrivalDate: DateSchema,
  sourceIds: z.array(z.string()).min(1),
}).strict();
const BenchmarkSchema = z.object({
  version: z.literal(1),
  checkedOn: DateSchema,
  itineraryId: z.literal('eva-official-example-2026-11'),
  productId: z.literal('br-infinity-star-alliance-world-travel-award'),
  tripStart: DateSchema,
  tripEnd: DateSchema,
  sources: z.array(SourceSchema).min(1),
  flights: z.array(FlightSchema).length(8),
}).strict().superRefine((benchmark, ctx) => {
  const sourceIds = new Set(benchmark.sources.map((source) => source.id));
  if (sourceIds.size !== benchmark.sources.length) ctx.addIssue({ code: 'custom', message: 'Duplicate source id' });
  for (const [index, flight] of benchmark.flights.entries()) {
    if (flight.from === flight.to) ctx.addIssue({ code: 'custom', path: ['flights', index], message: 'Flight endpoints must differ' });
    if (flight.date < benchmark.tripStart || flight.date > benchmark.tripEnd) {
      ctx.addIssue({ code: 'custom', path: ['flights', index, 'date'], message: 'Flight outside trip window' });
    }
    if (flight.arrivalDate < flight.date) {
      ctx.addIssue({ code: 'custom', path: ['flights', index, 'arrivalDate'], message: 'Benchmark does not model date-line-backward arrivals' });
    }
    for (const sourceId of flight.sourceIds) {
      if (!sourceIds.has(sourceId)) ctx.addIssue({ code: 'custom', path: ['flights', index, 'sourceIds'], message: `Unknown source ${sourceId}` });
    }
  }
});

const benchmark = BenchmarkSchema.parse(JSON.parse(
  readFileSync('tests/fixtures/classic-rtw-dated-eva-2026-11.json', 'utf8'),
));
const airportsRaw = JSON.parse(readFileSync('public/data/airports.json', 'utf8')) as Array<{
  iata: string; name: string; city: string; country: string; lat: number; lon: number; icao?: string;
}>;
const airports = new Map(airportsRaw.map((airport) => [airport.iata, airport]));
const alliances = AllianceCatalogSchema.parse(JSON.parse(readFileSync('public/data/alliances/current.json', 'utf8')));
const products = RtwRuleCatalogSchema.parse(JSON.parse(readFileSync('public/data/rtw-products/current.json', 'utf8')));
const geo = CountryContinentCatalogSchema.parse(JSON.parse(readFileSync('public/data/geo/current.json', 'utf8')));
const routes = RouteNetworkCatalogSchema.parse(JSON.parse(readFileSync('public/data/route-network/runtime-current.json', 'utf8')));
const countryContinents = new Map(geo.mappings.map((row) => [row.country, row.continent]));
const airportContinentOverrides = new Map(geo.airportOverrides.map((row) => [row.iata, row.continent]));

function asLegs(): Leg[] {
  return benchmark.flights.map((flight, index) => ({
    from: flight.from,
    to: flight.to,
    operatingCarrier: flight.carrier,
    flightNumber: flight.flightNumber,
    departsOn: flight.date,
    cabin: 'business' as const,
    stopover: index < benchmark.flights.length - 1,
  }));
}

describe('classic RTW dated realizability — EVA official example, November 2026', () => {
  test('every dated flight has source-backed exact identity and a viable connection date', () => {
    for (let index = 0; index < benchmark.flights.length; index++) {
      const flight = benchmark.flights[index]!;
      expect(flight.sourceIds.length).toBeGreaterThan(0);
      const next = benchmark.flights[index + 1];
      if (next) expect(next.date >= flight.arrivalDate).toBe(true);
    }
    expect(benchmark.flights.map((flight) => `${flight.date} ${flight.carrier}${flight.flightNumber}`)).toEqual([
      '2026-11-02 BR198',
      '2026-11-04 NH6',
      '2026-11-06 UA2743',
      '2026-11-08 UA14',
      '2026-11-10 LH901',
      '2026-11-12 LH780',
      '2026-11-15 TG404',
      '2026-11-18 BR202',
    ]);
  });

  test('all eight exact carrier/pairs are confirmed-operating in the current GCMP route graph', () => {
    for (const flight of benchmark.flights) {
      const route = routes.routes.find((candidate) => candidate.status === 'published'
        && candidate.carrier === flight.carrier
        && candidate.pair[0] === flight.from
        && candidate.pair[1] === flight.to);
      expect(route, `${flight.carrier}${flight.flightNumber} ${flight.from}-${flight.to}`).toBeDefined();
      expect(route?.carrierIdentity ?? 'operating').toBe('operating');
    }
  });

  test('the fully dated eight-flight itinerary still passes the EVA RTW rules', () => {
    const product = products.products.find((candidate) => candidate.id === benchmark.productId);
    expect(product).toBeDefined();
    if (!product) return;
    const result = validateRtwRoute(product, asLegs(), {
      airports,
      allianceCatalog: alliances,
      countryContinents,
      airportContinentOverrides,
    }, { startDate: benchmark.tripStart, endDate: benchmark.tripEnd });

    expect(result.valid).toBe(true);
    expect(result.findings.filter((finding) => finding.severity === 'fail')).toEqual([]);
    expect(result.summary.flightSegments).toBe(8);
    expect(result.summary.knownStopovers).toBe(7);
    expect(result.summary.tripDays).toBe(17);
    expect(result.summary.direction).toBe('eastbound');
    expect(result.summary.oceansCrossed).toEqual(['atlantic', 'pacific']);
  });
});
