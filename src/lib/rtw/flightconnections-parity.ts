import { z } from 'zod';
import type { AllianceCatalog } from '../schemas/alliance.ts';
import type { AllianceRouteEvidence, CoverageAlliance } from './alliance-coverage.ts';

const IataSchema = z.string().regex(/^[A-Z]{3}$/);
const CarrierBenchmarkSchema = z.object({
  listedDestinationCount: z.number().int().positive(),
  sourceUrl: z.string().url().optional(),
  listedAirports: z.array(IataSchema).optional(),
  routePairsComplete: z.boolean().default(false),
  routePairs: z.array(z.tuple([IataSchema, IataSchema])).default([]),
}).strict();
const AllianceBenchmarkSchema = z.object({
  sourceUrl: z.string().url(),
  sourceLastUpdated: z.iso.date(),
  destinationAirportCount: z.number().int().positive(),
  carriers: z.record(z.string().regex(/^[A-Z0-9]{2,3}$/), CarrierBenchmarkSchema),
}).strict();
export const FlightConnectionsBenchmarkSchema = z.object({
  version: z.literal(1),
  checkedOn: z.iso.date(),
  captureMethod: z.literal('manual-search-index-review'),
  termsUrl: z.string().url(),
  automationPolicy: z.string().min(1),
  alliances: z.object({
    oneworld: AllianceBenchmarkSchema,
    star: AllianceBenchmarkSchema,
    skyteam: AllianceBenchmarkSchema,
  }).strict(),
}).strict();
export type FlightConnectionsBenchmark = z.infer<typeof FlightConnectionsBenchmarkSchema>;

export interface CarrierFlightConnectionsParity {
  carrier: string;
  catalogMember: boolean;
  benchmarkListed: boolean;
  benchmarkListedDestinationCount: number | null;
  knownAirportCount: number;
  confirmedOperatingAirportCount: number;
  providerListedOnlyAirportCount: number;
  airportCountDelta: number | null;
  listedAirportSetComplete: boolean;
  missingListedAirports: ReadonlyArray<string>;
  extraKnownAirports: ReadonlyArray<string>;
  routePairsComplete: boolean;
  benchmarkRoutePairCount: number;
  missingBenchmarkRoutePairs: ReadonlyArray<string>;
  extraKnownRoutePairs: ReadonlyArray<string> | null;
  routePairParity: 'pass' | 'fail' | 'pending';
}

export interface AllianceFlightConnectionsParity {
  alliance: CoverageAlliance;
  benchmarkDestinationAirportCount: number;
  knownAirportCount: number;
  confirmedOperatingAirportCount: number;
  providerListedOnlyAirportCount: number;
  airportCountDelta: number;
  benchmarkOnlyCarriers: ReadonlyArray<string>;
  catalogOnlyCarriers: ReadonlyArray<string>;
  carriers: ReadonlyArray<CarrierFlightConnectionsParity>;
  completeRoutePairBenchmarks: number;
  totalCatalogMembers: number;
  strictRoutePairParityReady: boolean;
  strictRoutePairParityPass: boolean | null;
}

function activeOn(date: string, from?: string, until?: string | null): boolean {
  return (!from || date >= from) && (!until || date <= until);
}

function pairKey(from: string, to: string): string {
  return `${from}>${to}`;
}

export function compareFlightConnectionsBenchmark(
  benchmark: FlightConnectionsBenchmark,
  allianceCatalog: AllianceCatalog,
  evidence: Readonly<Record<CoverageAlliance, ReadonlyArray<AllianceRouteEvidence>>>,
  asOf: string,
): ReadonlyArray<AllianceFlightConnectionsParity> {
  const alliances: CoverageAlliance[] = ['oneworld', 'star', 'skyteam'];
  return alliances.map((alliance) => {
    const catalogMembers = allianceCatalog.memberships
      .filter((item) => item.alliance === alliance && item.status === 'member' && activeOn(asOf, item.effectiveFrom, item.effectiveTo))
      .map((item) => item.airline)
      .sort();
    const catalogSet = new Set(catalogMembers);
    const allianceBenchmark = benchmark.alliances[alliance];
    const benchmarkCarriers = Object.keys(allianceBenchmark.carriers).sort();
    const benchmarkSet = new Set(benchmarkCarriers);
    const allianceEvidence = evidence[alliance];
    const knownAirports = new Set(allianceEvidence.flatMap((route) => [route.from, route.to]));
    const confirmedOperatingAirports = new Set(allianceEvidence
      .filter((route) => route.identityStatus === 'confirmed-operating')
      .flatMap((route) => [route.from, route.to]));
    const providerListedOnlyAirports = new Set([...knownAirports].filter((airport) => !confirmedOperatingAirports.has(airport)));
    const carriers = [...new Set([...catalogMembers, ...benchmarkCarriers])].sort().map((carrier): CarrierFlightConnectionsParity => {
      const rows = allianceEvidence.filter((route) => route.carrier === carrier);
      const knownAirportSet = new Set(rows.flatMap((route) => [route.from, route.to]));
      const confirmedOperatingAirportSet = new Set(rows
        .filter((route) => route.identityStatus === 'confirmed-operating')
        .flatMap((route) => [route.from, route.to]));
      const providerListedOnlyAirportSet = new Set([...knownAirportSet]
        .filter((airport) => !confirmedOperatingAirportSet.has(airport)));
      const knownPairs = new Set(rows.map((route) => pairKey(route.from, route.to)));
      const carrierBenchmark = allianceBenchmark.carriers[carrier];
      const listedAirports = new Set(carrierBenchmark?.listedAirports ?? []);
      const benchmarkPairs = new Set((carrierBenchmark?.routePairs ?? []).map(([from, to]) => pairKey(from, to)));
      const missingListedAirports = [...listedAirports].filter((airport) => !knownAirportSet.has(airport)).sort();
      const extraKnownAirports = carrierBenchmark?.listedAirports
        ? [...knownAirportSet].filter((airport) => !listedAirports.has(airport)).sort()
        : [];
      const missingBenchmarkRoutePairs = [...benchmarkPairs].filter((pair) => !knownPairs.has(pair)).sort();
      const routePairsComplete = carrierBenchmark?.routePairsComplete === true;
      const extraKnownRoutePairs = routePairsComplete
        ? [...knownPairs].filter((pair) => !benchmarkPairs.has(pair)).sort()
        : null;
      const routePairParity: CarrierFlightConnectionsParity['routePairParity'] = !routePairsComplete
        ? 'pending'
        : missingBenchmarkRoutePairs.length === 0 && extraKnownRoutePairs?.length === 0
          ? 'pass'
          : 'fail';
      return {
        carrier,
        catalogMember: catalogSet.has(carrier),
        benchmarkListed: benchmarkSet.has(carrier),
        benchmarkListedDestinationCount: carrierBenchmark?.listedDestinationCount ?? null,
        knownAirportCount: knownAirportSet.size,
        confirmedOperatingAirportCount: confirmedOperatingAirportSet.size,
        providerListedOnlyAirportCount: providerListedOnlyAirportSet.size,
        airportCountDelta: carrierBenchmark ? knownAirportSet.size - carrierBenchmark.listedDestinationCount : null,
        listedAirportSetComplete: carrierBenchmark?.listedAirports !== undefined,
        missingListedAirports,
        extraKnownAirports,
        routePairsComplete,
        benchmarkRoutePairCount: benchmarkPairs.size,
        missingBenchmarkRoutePairs,
        extraKnownRoutePairs,
        routePairParity,
      };
    });
    const benchmarkOnlyCarriers = benchmarkCarriers.filter((carrier) => !catalogSet.has(carrier));
    const catalogOnlyCarriers = catalogMembers.filter((carrier) => !benchmarkSet.has(carrier));
    const completeRoutePairBenchmarks = carriers.filter((carrier) => carrier.catalogMember && carrier.routePairsComplete).length;
    const strictRoutePairParityReady = benchmarkOnlyCarriers.length === 0
      && catalogOnlyCarriers.length === 0
      && completeRoutePairBenchmarks === catalogMembers.length;
    return {
      alliance,
      benchmarkDestinationAirportCount: allianceBenchmark.destinationAirportCount,
      knownAirportCount: knownAirports.size,
      confirmedOperatingAirportCount: confirmedOperatingAirports.size,
      providerListedOnlyAirportCount: providerListedOnlyAirports.size,
      airportCountDelta: knownAirports.size - allianceBenchmark.destinationAirportCount,
      benchmarkOnlyCarriers,
      catalogOnlyCarriers,
      carriers,
      completeRoutePairBenchmarks,
      totalCatalogMembers: catalogMembers.length,
      strictRoutePairParityReady,
      strictRoutePairParityPass: strictRoutePairParityReady
        ? carriers.filter((carrier) => carrier.catalogMember).every((carrier) => carrier.routePairParity === 'pass')
        : null,
    };
  });
}
