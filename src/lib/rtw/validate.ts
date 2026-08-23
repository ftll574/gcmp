import type { Airport, Leg, RoutingRequest } from '../types.ts';
import type { AllianceCatalog } from '../schemas/alliance.ts';
import type { RtwRuleSet, RtwSurfaceDistancePolicy } from '../schemas/rtw-rule.ts';
import type { NetworkGapEntry } from '../schemas/network-gaps.ts';
import type { ContinentId } from '../schemas/country-continent.ts';
import { distanceNm } from '../calc/haversine.ts';
import { continentsVisited } from './continents.ts';

/**
 * Statute miles per nautical mile. RTW distance caps and award-pricing
 * bands are published in (statute) miles, while the calc layer's
 * haversine `distanceNm` works in nautical miles; the rtw layer converts
 * once at aggregation so every cap/band comparison is in statute miles.
 */
export const MILES_PER_NAUTICAL_MILE = 1.15078;

export type RtwFindingSeverity = 'pass' | 'warning' | 'fail' | 'unknown';

export interface RtwFinding {
  readonly ruleId: string;
  readonly severity: RtwFindingSeverity;
  readonly message: string;
  readonly messageKey?: string;
  readonly messageParams?: Readonly<Record<string, string | number>>;
  readonly affectedLegIndexes?: ReadonlyArray<number>;
  readonly sourceUrl?: string;
}

export interface RtwValidationSummary {
  readonly flightSegments: number;
  readonly surfaceSectors: number;
  readonly knownStopovers: number;
  readonly knownTransfers: number;
  readonly unknownStopovers: number;
  readonly totalDistanceMiles: number;
  readonly ineligibleLegIndexes: ReadonlyArray<number>;
  /**
   * Unique continents in first-visit itinerary order (docs/decisions/
   * continents-visited.md). Surface sectors count at both endpoints;
   * unknown airports / unmapped countries are skipped silently.
   * Falls back to [] when `inputs.countryContinents` is absent.
   */
  readonly continentsVisited: ReadonlyArray<ContinentId>;
  readonly oceansCrossed: ReadonlyArray<'pacific' | 'atlantic'>;
  readonly direction: 'eastbound' | 'westbound' | 'mixed' | 'unknown';
  readonly repeatedStopoverCities: ReadonlyArray<string>;
  readonly repeatedSurfaceCities: ReadonlyArray<string>;
  /**
   * Cities whose single largest visit exceeds limits.maxTransfersPerCity
   * (see transferCityCounts). Empty when the product declares no cap.
   */
  readonly repeatedTransferCities: ReadonlyArray<string>;
  readonly tripDays: number | null;
}

export interface RtwValidationResult {
  readonly productId: string;
  readonly valid: boolean;
  readonly summary: RtwValidationSummary;
  readonly findings: ReadonlyArray<RtwFinding>;
}

export interface RtwValidationInputs {
  readonly airports: ReadonlyMap<string, Airport>;
  readonly allianceCatalog: AllianceCatalog;
  /**
   * Optional country→continent base map built from
   * `public/data/geo/current.json` (CountryContinentCatalogSchema).
   * Backward-compatible: when absent, summary.continentsVisited falls
   * back to [] and every other behavior is unchanged.
   */
  readonly countryContinents?: ReadonlyMap<string, ContinentId> | undefined;
  /**
   * Optional airport-level continent overrides built from
   * `public/data/geo/current.json` `.airportOverrides` (keyed by IATA).
   * Lookup order (spec §8 Q5): override first, then the country row.
   * Backward-compatible: when absent, only the country rows apply.
   */
  readonly airportContinentOverrides?: ReadonlyMap<string, ContinentId> | undefined;
  /**
   * Optional network-gap watchlist built from
   * `public/data/network-gaps/current.json` (NetworkGapCatalogSchema).
   * When set, an operating carrier flying a watched pair emits a WARNING
   * finding (docs/calibration-set.md addendum A2 — e.g. BR ceased TPE–GUM
   * in 2017-06, so TPE→Japan→GUM constructions became unissuable).
   * Backward-compatible: when absent, nothing changes.
   */
  readonly networkGaps?: ReadonlyArray<NetworkGapEntry> | undefined;
  /**
   * Optional TRUE open-jaw gaps of a multi-group routing, as IATA pairs
   * derived by the caller from group boundaries (last airport of group k →
   * first airport of group k+1 — decision record
   * docs/decisions/open-jaw-distance.md D1/D2). The engine never infers
   * jaws from leg structure and stays pure: no group parsing here.
   *
   * Jaws are DISTANCE-ONLY (D4): they enter `summary.totalDistanceMiles`
   * solely when the product's `openJawDistancePolicy` counts them, and are
   * invisible to every other check — segments, stopover/transfer/surface
   * city counting, ocean crossings, direction, start/end. Unknown airport
   * codes in a pair skip that jaw silently, consistent with unknown-airport
   * handling elsewhere. Backward-compatible: when absent, nothing changes.
   */
  readonly openJawSectors?: ReadonlyArray<{ from: string; to: string }> | undefined;
}

function source(ruleSet: RtwRuleSet): string | undefined {
  return ruleSet.sourceUrls[0];
}

function localizedFinding(
  finding: RtwFinding,
  messageKey: string,
  messageParams?: Readonly<Record<string, string | number>>,
): RtwFinding {
  return {
    ...finding,
    messageKey,
    ...(messageParams !== undefined ? { messageParams } : {}),
  };
}

function activeAllianceMembers(ruleSet: RtwRuleSet, catalog: AllianceCatalog): ReadonlySet<string> {
  const eligibility = ruleSet.airlineEligibility;
  if (eligibility.type === 'explicit-airline-set') {
    return new Set(eligibility.airlines);
  }

  return new Set(
    catalog.memberships
      .filter((m) => m.alliance === eligibility.alliance)
      .filter((m) => m.status === 'member' || (eligibility.includeAffiliates && m.status === 'affiliate'))
      .map((m) => m.airline),
  );
}

function airportFor(code: string, inputs: RtwValidationInputs): Airport | undefined {
  return inputs.airports.get(code);
}

function sameCity(a: Airport, b: Airport): boolean {
  return a.iata === b.iata;
}

function sameCountry(a: Airport, b: Airport): boolean {
  return a.country === b.country;
}

function totalDistanceMiles(
  legs: ReadonlyArray<Leg>,
  inputs: RtwValidationInputs,
  surfacePolicy: RtwSurfaceDistancePolicy,
): number {
  let totalNm = 0;
  for (const leg of legs) {
    if (surfacePolicy === 'excluded-from-distance' && leg.surface === true) continue;
    const from = airportFor(leg.from, inputs);
    const to = airportFor(leg.to, inputs);
    if (!from || !to) continue;
    totalNm += distanceNm(from, to);
  }
  return Math.round(totalNm * MILES_PER_NAUTICAL_MILE);
}

/**
 * True open-jaw gap distance in statute miles (decision record
 * docs/decisions/open-jaw-distance.md D2/D3): the caller-supplied IATA
 * pairs are aggregated with the same single rounding as legs — nautical GC
 * miles summed across all jaws, converted once, rounded once — then added
 * to the rounded leg total. Rounding the jaw set separately (instead of
 * folding it into the leg sum) guarantees the delta versus a jaw-free
 * itinerary is EXACTLY round(jawNm × MILES_PER_NAUTICAL_MILE). Unknown
 * airport codes skip that jaw silently, mirroring unknown-leg handling.
 *
 * D4: this is the ONLY consumer of openJawSectors in the engine.
 */
function openJawDistanceMiles(
  sectors: ReadonlyArray<{ from: string; to: string }> | undefined,
  inputs: RtwValidationInputs,
): number {
  if (!sectors || sectors.length === 0) return 0;
  let totalNm = 0;
  for (const sector of sectors) {
    const from = airportFor(sector.from, inputs);
    const to = airportFor(sector.to, inputs);
    if (!from || !to) continue;
    totalNm += distanceNm(from, to);
  }
  return Math.round(totalNm * MILES_PER_NAUTICAL_MILE);
}

function flightSegmentCount(legs: ReadonlyArray<Leg>): number {
  return legs.filter((leg) => leg.surface !== true).length;
}

function surfaceSectorCount(legs: ReadonlyArray<Leg>): number {
  return legs.filter((leg) => leg.surface === true).length;
}

function knownStopoverCount(legs: ReadonlyArray<Leg>): number {
  return legs.filter((leg) => leg.stopover === true).length;
}

function knownTransferCount(legs: ReadonlyArray<Leg>): number {
  return legs.filter((leg) => leg.surface !== true && leg.stopover === false).length;
}

function unknownStopoverCount(legs: ReadonlyArray<Leg>): number {
  return legs.filter((leg) => leg.surface !== true && leg.stopover === undefined).length;
}

function startAirport(legs: ReadonlyArray<Leg>, inputs: RtwValidationInputs): Airport | undefined {
  const first = legs[0];
  return first ? airportFor(first.from, inputs) : undefined;
}

function endAirport(legs: ReadonlyArray<Leg>, inputs: RtwValidationInputs): Airport | undefined {
  const last = legs.at(-1);
  return last ? airportFor(last.to, inputs) : undefined;
}

function parseDateUtc(date: string | undefined): number | null {
  if (!date) return null;
  const parsed = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

function tripDays(startDate: string | undefined, endDate: string | undefined): number | null {
  const start = parseDateUtc(startDate);
  const end = parseDateUtc(endDate);
  if (start === null || end === null) return null;
  return Math.round((end - start) / 86_400_000) + 1;
}

function resolvedLegAirports(
  legs: ReadonlyArray<Leg>,
  inputs: RtwValidationInputs,
): ReadonlyArray<{ leg: Leg; from: Airport; to: Airport; index: number }> {
  return legs.flatMap((leg, index) => {
    const from = airportFor(leg.from, inputs);
    const to = airportFor(leg.to, inputs);
    return from && to ? [{ leg, from, to, index }] : [];
  });
}

function shortestLongitudeDelta(fromLon: number, toLon: number): number {
  let delta = toLon - fromLon;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
}

function routeDirection(
  legs: ReadonlyArray<Leg>,
  inputs: RtwValidationInputs,
): RtwValidationSummary['direction'] {
  const deltas = resolvedLegAirports(legs, inputs)
    .filter(({ leg }) => leg.surface !== true)
    .map(({ from, to }) => shortestLongitudeDelta(from.lon, to.lon))
    .filter((delta) => Math.abs(delta) >= 5);
  if (deltas.length === 0) return 'unknown';
  const east = deltas.filter((delta) => delta > 0).length;
  const west = deltas.filter((delta) => delta < 0).length;
  if (east > 0 && west === 0) return 'eastbound';
  if (west > 0 && east === 0) return 'westbound';
  return 'mixed';
}

function regionForOcean(airport: Airport): 'americas' | 'eurafrica' | 'asiaPacific' {
  if (airport.lon <= -30) return 'americas';
  if (airport.lon >= -30 && airport.lon <= 60) return 'eurafrica';
  return 'asiaPacific';
}

function cityKey(airport: Airport): string {
  return `${airport.city.toUpperCase()}|${airport.country.toUpperCase()}`;
}

function repeatedCities(
  counts: ReadonlyMap<string, { label: string; count: number }>,
  maxPerCity: number,
): ReadonlyArray<string> {
  return [...counts.values()]
    .filter((entry) => entry.count > maxPerCity)
    .map((entry) => entry.label)
    .sort();
}

function stopoverCityCounts(
  legs: ReadonlyArray<Leg>,
  inputs: RtwValidationInputs,
): ReadonlyMap<string, { label: string; count: number }> {
  const counts = new Map<string, { label: string; count: number }>();
  for (const { leg, to } of resolvedLegAirports(legs, inputs)) {
    if (leg.stopover !== true) continue;
    const key = cityKey(to);
    const prev = counts.get(key);
    counts.set(key, { label: `${to.city}, ${to.country}`, count: (prev?.count ?? 0) + 1 });
  }
  return counts;
}

/**
 * Transfers per city, mirroring stopoverCityCounts(): every resolved leg
 * arriving at a city WITHOUT `stopover === true` is one transfer there —
 * including surface sectors and legs with unknown timing metadata, exactly
 * as stopover counting treats every resolved arrival uniformly.
 *
 * The Qantas oneworld Classic Flight Reward caps transfers "in any one
 * city" (docs/rtw-pivot-plan.md), which reads as a cap PER CITY CALL, not
 * across the whole itinerary: consecutive arrivals into the same city form
 * one visit (TPE-NRT then NRT⇢HND surface = two arrivals, one Tokyo call),
 * while a separate later pass through the city starts a fresh visit. Each
 * city's count is therefore its LARGEST single visit:
 *
 *   TPE --NRT--> --surf--> HND ---SIN---> ... --NRT--> ...
 *         \___ Tokyo visit: 2 __/          new Tokyo visit: restarts at 1
 *
 * A marked stopover is never a transfer and closes any open visit. This
 * keeps legitimate multi-pass routings legal (the Case 2 calibration loop
 * transits HKG repeatedly, once per pass) while failing absurd funneling
 * like NRT-HND-NRT-HND through one metropolitan complex.
 */
function transferCityCounts(
  legs: ReadonlyArray<Leg>,
  inputs: RtwValidationInputs,
): ReadonlyMap<string, { label: string; count: number }> {
  const counts = new Map<string, { label: string; count: number }>();
  let visitKey: string | null = null;
  let visitCount = 0;
  for (const { leg, to } of resolvedLegAirports(legs, inputs)) {
    if (leg.stopover === true) {
      visitKey = null;
      visitCount = 0;
      continue;
    }
    const key = cityKey(to);
    if (key === visitKey) {
      visitCount += 1;
    } else {
      visitKey = key;
      visitCount = 1;
    }
    const prev = counts.get(key);
    if (visitCount > (prev?.count ?? 0)) {
      counts.set(key, { label: `${to.city}, ${to.country}`, count: visitCount });
    }
  }
  return counts;
}

function surfaceCityCounts(
  legs: ReadonlyArray<Leg>,
  inputs: RtwValidationInputs,
): ReadonlyMap<string, { label: string; count: number }> {
  const counts = new Map<string, { label: string; count: number }>();
  for (const { leg, from, to } of resolvedLegAirports(legs, inputs)) {
    if (leg.surface !== true) continue;
    for (const airport of [from, to]) {
      const key = cityKey(airport);
      const prev = counts.get(key);
      counts.set(key, { label: `${airport.city}, ${airport.country}`, count: (prev?.count ?? 0) + 1 });
    }
  }
  return counts;
}

function oceansCrossed(
  legs: ReadonlyArray<Leg>,
  inputs: RtwValidationInputs,
): ReadonlyArray<'pacific' | 'atlantic'> {
  const oceans = new Set<'pacific' | 'atlantic'>();
  for (const { leg, from, to } of resolvedLegAirports(legs, inputs)) {
    if (leg.surface === true) continue;
    const a = regionForOcean(from);
    const b = regionForOcean(to);
    if (
      (a === 'americas' && b === 'asiaPacific') ||
      (a === 'asiaPacific' && b === 'americas')
    ) {
      oceans.add('pacific');
    }
    if (
      (a === 'americas' && b === 'eurafrica') ||
      (a === 'eurafrica' && b === 'americas')
    ) {
      oceans.add('atlantic');
    }
  }
  return [...oceans].sort();
}

export function validateRtwRoute(
  ruleSet: RtwRuleSet,
  legs: ReadonlyArray<Leg>,
  inputs: RtwValidationInputs,
  request?: Pick<RoutingRequest, 'startDate' | 'endDate'>,
): RtwValidationResult {
  const findings: RtwFinding[] = [];
  const sourceUrl = source(ruleSet);
  const segmentCount = flightSegmentCount(legs);
  const surfaceCount = surfaceSectorCount(legs);
  const stopoverCount = knownStopoverCount(legs);
  const transferCount = knownTransferCount(legs);
  const unknownStops = unknownStopoverCount(legs);
  // Open-jaw distance policy (docs/decisions/open-jaw-distance.md D3):
  // jaws add priced miles ONLY when the product opts into
  // 'counts-toward-distance' (currently just the CX oneworld Multi-carrier
  // award, per FT 2184572). D4 — jaws must stay INVISIBLE to every other
  // check below: flightSegmentCount, stopover/transfer/surface city
  // counting, oceansCrossed, routeDirection, and start/end all read `legs`
  // and never `inputs.openJawSectors`. Do not wire jaws anywhere else.
  const miles =
    totalDistanceMiles(legs, inputs, ruleSet.surfaceDistancePolicy) +
    (ruleSet.openJawDistancePolicy === 'counts-toward-distance'
      ? openJawDistanceMiles(inputs.openJawSectors, inputs)
      : 0);
  const crossedOceans = oceansCrossed(legs, inputs);
  const visitedContinents = continentsVisited(legs, inputs);
  const direction = routeDirection(legs, inputs);

  if (ruleSet.status !== 'active') {
    findings.push({
      ruleId: 'product-status',
      severity: 'warning',
      message: ruleSet.bookingStatusNote ?? `${ruleSet.label} is ${ruleSet.status}.`,
      messageKey: ruleSet.bookingStatusNote ? 'rtw.findings.productStatusNote' : 'rtw.findings.productStatus',
      messageParams: {
        note: ruleSet.bookingStatusNote ?? '',
        label: ruleSet.label,
        status: ruleSet.status,
      },
      ...(sourceUrl ? { sourceUrl } : {}),
    });
  }

  const members = activeAllianceMembers(ruleSet, inputs.allianceCatalog);
  const ineligibleLegIndexes = legs
    .map((leg, index) => ({ leg, index }))
    .filter(({ leg }) => leg.surface !== true)
    .filter(({ leg }) => !members.has(leg.operatingCarrier))
    .map(({ index }) => index);

  const flownCarriers = new Set(
    legs
      .filter((leg) => leg.surface !== true)
      .map((leg) => leg.operatingCarrier),
  );

  findings.push(localizedFinding(
    {
      ruleId: 'airline-eligibility',
      severity: ineligibleLegIndexes.length === 0 ? 'pass' : 'fail',
      message:
        ineligibleLegIndexes.length === 0
          ? 'All operating carriers match this product eligibility rule.'
          : 'One or more operating carriers are not eligible for this product.',
      ...(ineligibleLegIndexes.length > 0 ? { affectedLegIndexes: ineligibleLegIndexes } : {}),
      ...(sourceUrl ? { sourceUrl } : {}),
    },
    ineligibleLegIndexes.length === 0
      ? 'rtw.findings.airlineEligibilityPass'
      : 'rtw.findings.airlineEligibilityFail',
  ));

  // Network-gap watchlist warnings (docs/calibration-set.md addendum A2):
  // a carrier is commonly ASSUMED to serve a pair but no longer flies it
  // (e.g. BR ceased TPE–GUM in 2017-06, so TPE→Japan→GUM constructions
  // became unissuable). Warning only — never a fail — because the same
  // pair can be structurally valid under other constructions.
  if (inputs.networkGaps !== undefined && inputs.networkGaps.length > 0) {
    const tripStartYm = request?.startDate?.slice(0, 7);
    const gapMatches = new Map<string, { gap: NetworkGapEntry; legIndexes: number[] }>();
    for (const [index, leg] of legs.entries()) {
      if (leg.surface === true) continue;
      for (const gap of inputs.networkGaps) {
        const [a, b] = gap.pair;
        const matchesPair =
          (leg.from === a && leg.to === b) || (leg.from === b && leg.to === a);
        if (!matchesPair || leg.operatingCarrier !== gap.carrier) continue;
        // Window check against the trip start month (`YYYY` and `YYYY-MM`
        // both normalize to YYYY-MM, where string comparison is correct).
        // Trips without dates conservatively see every entry; entries
        // without an end date are treated as still-current.
        if (tripStartYm !== undefined) {
          const sinceYm = gap.since.length === 4 ? `${gap.since}-01` : gap.since;
          const untilYm =
            gap.until === null ? null : gap.until.length === 4 ? `${gap.until}-01` : gap.until;
          if (tripStartYm < sinceYm || (untilYm !== null && tripStartYm > untilYm)) continue;
        }
        const key = `${gap.carrier}|${[...gap.pair].sort().join('-')}`;
        const match = gapMatches.get(key);
        if (match === undefined) {
          gapMatches.set(key, { gap, legIndexes: [index] });
        } else {
          match.legIndexes.push(index);
        }
      }
    }
    for (const { gap, legIndexes } of gapMatches.values()) {
      const [from, to] = gap.pair;
      const evidence = gap.evidence[0];
      findings.push(localizedFinding(
        {
          ruleId: 'network-gap',
          severity: 'warning',
          message:
            gap.until === null
              ? `${gap.carrier} does not operate ${from}-${to} (ceased ${gap.since}); verify this sector.`
              : `${gap.carrier} did not operate ${from}-${to} between ${gap.since} and ${gap.until}.`,
          ...(legIndexes.length > 0 ? { affectedLegIndexes: legIndexes } : {}),
          ...(evidence !== undefined ? { sourceUrl: evidence } : {}),
        },
        gap.until === null ? 'rtw.findings.networkGapOpen' : 'rtw.findings.networkGapUntil',
        {
          carrier: gap.carrier,
          from,
          to,
          since: gap.since,
          until: gap.until ?? '',
        },
      ));
    }
  }

  const {
    minFlights,
    maxFlights,
    maxDistanceMiles,
    minStopovers,
    maxStopovers,
    maxTransfers,
    maxTransfersPerCity,
    maxSurfaceSectors,
    maxStopoversPerCity,
  } = ruleSet.limits;
  const stopoverCountsByCity = stopoverCityCounts(legs, inputs);
  const surfaceCountsByCity = surfaceCityCounts(legs, inputs);
  const transferCountsByCity = transferCityCounts(legs, inputs);
  const repeatedStopoverCities = maxStopoversPerCity === undefined
    ? []
    : repeatedCities(stopoverCountsByCity, maxStopoversPerCity);
  const repeatedSurfaceCities = maxSurfaceSectors === undefined
    ? []
    : repeatedCities(surfaceCountsByCity, 1);
  const repeatedTransferCities = maxTransfersPerCity === undefined
    ? []
    : repeatedCities(transferCountsByCity, maxTransfersPerCity);
  const days = tripDays(request?.startDate, request?.endDate);
  if (minFlights !== undefined || maxFlights !== undefined) {
    const tooFew = minFlights !== undefined && segmentCount < minFlights;
    const tooMany = maxFlights !== undefined && segmentCount > maxFlights;
    const allowedMax = maxFlights ?? 'unlimited';
    findings.push(localizedFinding(
      {
        ruleId: 'flight-segments',
        severity: tooFew || tooMany ? 'fail' : 'pass',
        message:
          tooFew || tooMany
            ? `Route has ${segmentCount} flight segments; allowed range is ${minFlights ?? 0}-${allowedMax}.`
            : `Route has ${segmentCount} flight segments within the allowed range.`,
        ...(sourceUrl ? { sourceUrl } : {}),
      },
      tooFew || tooMany ? 'rtw.findings.flightSegmentsFail' : 'rtw.findings.flightSegmentsPass',
      { count: segmentCount, min: minFlights ?? 0, max: allowedMax },
    ));
  }

  if (maxDistanceMiles !== undefined) {
    findings.push(localizedFinding(
      {
        ruleId: 'max-distance',
        severity: miles > maxDistanceMiles ? 'fail' : 'pass',
        message:
          miles > maxDistanceMiles
            ? `Route is ${miles.toLocaleString()} miles; maximum is ${maxDistanceMiles.toLocaleString()} miles.`
            : `Route is ${miles.toLocaleString()} miles within the ${maxDistanceMiles.toLocaleString()} mile cap.`,
        ...(sourceUrl ? { sourceUrl } : {}),
      },
      miles > maxDistanceMiles ? 'rtw.findings.maxDistanceFail' : 'rtw.findings.maxDistancePass',
      { miles: miles.toLocaleString(), max: maxDistanceMiles.toLocaleString() },
    ));
  }

  if (ruleSet.limits.minTripDays !== undefined || ruleSet.limits.maxTripMonths !== undefined) {
    const minDays = ruleSet.limits.minTripDays;
    const maxDays = ruleSet.limits.maxTripMonths === undefined
      ? undefined
      : Math.round(ruleSet.limits.maxTripMonths * 30.4375);
    const tooShort = days !== null && minDays !== undefined && days < minDays;
    const tooLong = days !== null && maxDays !== undefined && days > maxDays;
    const allowedMax = maxDays ?? 'unlimited';
    const key = days === null
      ? 'rtw.findings.tripDurationUnknown'
      : tooShort || tooLong
        ? 'rtw.findings.tripDurationFail'
        : 'rtw.findings.tripDurationPass';
    findings.push(localizedFinding(
      {
        ruleId: 'trip-duration',
        severity: days === null ? 'unknown' : tooShort || tooLong ? 'fail' : 'pass',
        message:
          days === null
            ? 'Trip duration cannot be checked until start and end dates are set.'
            : tooShort || tooLong
              ? `Trip is ${days} days; allowed range is ${minDays ?? 1}-${allowedMax} days.`
              : `Trip is ${days} days, within the allowed duration.`,
        ...(sourceUrl ? { sourceUrl } : {}),
      },
      key,
      { days: days ?? 0, min: minDays ?? 1, max: allowedMax },
    ));
  }

  if (minStopovers !== undefined || maxStopovers !== undefined) {
    const tooFew = minStopovers !== undefined && stopoverCount < minStopovers && unknownStops === 0;
    const tooMany = maxStopovers !== undefined && stopoverCount > maxStopovers;
    const allowedMax = maxStopovers ?? 'unlimited';
    const key = unknownStops > 0 && !tooMany
      ? 'rtw.findings.stopoversUnknown'
      : tooMany || tooFew
        ? 'rtw.findings.stopoversFail'
        : 'rtw.findings.stopoversPass';
    findings.push(localizedFinding(
      {
        ruleId: 'stopovers',
        severity: tooMany || tooFew ? 'fail' : unknownStops > 0 ? 'unknown' : 'pass',
        message:
          unknownStops > 0 && !tooMany
            ? `${stopoverCount} stopovers marked, ${unknownStops} segment(s) unknown. Mark stopover/transfer to complete this rule.`
            : tooMany || tooFew
              ? `Route has ${stopoverCount} stopovers; allowed range is ${minStopovers ?? 0}-${allowedMax}.`
              : `Route has ${stopoverCount} stopovers within the allowed range.`,
        ...(sourceUrl ? { sourceUrl } : {}),
      },
      key,
      { count: stopoverCount, unknown: unknownStops, min: minStopovers ?? 0, max: allowedMax },
    ));
  }

  if (maxTransfers !== undefined) {
    const key = unknownStops > 0 && transferCount <= maxTransfers
      ? 'rtw.findings.transfersUnknown'
      : transferCount > maxTransfers
        ? 'rtw.findings.transfersFail'
        : 'rtw.findings.transfersPass';
    findings.push(localizedFinding(
      {
        ruleId: 'transfers',
        severity: transferCount > maxTransfers ? 'fail' : unknownStops > 0 ? 'unknown' : 'pass',
        message:
          unknownStops > 0 && transferCount <= maxTransfers
            ? `${transferCount} transfers marked, ${unknownStops} segment(s) unknown. Mark stopover/transfer to complete this rule.`
            : transferCount > maxTransfers
              ? `Route has ${transferCount} transfers; maximum is ${maxTransfers}.`
              : `Route has ${transferCount} transfers within the ${maxTransfers} transfer cap.`,
        ...(sourceUrl ? { sourceUrl } : {}),
      },
      key,
      { count: transferCount, unknown: unknownStops, max: maxTransfers },
    ));
  }

  if (maxSurfaceSectors !== undefined) {
    findings.push(localizedFinding(
      {
        ruleId: 'surface-sectors',
        severity: surfaceCount > maxSurfaceSectors ? 'fail' : 'pass',
        message:
          surfaceCount > maxSurfaceSectors
            ? `Route has ${surfaceCount} surface sectors; maximum is ${maxSurfaceSectors}.`
            : `Route has ${surfaceCount} surface sectors within the ${maxSurfaceSectors} sector cap.`,
        ...(sourceUrl ? { sourceUrl } : {}),
      },
      surfaceCount > maxSurfaceSectors ? 'rtw.findings.surfaceSectorsFail' : 'rtw.findings.surfaceSectorsPass',
      { count: surfaceCount, max: maxSurfaceSectors },
    ));
  }

  if (maxStopoversPerCity !== undefined) {
    findings.push(localizedFinding(
      {
        ruleId: 'stopovers-per-city',
        severity: repeatedStopoverCities.length === 0 ? 'pass' : 'fail',
        message:
          repeatedStopoverCities.length === 0
            ? `No city exceeds the ${maxStopoversPerCity} stopover-per-city cap.`
            : `Stopover repeated too many times in: ${repeatedStopoverCities.join(', ')}.`,
        ...(sourceUrl ? { sourceUrl } : {}),
      },
      repeatedStopoverCities.length === 0
        ? 'rtw.findings.stopoversPerCityPass'
        : 'rtw.findings.stopoversPerCityFail',
      { max: maxStopoversPerCity, cities: repeatedStopoverCities.join(', ') },
    ));
  }

  if (maxTransfersPerCity !== undefined) {
    findings.push(localizedFinding(
      {
        ruleId: 'transfers-per-city',
        severity: repeatedTransferCities.length === 0 ? 'pass' : 'fail',
        message:
          repeatedTransferCities.length === 0
            ? `No city exceeds the ${maxTransfersPerCity} transfer-per-city cap.`
            : `Transfers repeated too many times in: ${repeatedTransferCities.join(', ')}.`,
        ...(sourceUrl ? { sourceUrl } : {}),
      },
      repeatedTransferCities.length === 0
        ? 'rtw.findings.transfersPerCityPass'
        : 'rtw.findings.transfersPerCityFail',
      { max: maxTransfersPerCity, cities: repeatedTransferCities.join(', ') },
    ));
  }

  if (maxSurfaceSectors !== undefined && surfaceCount > 0) {
    findings.push(localizedFinding(
      {
        ruleId: 'surface-cities',
        severity: repeatedSurfaceCities.length === 0 ? 'pass' : 'fail',
        message:
          repeatedSurfaceCities.length === 0
            ? 'Surface/open-jaw endpoints are not repeated.'
            : `Surface/open-jaw endpoint repeated too many times in: ${repeatedSurfaceCities.join(', ')}.`,
        ...(sourceUrl ? { sourceUrl } : {}),
      },
      repeatedSurfaceCities.length === 0
        ? 'rtw.findings.surfaceCitiesPass'
        : 'rtw.findings.surfaceCitiesFail',
      { cities: repeatedSurfaceCities.join(', ') },
    ));
  }

  if (ruleSet.carrierCombination) {
    const { triggerCarrier, minCarriersWithTrigger, minCarriersWithoutTrigger } = ruleSet.carrierCombination;
    const required = flownCarriers.has(triggerCarrier)
      ? minCarriersWithTrigger
      : minCarriersWithoutTrigger;
    findings.push(localizedFinding(
      {
        ruleId: 'carrier-combination',
        severity: flownCarriers.size >= required ? 'pass' : 'fail',
        message:
          flownCarriers.size >= required
            ? `Route uses ${flownCarriers.size} eligible carrier(s), satisfying this multi-carrier rule.`
            : `Route uses ${flownCarriers.size} carrier(s); this product requires at least ${required}.`,
        ...(sourceUrl ? { sourceUrl } : {}),
      },
      flownCarriers.size >= required
        ? 'rtw.findings.carrierCombinationPass'
        : 'rtw.findings.carrierCombinationFail',
      { count: flownCarriers.size, required },
    ));
  }

  if (ruleSet.geography.requiresPacificCrossing || ruleSet.geography.requiresAtlanticCrossing) {
    const missing = [
      ruleSet.geography.requiresPacificCrossing && !crossedOceans.includes('pacific')
        ? 'Pacific'
        : null,
      ruleSet.geography.requiresAtlanticCrossing && !crossedOceans.includes('atlantic')
        ? 'Atlantic'
        : null,
    ].filter((value): value is string => value !== null);
    findings.push(localizedFinding(
      {
        ruleId: 'ocean-crossings',
        severity: missing.length === 0 ? 'pass' : 'fail',
        message:
          missing.length === 0
            ? `Route crosses required ocean(s): ${crossedOceans.join(', ')}.`
            : `Route is missing required ocean crossing(s): ${missing.join(', ')}.`,
        ...(sourceUrl ? { sourceUrl } : {}),
      },
      missing.length === 0 ? 'rtw.findings.oceanCrossingsPass' : 'rtw.findings.oceanCrossingsFail',
      { oceans: crossedOceans.join(', '), missing: missing.join(', ') },
    ));
  }

  if (ruleSet.geography.rejectsAtlanticAndPacificCrossing) {
    const crossesBoth = crossedOceans.includes('pacific') && crossedOceans.includes('atlantic');
    findings.push(localizedFinding(
      {
        ruleId: 'prohibited-ocean-combination',
        severity: crossesBoth ? 'fail' : 'pass',
        message: crossesBoth
          ? 'This product does not allow itineraries crossing both the Pacific and Atlantic.'
          : 'Route does not cross both the Pacific and Atlantic.',
        ...(sourceUrl ? { sourceUrl } : {}),
      },
      crossesBoth
        ? 'rtw.findings.prohibitedOceanCombinationFail'
        : 'rtw.findings.prohibitedOceanCombinationPass',
    ));
  }

  if (ruleSet.geography.directionPolicy !== 'flexible') {
    const key = direction === 'mixed'
      ? 'rtw.findings.directionMixed'
      : direction === 'unknown'
        ? 'rtw.findings.directionUnknown'
        : 'rtw.findings.directionPass';
    findings.push(localizedFinding(
      {
        ruleId: 'direction',
        severity: direction === 'mixed' ? 'fail' : direction === 'unknown' ? 'unknown' : 'pass',
        message:
          direction === 'mixed'
            ? 'Route mixes eastbound and westbound movement; this product requires one continuous global direction.'
            : direction === 'unknown'
              ? 'Route direction could not be determined.'
              : `Route is ${direction}.`,
        ...(sourceUrl ? { sourceUrl } : {}),
      },
      key,
      { direction },
    ));
  }

  const start = startAirport(legs, inputs);
  const end = endAirport(legs, inputs);
  if (!start || !end) {
    findings.push({
      ruleId: 'start-end',
      severity: 'unknown',
      message: 'Start/end airport could not be validated because the route is empty or contains unknown airports.',
      messageKey: 'rtw.findings.startEndUnknown',
      ...(sourceUrl ? { sourceUrl } : {}),
    });
  } else if (ruleSet.geography.startEnd === 'same-city') {
    const ok = sameCity(start, end);
    findings.push(localizedFinding(
      {
        ruleId: 'start-end',
        severity: ok ? 'pass' : 'fail',
        message: ok
          ? 'Route starts and ends in the same city/airport.'
          : `Route starts at ${start.iata} and ends at ${end.iata}; this product requires the same city.`,
        ...(sourceUrl ? { sourceUrl } : {}),
      },
      ok ? 'rtw.findings.startEndSameCityPass' : 'rtw.findings.startEndSameCityFail',
      { start: start.iata, end: end.iata },
    ));
  } else if (ruleSet.geography.startEnd === 'same-country') {
    const ok = sameCountry(start, end);
    findings.push(localizedFinding(
      {
        ruleId: 'start-end',
        severity: ok ? 'pass' : 'fail',
        message: ok
          ? 'Route starts and ends in the same country.'
          : `Route starts in ${start.country} and ends in ${end.country}; this product requires the same country.`,
        ...(sourceUrl ? { sourceUrl } : {}),
      },
      ok ? 'rtw.findings.startEndSameCountryPass' : 'rtw.findings.startEndSameCountryFail',
      { start: start.country, end: end.country },
    ));
  }

  const valid = findings.every((f) => f.severity !== 'fail');

  return {
    productId: ruleSet.id,
    valid,
    summary: {
      flightSegments: segmentCount,
      surfaceSectors: surfaceCount,
      knownStopovers: stopoverCount,
      knownTransfers: transferCount,
      unknownStopovers: unknownStops,
      totalDistanceMiles: miles,
      ineligibleLegIndexes,
      continentsVisited: visitedContinents,
      oceansCrossed: crossedOceans,
      direction,
      repeatedStopoverCities,
      repeatedSurfaceCities,
      repeatedTransferCities,
      tripDays: days,
    },
    findings,
  };
}
