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
 *   1. validate.ts totalDistanceMiles() sums ALL legs INCLUDING surface
 *      sectors — correct for QF OWCFR (Case 1 verdict), wrong for ANA RTW
 *      (「陸地交通區間不列入計算」). Needs per-product parameterization.
 *   2. estimateAwardPrice() takes ONE whole-itinerary cabin — mixed-cabin
 *      "highest cabin wins" (CX any-F-sectors-as-F) cannot be expressed.
 *   3. distanceNm() returns NAUTICAL miles; product distance caps and
 *      pricing bands are STATUTE miles. Structural (relative/delta)
 *      assertions are unit-safe; absolute boundary assertions are not
 *      pinned until the unit question is settled.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { distanceNm } from '../../src/lib/calc/haversine.ts';
import { estimateAwardPrice } from '../../src/lib/rtw/award-pricing.ts';
import { validateRtwRoute } from '../../src/lib/rtw/validate.ts';
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
    // Both totals are rounded sums, so compare against the raw GC delta
    // with ±1 rounding slack instead of an exact-equality trap.
    const surfaceNm =
      distanceNm(airport('CDG'), airport('MXP')) + distanceNm(airport('HND'), airport('NRT'));
    const delta = full.summary.totalDistanceMiles - flownOnly.summary.totalDistanceMiles;
    expect(delta).toBeGreaterThan(0);
    expect(Math.abs(delta - surfaceNm)).toBeLessThanOrEqual(1);

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

  // TODO(calib.qf-owcfr.segment-cap-16-enforced): once
  // qantas-oneworld-classic-flight-reward.limits gains maxFlights: 16
  // (doc §Case 2d + Conflicts #1), pin the positive side: a 17th segment
  // produces a flight-segments FAIL while 16 passes.

  // TODO(calib.qf-owcfr.two-non-qantas-carrier-minimum): community verdict
  // (Case 1c, verbatim): "Reads to me like you only need a minimum of 2
  // non-Qantas oneworld members." The product JSON has no carrierCombination
  // entry, so the engine cannot check this yet. Blocked on a data decision
  // (triggerCarrier QF + minimum carriers), then assert a single-carrier-QF+
  // -one-other routing fails.

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
  // prices at the highest class booked"). BLOCKED: estimateAwardPrice()
  // accepts one whole-itinerary cabin; Leg carries no cabin, and the
  // pricer has no highest-cabin-wins aggregation. Also blocked on data:
  // the 115,000-mile J reference is the 2017 chart only (pin under rv=2017.Q3,
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

  // TODO(calib.ana-rtw-archived.band-20001-22000-is-125k): Case 4 verdict —
  // 20,001–22,000 mi band ⇒ 125,000 miles/person (two independent PTT DPs;
  // 21,949 mi routed DP). BLOCKED on data + units: there is no
  // ana-star-alliance-rtw-award entry in public/data/award-pricing/current.json,
  // the chart is historical (discontinued 2025-06-23), quotes are PARTIAL,
  // and the validator feeds NAUTICAL-mile sums into statute-mile bands —
  // resolve the unit mismatch before pinting band-boundary chains
  // (20,001 / 22,001 sides around a ~21.9k mi chain).

  // TODO(calib.ana-rtw-archived.surface-excluded-from-distance): Case 4
  // verdict — ground transport sectors are EXCLUDED from the priced
  // distance (「陸地交通區間不列入計算」). CONFIRMED ENGINE GAP:
  // totalDistanceMiles() in src/lib/rtw/validate.ts sums ALL legs including
  // surface:true sectors (correct for QF per Case 1, wrong for ANA). Needs
  // a per-product surface-distance policy ('counts-toward-distance' vs
  // 'excluded-from-distance'); do not hack the test around it. This pair of
  // cases (QF counts / ANA excluded) pins both branches once parameterized.

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
