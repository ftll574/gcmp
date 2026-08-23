/**
 * IRON RULE — calibration tests pinned to real FlyerTalk/community RTW threads.
 *
 * Spec: docs/calibration-set.md (transcribed threads, verbatim verdicts,
 * verification limits). Failing ANY active test below blocks /ship
 * (Success Criterion #2, design doc; Phase-1 debt payoff).
 *
 * Activation policy (per the retired .template and team guidance):
 *   - Assertions pin STRUCTURAL rules the engine verifies (alliance
 *     eligibility, segment/surface counting, caps, archived-product mode,
 *     carrier combination) rather than exact money/mile prices, because the
 *     researcher's quotes are search-index excerpts (PARTIAL where truncated)
 *     and several prices live on historical charts.
 *   - Where an assertion would depend on a PARTIAL quote, a historical
 *     chart, or engine capability that does not exist yet, the case is a
 *     `test.todo` with the gap documented — never guessed, never silently
 *     weakened.
 *
 * Known engine caveats surfaced honestly (see todos):
 *   1. RESOLVED (Phase 2): per-product surfaceDistancePolicy parameterizes
 *      totalDistanceMiles() — QF OWCFR counts surface sectors toward the
 *      priced distance (Case 1 verdict); ANA RTW excludes them
 *      (「陸地交通區間不列入計算」, product data 'excluded-from-distance').
 *   2. RESOLVED (Phase 2): priceRtwItinerary() implements "highest cabin
 *      wins" over per-leg cabins (Leg.cabin) with the routing cabin as
 *      floor; the CX any-F-sector case stays a todo only because the
 *      pricing datum lives on a historical chart (rv=2017.Q3), not data.
 *   3. RESOLVED (Phase 2): distanceNm() returns NAUTICAL miles; product
 *      distance caps and pricing bands are STATUTE miles. The rtw layer
 *      now converts once at aggregation (MILES_PER_NAUTICAL_MILE), so
 *      summary.totalDistanceMiles and every cap/band comparison are
 *      statute miles; absolute boundary assertions may be pinned.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { distanceNm } from '../../src/lib/calc/haversine.ts';
import { estimateAwardPrice } from '../../src/lib/rtw/award-pricing.ts';
import { validateRtwRoute, MILES_PER_NAUTICAL_MILE } from '../../src/lib/rtw/validate.ts';
import { AllianceCatalogSchema } from '../../src/lib/schemas/alliance.ts';
import { AwardPricingCatalogSchema } from '../../src/lib/schemas/award-pricing.ts';
import { RtwRuleCatalogSchema } from '../../src/lib/schemas/rtw-rule.ts';
import type { Airport, Leg } from '../../src/lib/types.ts';

const allianceCatalog = AllianceCatalogSchema.parse(
  JSON.parse(readFileSync('public/data/alliances/current.json', 'utf8')),
);

const products = RtwRuleCatalogSchema.parse(
  JSON.parse(readFileSync('public/data/rtw-products/current.json', 'utf8')),
);

const pricing = AwardPricingCatalogSchema.parse(
  JSON.parse(readFileSync('public/data/award-pricing/current.json', 'utf8')),
);

const AIRPORTS_RAW = JSON.parse(
  readFileSync('public/data/airports.json', 'utf8'),
) as Airport[];

const airports = new Map<string, Airport>(AIRPORTS_RAW.map((a) => [a.iata, a]));

function product(id: string) {
  const found = products.products.find((p) => p.id === id);
  if (!found) throw new Error(`Missing RTW product ${id}`);
  return found;
}

function airport(code: string): Airport {
  const found = airports.get(code);
  if (!found) throw new Error(`Missing airport ${code} in public/data/airports.json`);
  return found;
}

function validate(id: string, legs: ReadonlyArray<Leg>) {
  return validateRtwRoute(product(id), legs, { airports, allianceCatalog });
}

function validateWithDates(
  id: string,
  legs: ReadonlyArray<Leg>,
  startDate: string,
  endDate: string,
) {
  return validateRtwRoute(product(id), legs, { airports, allianceCatalog }, { startDate, endDate });
}

/**
 * Case 1 booked-style chain (Point Hacks thread, chart-verified):
 *   ADL-PER (economy), PER-KUL, KUL-CDG, MXP-HEL, HEL-HND, NRT-HKG,
 *   HKG-KUL, KUL-PER, PER-MEL — two open jaws (CDG⇢MXP, HND⇢NRT).
 * Carriers were not stated in the excerpt; every carrier below is an
 * oneworld member (eligibility-only modeling — route networks are not
 * part of the engine).
 */
const CASE1_FLOWN: Leg[] = [
  { from: 'ADL', to: 'PER', operatingCarrier: 'QF', stopover: false },
  { from: 'PER', to: 'KUL', operatingCarrier: 'MH', stopover: false },
  { from: 'KUL', to: 'CDG', operatingCarrier: 'MH', stopover: false },
  { from: 'CDG', to: 'MXP', operatingCarrier: 'ZZ', surface: true, stopover: false },
  { from: 'MXP', to: 'HEL', operatingCarrier: 'AY', stopover: false },
  { from: 'HEL', to: 'HND', operatingCarrier: 'AY', stopover: false },
  { from: 'HND', to: 'NRT', operatingCarrier: 'ZZ', surface: true, stopover: false },
  { from: 'NRT', to: 'HKG', operatingCarrier: 'JL', stopover: false },
  { from: 'HKG', to: 'KUL', operatingCarrier: 'MH', stopover: false },
  { from: 'KUL', to: 'PER', operatingCarrier: 'MH', stopover: false },
  { from: 'PER', to: 'MEL', operatingCarrier: 'QF', stopover: false },
];

describe('FlyerTalk calibration set — Iron Rule (docs/calibration-set.md)', () => {
  test('calib.qf-owcfr.surface-distance-counts — open-jaw GC distance counts toward the 35k cap', () => {
    // Case 1 (chart-verified): "If your itinerary goes XXX-LHR then CDG-YYY,
    // then you have to include the distance between LHR-CDG into the total
    // distance calculated."
    const full = validate('qantas-oneworld-classic-flight-reward', CASE1_FLOWN);
    const flownOnly = validate(
      'qantas-oneworld-classic-flight-reward',
      CASE1_FLOWN.filter((leg) => leg.surface !== true),
    );

    expect(full.summary.flightSegments).toBe(9);
    expect(full.summary.surfaceSectors).toBe(2);

    // Surface great-circle distance IS included in the priced total.
    // The engine aggregates nautical GC miles into statute miles
    // (MILES_PER_NAUTICAL_MILE); compare the delta of two rounded totals
    // against the converted raw delta with ±2 rounding slack.
    const surfaceSm =
      (distanceNm(airport('CDG'), airport('MXP')) + distanceNm(airport('HND'), airport('NRT'))) *
      MILES_PER_NAUTICAL_MILE;
    const delta = full.summary.totalDistanceMiles - flownOnly.summary.totalDistanceMiles;
    expect(delta).toBeGreaterThan(0);
    expect(Math.abs(delta - surfaceSm)).toBeLessThanOrEqual(2);

    // Everything else stays clean: all-oneworld carriers, well under cap.
    expect(full.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'airline-eligibility', severity: 'pass' }),
        expect.objectContaining({ ruleId: 'max-distance', severity: 'pass' }),
      ]),
    );
    expect(full.valid).toBe(true);
  });

  test('calib.qf-owcfr.emirates-ineligible — non-oneworld carrier fails eligibility', () => {
    // Case 1 (chart-verified): "please leave Emirates out of the itinerary
    // as Emirates is not part of the OneWorld alliance."
    const legs: Leg[] = [
      { from: 'TPE', to: 'HKG', operatingCarrier: 'CX', stopover: false },
      { from: 'HKG', to: 'DXB', operatingCarrier: 'EK', stopover: false },
      { from: 'DXB', to: 'CDG', operatingCarrier: 'EK', stopover: false },
    ];

    const result = validate('qantas-oneworld-classic-flight-reward', legs);

    expect(result.valid).toBe(false);
    expect(result.summary.ineligibleLegIndexes).toEqual([1, 2]);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'airline-eligibility', severity: 'fail' }),
      ]),
    );
  });

  test('calib.qf-owcfr.segment-cap-16-not-9 — 16 segments never trip a segment fail', () => {
    // Case 2 (OP chart-verified / comments snippet-verified): phone agents
    // claimed a 9-segment limit; OP + community side with the published
    // 16-segment RTW classification. Conflict resolution in the doc: pin
    // 16-with-warning. The current product JSON encodes NO maxFlights, so
    // the engine must not fail ANY segment count for this product today —
    // in particular not at 16.
    //
    // Route network is not modeled; the intra-Asia oneworld loop keeps the
    // distance far below the 35k cap so max-distance cannot mask the
    // segment behavior.
    const hop: Leg[] = [
      { from: 'TPE', to: 'HKG', operatingCarrier: 'CX', stopover: false },
      { from: 'HKG', to: 'KUL', operatingCarrier: 'MH', stopover: false },
      { from: 'KUL', to: 'SIN', operatingCarrier: 'MH', stopover: false },
      { from: 'SIN', to: 'HKG', operatingCarrier: 'CX', stopover: false },
      { from: 'HKG', to: 'TPE', operatingCarrier: 'CX', stopover: false },
    ];
    const legs: Leg[] = [
      ...hop,
      ...hop,
      ...hop,
      { from: 'TPE', to: 'HKG', operatingCarrier: 'CX', stopover: false },
    ];

    expect(legs).toHaveLength(16);
    const result = validate('qantas-oneworld-classic-flight-reward', legs);

    expect(result.summary.flightSegments).toBe(16);
    const segmentFinding = result.findings.find((f) => f.ruleId === 'flight-segments');
    expect(segmentFinding?.severity).not.toBe('fail');
    expect(result.valid).toBe(true);
  });

  test('calib.qf-owcfr.segment-cap-16-enforced — a 17th segment trips the published 16-segment cap', () => {
    // Case 2d resolution now encoded in product data: limits.maxFlights = 16
    // (OP chart-verified published classification; the agents' "9 segments"
    // claim was rejected). 16 passes (see segment-cap-16-not-9), 17 fails.
    const hop: Leg[] = [
      { from: 'TPE', to: 'HKG', operatingCarrier: 'CX', stopover: false },
      { from: 'HKG', to: 'KUL', operatingCarrier: 'MH', stopover: false },
      { from: 'KUL', to: 'SIN', operatingCarrier: 'MH', stopover: false },
      { from: 'SIN', to: 'HKG', operatingCarrier: 'CX', stopover: false },
      { from: 'HKG', to: 'TPE', operatingCarrier: 'CX', stopover: false },
    ];
    const legs: Leg[] = [...hop, ...hop, ...hop, ...hop.slice(0, 2)];

    expect(legs).toHaveLength(17);
    const result = validate('qantas-oneworld-classic-flight-reward', legs);

    expect(result.summary.flightSegments).toBe(17);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'flight-segments', severity: 'fail' }),
      ]),
    );
    expect(result.valid).toBe(false);
  });

  test('calib.qf-owcfr.two-non-qantas-carrier-minimum — QF plus only one other carrier fails the combination rule', () => {
    // Case 1c verdict (verbatim): "Reads to me like you only need a minimum
    // of 2 non-Qantas oneworld members." Encoded as carrierCombination:
    // trigger carrier QF requires 3 carriers total (QF + 2 non-QF); routes
    // without QF still need 2 distinct oneworld carriers.
    const qfPlusOne: Leg[] = [
      { from: 'ADL', to: 'MEL', operatingCarrier: 'QF', stopover: false },
      { from: 'MEL', to: 'SYD', operatingCarrier: 'QF', stopover: true },
      { from: 'SYD', to: 'PER', operatingCarrier: 'CX', stopover: false },
    ];

    const failing = validate('qantas-oneworld-classic-flight-reward', qfPlusOne);
    expect(failing.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'carrier-combination', severity: 'fail' }),
      ]),
    );
    expect(failing.valid).toBe(false);

    // Adding a second non-Qantas oneworld carrier satisfies the rule.
    const passing = validate('qantas-oneworld-classic-flight-reward', [
      ...qfPlusOne,
      { from: 'PER', to: 'ADL', operatingCarrier: 'MH', stopover: false },
    ]);
    expect(passing.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'carrier-combination', severity: 'pass' }),
      ]),
    );
    expect(passing.valid).toBe(true);
  });

  test('calib.cx-multicarrier.three-carrier-with-trigger-passes — CX + QR + BA satisfies the trigger rule', () => {
    // Case 3 context: Taiwan users build Asia Miles oneworld multi-carrier
    // awards via the HKG hub (the PTT share routed QR/CX through
    // DOH/HKG; availability is a separate concern — see todo below).
    // Product data: triggerCarrier CX ⇒ minimum 3 carriers when CX is flown.
    const legs: Leg[] = [
      { from: 'TPE', to: 'HKG', operatingCarrier: 'CX', stopover: true },
      { from: 'HKG', to: 'DOH', operatingCarrier: 'QR', stopover: false },
      { from: 'DOH', to: 'BCN', operatingCarrier: 'QR', stopover: true },
      { from: 'BCN', to: 'LHR', operatingCarrier: 'BA', stopover: false },
    ];

    const result = validate('cx-asia-miles-oneworld-multi-carrier-award', legs);

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'carrier-combination', severity: 'pass' }),
      ]),
    );
    expect(result.valid).toBe(true);

    // Pricing integration: the validator's own distance total must land
    // inside the band estimateAwardPrice selects (structural coherence —
    // exact prices stay unpinned: catalog confidence is reference-recheck
    // and the validator counts nautical miles against statute-mile bands).
    const estimate = estimateAwardPrice(
      pricing,
      'cx-asia-miles-oneworld-multi-carrier-award',
      result.summary.totalDistanceMiles,
      'business',
    );
    expect(estimate).not.toBeNull();
    expect(estimate?.cabin).toBe('business');
    expect(estimate?.confidence).toBe('reference-recheck');
    const total = result.summary.totalDistanceMiles;
    expect(estimate?.band.minMiles ?? Number.NaN).toBeLessThanOrEqual(total);
    expect(estimate?.band.maxMiles ?? Number.NaN).toBeGreaterThanOrEqual(total);
  });

  test('calib.cx-multicarrier.pe-not-priced — premium economy returns no estimate', () => {
    // Catalog note + Cathay 2026 terms: "Premium Economy is not offered for
    // oneworld Multi-carrier Awards." Guard against accidental PE pricing.
    const estimate = estimateAwardPrice(
      pricing,
      'cx-asia-miles-oneworld-multi-carrier-award',
      20000,
      'premium-economy',
    );
    expect(estimate).toBeNull();
  });

  // TODO(calib.cx-multicarrier.any-first-prices-as-first): Case 3's
  // load-bearing verdict — any First sector prices the WHOLE ticket at the
  // First level (PTT M.1500623520.A.36A, PARTIAL:
  // 「只要其中一段是頭等艙的兌換[…截斷]」; pivot plan: "Mixed-cabin itinerary
  // prices at the highest class booked"). MECHANISM LANDED (Phase 2):
  // priceRtwItinerary() + Leg.cabin express highest-cabin-wins (unit-tested
  // in tests/lib/rtw/award-pricing.test.ts). STILL BLOCKED ON DATA: the
  // 115,000-mile J reference is the 2017 chart only (pin under rv=2017.Q3,
  // never as current). Availability corollary (QR effectively releases no
  // F space, 「果然死不放票」) additionally needs an availability layer that
  // reports `unknown` instead of pretending.

  test('calib.ana-rtw-archived.discontinued-mode-validates-with-warning — archived product warns, does not silently pass', () => {
    // Case 4: ANA stopped issuing Star Alliance RTW awards 2025-06-23
    // (bookingStatusNote on the product). Community DPs predate that; the
    // engine must validate the structure AND surface the product-status
    // warning instead of staying silent. Westbound TPE-origin loop matching
    // the DP shapes (both oceans once, no backtracking, TW start/end).
    const legs: Leg[] = [
      { from: 'TPE', to: 'SIN', operatingCarrier: 'SQ', stopover: true },
      { from: 'SIN', to: 'LHR', operatingCarrier: 'SQ', stopover: true },
      { from: 'LHR', to: 'JFK', operatingCarrier: 'UA', stopover: false },
      { from: 'JFK', to: 'TPE', operatingCarrier: 'BR', stopover: false },
    ];

    const result = validateWithDates(
      'ana-star-alliance-rtw-award',
      legs,
      '2026-09-01',
      '2026-09-12',
    );

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'product-status', severity: 'warning' }),
      ]),
    );
    expect(result.valid).toBe(true);
    expect(result.summary.direction).toBe('westbound');
    expect(result.summary.oceansCrossed).toEqual(['atlantic', 'pacific']);
    expect(result.summary.tripDays).toBe(12);
  });

  test('calib.ana-rtw-archived.band-20001-22000-is-125k — archived chart prices the mid-band chain at 125k business', () => {
    // Case 4 verdict: 20,001–22,000 mi band ⇒ 125,000 miles/person (two
    // independent PTT DPs; 21,949 routed-mi DP). The catalog pins ONLY that
    // band and ONLY business — economy/first stay unpriced rather than
    // guessed from a partial archived chart. Chain ≈20.9k STATUTE miles
    // westbound (post-unit-fix totals), mid-band with margin on both sides.
    const legs: Leg[] = [
      { from: 'TPE', to: 'CGK', operatingCarrier: 'SQ', stopover: true },
      { from: 'CGK', to: 'BKK', operatingCarrier: 'TG', stopover: true },
      { from: 'BKK', to: 'LHR', operatingCarrier: 'SQ', stopover: false },
      { from: 'LHR', to: 'JFK', operatingCarrier: 'UA', stopover: false },
      { from: 'JFK', to: 'TPE', operatingCarrier: 'BR', stopover: false },
    ];

    const result = validateWithDates(
      'ana-star-alliance-rtw-award',
      legs,
      '2026-09-01',
      '2026-09-12',
    );

    // Structural coherence: the validator's statute-mile total must land
    // inside the archived band estimateAwardPrice selects.
    expect(result.summary.direction).toBe('westbound');
    expect(result.valid).toBe(true);
    const total = result.summary.totalDistanceMiles;
    expect(total).toBeGreaterThan(20001);
    expect(total).toBeLessThanOrEqual(22000);

    const estimate = estimateAwardPrice(pricing, 'ana-star-alliance-rtw-award', total, 'business');
    expect(estimate?.miles).toBe(125000);
    expect(estimate?.cabin).toBe('business');
    expect(estimate?.confidence).toBe('reference-recheck');
    expect(estimate?.band).toEqual({ minMiles: 20001, maxMiles: 22000 });

    // Partial-chart honesty: cabins the archived data does not pin return
    // null instead of a guessed price.
    expect(estimateAwardPrice(pricing, 'ana-star-alliance-rtw-award', total, 'economy')).toBeNull();
    expect(estimateAwardPrice(pricing, 'ana-star-alliance-rtw-award', total, 'first')).toBeNull();
  });

  test('calib.ana-rtw-archived.surface-excluded-from-distance — ground sectors add zero priced miles', () => {
    // Case 4 verdict: 「陸地交通區間不列入計算」 — ground transport sectors
    // are EXCLUDED from the priced distance. Encoded in product data as
    // surfaceDistancePolicy 'excluded-from-distance'; contrast with QF
    // Case 1 where surface sectors COUNT toward the priced total.
    const flown: Leg[] = [
      { from: 'TPE', to: 'SIN', operatingCarrier: 'SQ', stopover: true },
      { from: 'KUL', to: 'LHR', operatingCarrier: 'SQ', stopover: false },
      { from: 'LHR', to: 'JFK', operatingCarrier: 'UA', stopover: false },
      { from: 'JFK', to: 'TPE', operatingCarrier: 'BR', stopover: false },
    ];
    const withGroundSector: Leg[] = [
      { from: 'TPE', to: 'SIN', operatingCarrier: 'SQ', stopover: true },
      { from: 'SIN', to: 'KUL', operatingCarrier: 'ZZ', surface: true, stopover: false },
      ...flown.slice(1),
    ];

    const flownResult = validateWithDates(
      'ana-star-alliance-rtw-award',
      flown,
      '2026-09-01',
      '2026-09-12',
    );
    const groundResult = validateWithDates(
      'ana-star-alliance-rtw-award',
      withGroundSector,
      '2026-09-01',
      '2026-09-12',
    );

    // The surface sector adds ZERO priced miles — totals match exactly.
    expect(flownResult.valid).toBe(true);
    expect(groundResult.summary.totalDistanceMiles).toBe(flownResult.summary.totalDistanceMiles);
    // The ground sector itself stays within limits and validates clean.
    expect(groundResult.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'surface-sectors', severity: 'pass' }),
      ]),
    );
    expect(groundResult.valid).toBe(true);
  });

  test('calib.sta-eligibility.br67-two-sectors — multi-hop flight numbers model as two sectors', () => {
    // Case 5: BR67 operates TPE–BKK–LHR sold as ONE flight number; engines
    // must model it as TWO sectors for segment caps. gcmp represents it as
    // two explicit legs; embed the pair in a compliant EVA World Travel
    // Award loop so every other rule stays green.
    const legs: Leg[] = [
      { from: 'TPE', to: 'BKK', operatingCarrier: 'BR', stopover: false },
      { from: 'BKK', to: 'LHR', operatingCarrier: 'BR', stopover: true },
      { from: 'LHR', to: 'JFK', operatingCarrier: 'UA', stopover: true },
      { from: 'JFK', to: 'TPE', operatingCarrier: 'BR', stopover: false },
    ];

    const result = validateWithDates(
      'br-infinity-star-alliance-world-travel-award',
      legs,
      '2026-09-01',
      '2026-09-11',
    );

    expect(result.summary.flightSegments).toBe(4); // BR67 pair contributes 2, not 1
    expect(result.summary.ineligibleLegIndexes).toEqual([]); // BR + UA ∈ Star Alliance
    expect(result.valid).toBe(true);
  });

  // TODO(calib.sta-eligibility.br-gum-network-gap-warns): Case 5 root cause
  // — BR ceased Guam service, so TPE→Japan→GUM Star Alliance constructions
  // became impossible to issue. The engine has NO route-network/
  // operations-data layer: a TPE-NRT-GUM BR routing passes eligibility
  // today even though the community verdict says it must produce a
  // fail/warning finding, not silence. Needs versioned route data before
  // this can assert anything.
});
