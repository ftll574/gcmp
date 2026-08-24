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
 *   2. RESOLVED (Phase 2; activated t4, completed by research round 2):
 *      priceRtwItinerary() implements "highest cabin wins" over per-leg
 *      cabins (Leg.cabin) with the routing cabin as floor. The CX
 *      any-F-sector case is ACTIVE against BOTH the live catalog and the
 *      COMPLETE official rv=2018.Q2 chart (Wayback 20180528013013,
 *      docs/calibration-set.md §A3(a)) via a test-local fixture — never
 *      merged into the live catalog, whose bands are a different era.
 *      Still open honestly: late-rv chart pins (§A3(c)) and award
 *      availability (QR releases no F space, 「果然死不放票」).
 *   3. RESOLVED (Phase 2): distanceNm() returns NAUTICAL miles; product
 *      distance caps and pricing bands are STATUTE miles. The rtw layer
 *      now converts once at aggregation (MILES_PER_NAUTICAL_MILE), so
 *      summary.totalDistanceMiles and every cap/band comparison are
 *      statute miles; absolute boundary assertions may be pinned.
 *   4. RESOLVED (Phase 5): was OPEN (engine limitation) — "open jaws are
 *      not legs, so totalDistanceMiles() cannot see them". True open jaws
 *      between consecutive groups are now caller-supplied via
 *      inputs.openJawSectors, and a per-product openJawDistancePolicy
 *      gates whether their great-circle distance enters the priced total
 *      (the CX multi-carrier product opts in per FT 2184572 agent
 *      practice). Jaws stay invisible to every structural check (D4) —
 *      docs/decisions/open-jaw-distance.md (rulings D1–D5).
 */

import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { distanceNm } from '../../src/lib/calc/haversine.ts';
import { estimateAwardPrice, getZonePairQuote, priceRtwItinerary } from '../../src/lib/rtw/award-pricing.ts';
import { validateRtwRoute, MILES_PER_NAUTICAL_MILE } from '../../src/lib/rtw/validate.ts';
import { AllianceCatalogSchema } from '../../src/lib/schemas/alliance.ts';
import { AwardPricingCatalogSchema } from '../../src/lib/schemas/award-pricing.ts';
import { RtwRuleCatalogSchema } from '../../src/lib/schemas/rtw-rule.ts';
import { NetworkGapCatalogSchema } from '../../src/lib/schemas/network-gaps.ts';
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

const networkGaps = NetworkGapCatalogSchema.parse(
  JSON.parse(readFileSync('public/data/network-gaps/current.json', 'utf8')),
);

/** Product id for the official rv=2018.Q2 chart fixture below. */
const CX_RV18_ID = 'cx-asia-miles-oneworld-multi-carrier-award-rv-2018-q2';

/**
 * OFFICIAL Asia Miles oneworld Multi-carrier chart, pinned to rv=2018.Q2 —
 * complete Y/J/F table transcribed from Wayback capture 20180528013013
 * (2018-05-28 01:30:13 UTC) of asiamiles.com flight-award-chart.html,
 * server-rendered HTML so every cell is chart-verified
 * (docs/calibration-set.md §A3(a)). Cross-validated against §A1 DPs:
 * koki0331's zone-08 pair AND his 14,329-mile F-jump land exactly
 * (rows 08/09); Masumi's issued ticket hits row 08 First.
 *
 * NEVER promote into public/data/award-pricing/current.json: different
 * rules era — the live catalog's reference-recheck bands differ materially
 * (10,001–14,000 First is 220k there vs 155k on this chart). Also do NOT
 * reuse for late-rv pricing: the FT Jan-2025 DP matches no cell here
 * (§A3(c) drift confirmation).
 */
const PRICING_RV_2018Q2 = AwardPricingCatalogSchema.parse({
  version: '2018.2',
  lastVerified: '2018-05-28',
  products: [
    {
      productId: CX_RV18_ID,
      label: 'Asia Miles oneworld Multi-carrier Award (rv=2018.Q2 official chart)',
      pricingModel: 'distance-band',
      confidence: 'published-chart',
      currency: 'miles',
      sourceUrls: [
        'https://web.archive.org/web/20180528013013id_/https://www.asiamiles.com/en/redeem-awards/flight-awards/flight-award-chart.html',
        'https://www.ptt.cc/bbs/points/M.1500623520.A.36A.html',
      ],
      notes: [
        'Official published chart, Wayback capture 20180528013013 (rv=2018.Q2); zone numbers 01-13 as printed on the chart.',
        'Band envelope semantics: band covers minMiles <= d <= maxMiles.',
        'A3(b) unresolved conflict: Masumi 「J140k↔F190k」 couplet deliberately NOT encoded — the chart splits it (row 09 J135k/F190k vs row 10 J140k/F205k); chart rows preferred.',
        'Chart revised after 2018-05 (FT Jan-2025 DP matches no cell, A3(c)) — never merge into the live award-pricing catalog.',
      ],
      bands: [
        { minMiles: 0, maxMiles: 1000, prices: { economy: 30000, business: 55000, first: 70000 } },
        { minMiles: 1001, maxMiles: 1500, prices: { economy: 30000, business: 60000, first: 80000 } },
        { minMiles: 1501, maxMiles: 2000, prices: { economy: 35000, business: 65000, first: 90000 } },
        { minMiles: 2001, maxMiles: 4000, prices: { economy: 35000, business: 70000, first: 95000 } },
        { minMiles: 4001, maxMiles: 7500, prices: { economy: 60000, business: 80000, first: 105000 } },
        { minMiles: 7501, maxMiles: 9000, prices: { economy: 60000, business: 85000, first: 115000 } },
        { minMiles: 9001, maxMiles: 10000, prices: { economy: 65000, business: 95000, first: 130000 } },
        { minMiles: 10001, maxMiles: 14000, prices: { economy: 85000, business: 115000, first: 155000 } },
        { minMiles: 14001, maxMiles: 18000, prices: { economy: 90000, business: 135000, first: 190000 } },
        { minMiles: 18001, maxMiles: 20000, prices: { economy: 95000, business: 140000, first: 205000 } },
        { minMiles: 20001, maxMiles: 25000, prices: { economy: 110000, business: 160000, first: 235000 } },
        { minMiles: 25001, maxMiles: 35000, prices: { economy: 130000, business: 190000, first: 275000 } },
        { minMiles: 35001, maxMiles: 50000, prices: { economy: 150000, business: 220000, first: 335000 } },
      ],
    },
  ],
});

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

  // ACTIVATED (was TODO calib.cx-multicarrier.any-first-prices-as-first):
  // Case 3's load-bearing verdict — any First sector prices the WHOLE
  // ticket at the First level. Mechanism landed in Phase 2
  // (priceRtwItinerary highest-cabin-wins, unit-tested in
  // tests/lib/rtw/award-pricing.test.ts) and is pinned BOTH against the
  // live catalog (next test) and the COMPLETE official rv=2018.Q2 chart
  // fixture above (research round 2 recovered every cell — Wayback
  // capture 20180528013013, docs/calibration-set.md §A3(a)). Still
  // honestly open: late-rv chart pins (§A3(c) candidate captures
  // 20210615190855 / 20240210095453 / 20240903150154) and an availability
  // layer (QR releases no F space, 「果然死不放票」).

  /**
   * Case 3 issued-ticket shape (PTT koki0331 M.1500623520.A.36A,
   * chart-verified): TSA-HND JL C / HND-LHR JL F / LHR-CDG BA C /
   * ZRH-HKG CX F / HKG-TPE CX C ≈ 13.7k statute mi — under the 14,000-mile
   * boundary. Carriers {JL, BA, CX} = 3 satisfies the CX-trigger minimum.
   * Stopover flags stay unmarked: eligibility-only modeling (the engine
   * has no stopover-duration data), and unmarked legs land in the unknown
   * bucket which warns but never fails.
   */
  const CASE3_FLOWN: Leg[] = [
    { from: 'TSA', to: 'HND', operatingCarrier: 'JL', cabin: 'business' },
    { from: 'HND', to: 'LHR', operatingCarrier: 'JL', cabin: 'first' },
    { from: 'LHR', to: 'CDG', operatingCarrier: 'BA', cabin: 'business' },
    { from: 'ZRH', to: 'HKG', operatingCarrier: 'CX', cabin: 'first' },
    { from: 'HKG', to: 'TPE', operatingCarrier: 'CX', cabin: 'business' },
  ];

  test('calib.cx-multicarrier.any-first-prices-as-first — any First sector prices the whole ticket at First', () => {
    const result = validate('cx-asia-miles-oneworld-multi-carrier-award', CASE3_FLOWN);
    expect(result.valid).toBe(true);

    // The validator's own distance total must sit inside the ≤14,000 band
    // (structural coherence between engine distance and pricing zone).
    const total = result.summary.totalDistanceMiles;
    expect(total).toBeGreaterThan(12000);
    expect(total).toBeLessThanOrEqual(14000);

    // Two First sectors → the ENTIRE itinerary prices at F 155,000…
    const priced = priceRtwItinerary(
      PRICING_RV_2018Q2,
      CX_RV18_ID,
      total,
      CASE3_FLOWN,
      'business',
    );
    expect(priced?.cabin).toBe('first');
    expect(priced?.miles).toBe(155000); // koki0331's issued figure = official row 08 First
    expect(priced?.confidence).toBe('published-chart'); // official archived chart, not community reconstruction

    // …while the same sectors all-business land at the J 115,000 reference.
    const control = priceRtwItinerary(
      PRICING_RV_2018Q2,
      CX_RV18_ID,
      total,
      CASE3_FLOWN.map((leg) => ({ ...leg, cabin: 'business' as const })),
      'business',
    );
    expect(control?.cabin).toBe('business');
    expect(control?.miles).toBe(115000);
  });

  test('calib.cx-multicarrier.any-first-mechanism-live-catalog — mixed cabin reprices through the shipped bands too', () => {
    // Ruling A1: pin the MECHANISM (any-F-sector ⇒ whole ticket at First)
    // against the EXISTING award-pricing/current.json bands, independent
    // of the reconstructed rv=2017.Q3 fixture below. The live catalog's
    // own values are asserted here; the fixture only adds the historical
    // boundary pair.
    const result = validate('cx-asia-miles-oneworld-multi-carrier-award', CASE3_FLOWN);
    expect(result.valid).toBe(true);
    const total = result.summary.totalDistanceMiles;
    expect(total).toBeGreaterThan(10000);
    expect(total).toBeLessThanOrEqual(14000);

    const priced = priceRtwItinerary(
      pricing,
      'cx-asia-miles-oneworld-multi-carrier-award',
      total,
      CASE3_FLOWN,
      'business',
    );
    expect(priced?.cabin).toBe('first');
    expect(priced?.miles).toBe(250000); // live 10,001–14,000 F band (fourth era, §A9)
    expect(priced?.confidence).toBe('reference-recheck');

    const allBusiness = priceRtwItinerary(
      pricing,
      'cx-asia-miles-oneworld-multi-carrier-award',
      total,
      CASE3_FLOWN.map((leg) => ({ ...leg, cabin: 'business' as const })),
      'business',
    );
    expect(allBusiness?.cabin).toBe('business');
    expect(allBusiness?.miles).toBe(170000); // live 10,001–14,000 J band (fourth era, §A9)
  });

  test('calib.cx-multicarrier.band-boundary-jump — crossing the 14,000-mile boundary reprices 155k→190k', () => {
    // koki0331's follow-up: adding ~1,300 miles pushed the zone total past
    // 14,000 and 「所需里程會瞬間從155000跳到190000」 — a one-band cliff,
    // not a per-sector accumulation. Modeled by inserting CDG-VIE-ZRH
    // short-hauls into the same ticket shape.
    const legs: Leg[] = [
      ...CASE3_FLOWN.slice(0, 3),
      { from: 'CDG', to: 'VIE', operatingCarrier: 'BA', cabin: 'business' },
      { from: 'VIE', to: 'ZRH', operatingCarrier: 'BA', cabin: 'business' },
      ...CASE3_FLOWN.slice(3),
    ];

    const result = validate('cx-asia-miles-oneworld-multi-carrier-award', legs);
    expect(result.valid).toBe(true);
    const total = result.summary.totalDistanceMiles;
    expect(total).toBeGreaterThan(14000);

    const priced = priceRtwItinerary(
      PRICING_RV_2018Q2,
      CX_RV18_ID,
      total,
      legs,
      'business',
    );
    expect(priced?.cabin).toBe('first');
    expect(priced?.miles).toBe(190000);
    expect(priced?.band.minMiles).toBe(14001);

    // Direct edge zoning against the official rows (ruling amendment #2):
    // 14,000 sits in row 08 (F155k), 14,001 flips to row 09 (F190k) — the
    // same cliff koki0331 documented at 14,329 miles.
    const row08Edge = estimateAwardPrice(PRICING_RV_2018Q2, CX_RV18_ID, 14000, 'first');
    const row09Edge = estimateAwardPrice(PRICING_RV_2018Q2, CX_RV18_ID, 14001, 'first');
    expect(row08Edge?.band.maxMiles).toBe(14000);
    expect(row08Edge?.miles).toBe(155000);
    expect(row09Edge?.band.minMiles).toBe(14001);
    expect(row09Edge?.miles).toBe(190000);

    // Second official boundary pair (rows 09↔10): 18,000 still zones row 09
    // (J135k/F190k), 18,001 flips to row 10 (J140k/F205k). Direct edge
    // estimates ONLY — a synthetic chain near this boundary would sit in the
    // GC-sum straddle Masumi's own merged chain hit (~17.5–17.9k, §A3(b)),
    // so the route-level jump stays pinned at the clean 14,000 cliff above.
    const row09TopJ = estimateAwardPrice(PRICING_RV_2018Q2, CX_RV18_ID, 18000, 'business');
    const row09TopF = estimateAwardPrice(PRICING_RV_2018Q2, CX_RV18_ID, 18000, 'first');
    const row10BaseJ = estimateAwardPrice(PRICING_RV_2018Q2, CX_RV18_ID, 18001, 'business');
    const row10BaseF = estimateAwardPrice(PRICING_RV_2018Q2, CX_RV18_ID, 18001, 'first');
    expect(row09TopJ?.band.maxMiles).toBe(18000);
    expect(row09TopJ?.miles).toBe(135000);
    expect(row09TopF?.miles).toBe(190000);
    expect(row10BaseJ?.band.minMiles).toBe(18001);
    expect(row10BaseJ?.miles).toBe(140000);
    expect(row10BaseF?.miles).toBe(205000);
  });

  test('calib.cx-multicarrier.rv2018q2-official-rows — economy prices from the chart; PE stays null', () => {
    // The research recovery is COMPLETE (every Y/J/F cell of the official
    // rv=2018.Q2 chart chart-verified, docs §A3(a)), so economy now prices
    // positively off row 08 instead of being an honesty-null. Premium
    // Economy remains correctly null — the product never offered it
    // (official T&C clause; mirrors pe-not-priced on the live catalog).
    const economy = estimateAwardPrice(PRICING_RV_2018Q2, CX_RV18_ID, 13000, 'economy');
    expect(economy?.cabin).toBe('economy');
    expect(economy?.miles).toBe(85000); // row 08 Economy

    const premiumEconomy = estimateAwardPrice(
      PRICING_RV_2018Q2,
      CX_RV18_ID,
      13000,
      'premium-economy',
    );
    expect(premiumEconomy).toBeNull(); // PE not offered on this product at all
  });

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

  // ACTIVATED (was TODO calib.sta-eligibility.br-gum-network-gap-warns):
  // Case 5 root cause — BR ceased Guam service (effective 2017-06), so
  // TPE→Japan→GUM Star Alliance constructions became unissuable.
  // Implemented as a versioned NETWORK-GAP WATCHLIST
  // (public/data/network-gaps/current.json): evidence-linked,
  // warn-not-fail, windowed by since/until. A full route-network layer
  // stays out of scope (docs/calibration-set.md addendum A2 Option 2).
  test('calib.sta-eligibility.br-gum-network-gap-warns — BR TPE-GUM sector warns with evidence instead of silence', () => {
    // Structurally perfect EVA Infinity loop (TW start/end, all-westbound
    // incl. the antimeridian wrap on JFK-GUM, both oceans once, 11 trip
    // days) — yet the closing GUM-TPE sector has not flown on BR since
    // 2017-06. The engine must WARN with a citation, not stay silent and
    // not fail outright (other constructions of the pair remain valid).
    const legs: Leg[] = [
      { from: 'TPE', to: 'BKK', operatingCarrier: 'BR', stopover: false },
      { from: 'BKK', to: 'LHR', operatingCarrier: 'BR', stopover: true },
      { from: 'LHR', to: 'JFK', operatingCarrier: 'UA', stopover: true },
      { from: 'JFK', to: 'GUM', operatingCarrier: 'UA', stopover: false },
      { from: 'GUM', to: 'TPE', operatingCarrier: 'BR', stopover: false },
    ];

    const result = validateRtwRoute(
      product('br-infinity-star-alliance-world-travel-award'),
      legs,
      { airports, allianceCatalog, networkGaps: networkGaps.gaps },
      { startDate: '2026-09-01', endDate: '2026-09-11' },
    );

    expect(result.valid).toBe(true); // warning severity — never blocks validity

    const gapFindings = result.findings.filter((f) => f.ruleId === 'network-gap');
    expect(gapFindings.length).toBe(1); // UA's JFK-GUM leg does NOT match UA's closed TPE-GUM gap
    const [gapFinding] = gapFindings;
    expect(gapFinding?.severity).toBe('warning');
    expect(gapFinding?.messageKey).toBe('rtw.findings.networkGapOpen');
    expect(gapFinding?.affectedLegIndexes).toEqual([4]);
    expect(gapFinding?.sourceUrl?.length).toBeGreaterThan(0); // FT1838853 / postguam / aeroroutes
    expect(gapFinding?.messageParams?.carrier).toBe('BR');
  });

  // ACTIVATED (was suggested-but-unactivated calib.cx-multicarrier.open-jaw-distance-counts,
  // docs/calibration-set.md §A1(d) / "Suggested test ids"; decision record
  // docs/decisions/open-jaw-distance.md): the BKK⇢SIN group-boundary gap of
  // FT 2184572 counts toward the CX zone total under the product's
  // counts-toward-distance opt-in, and stays invisible everywhere else (D4).
  test('calib.cx-multicarrier.open-jaw-distance-counts — BKK⇢SIN jaw GC distance counts toward the CX zone total', () => {
    // FT 2184572 (Jan 2025, OP GherkinFT; jagmeets endorses the agent's
    // zoning): two-group routing JFK-LHR-HKG-TPE-KUL-BKK // SIN-HKG-JFK —
    // the BKK⇢SIN gap is neither flown nor a surface sector, yet Asia
    // Miles zoned the ticket WITH the jaw's great-circle distance
    // ("It seemed it might have added the open jaw BKK//SIN as flight
    // distance"). D1/D2 keep that seam caller-supplied: groups are a UI
    // concept, so the engine sees one flat leg array plus openJawSectors.
    // Carrier attribution is eligibility-only per file convention (the OP
    // did not list flights); {BA, CX, JL} satisfies the CX-trigger
    // three-carrier minimum.
    const legs: Leg[] = [
      { from: 'JFK', to: 'LHR', operatingCarrier: 'BA' },
      { from: 'LHR', to: 'HKG', operatingCarrier: 'BA' },
      { from: 'HKG', to: 'TPE', operatingCarrier: 'CX' },
      { from: 'TPE', to: 'KUL', operatingCarrier: 'CX' },
      { from: 'KUL', to: 'BKK', operatingCarrier: 'CX' },
      { from: 'SIN', to: 'HKG', operatingCarrier: 'JL' },
      { from: 'HKG', to: 'JFK', operatingCarrier: 'CX' },
    ];
    const withoutJaw = validateRtwRoute(
      product('cx-asia-miles-oneworld-multi-carrier-award'),
      legs,
      { airports, allianceCatalog },
    );
    const withJaw = validateRtwRoute(
      product('cx-asia-miles-oneworld-multi-carrier-award'),
      legs,
      { airports, allianceCatalog, openJawSectors: [{ from: 'BKK', to: 'SIN' }] },
    );

    // EXACT delta: with-jaw total = without-jaw total + rounded jaw GC.
    const jawSm = Math.round(distanceNm(airport('BKK'), airport('SIN')) * MILES_PER_NAUTICAL_MILE);
    expect(withJaw.summary.totalDistanceMiles - withoutJaw.summary.totalDistanceMiles).toBe(jawSm);

    // MEASURED, not trusted (public/data/airports.json coords, project
    // haversine, ×MILES_PER_NAUTICAL_MILE): the seven flown sectors sum to
    // 19,426.98 nm ⇒ 22,356 statute mi — the OP's quoted "flying distance
    // of 19,442 miles" is effectively NAUTICAL (Δ≈0.08%). The engine
    // converts once at aggregation (caveat 3), so BOTH totals sit inside
    // rv=2018.Q2 row 11 (20,001–25,000): 22,356 without the jaw,
    // 22,356 + 880 = 23,236 with.
    expect(withoutJaw.summary.totalDistanceMiles).toBe(22356);
    expect(withJaw.summary.totalDistanceMiles).toBe(23236);

    // Honest band note: unlike the thread narrative (nautical 19,442 +
    // ~765 ≈ 20,207 crossing "20,000"), the real chain does NOT straddle a
    // band edge once everything is statute miles. The cliff a jaw CAN
    // trigger near an edge is therefore demonstrated DIRECTLY on the live
    // fourth-era rows 10↔11 (docs §A9; same pattern as
    // band-boundary-jump): 20,000 zones zone 10 (J230k/F330k); one mile
    // more flips to zone 11 (J250k/F350k).
    const rowTop = estimateAwardPrice(
      pricing,
      'cx-asia-miles-oneworld-multi-carrier-award',
      20000,
      'business',
    );
    const rowBase = estimateAwardPrice(
      pricing,
      'cx-asia-miles-oneworld-multi-carrier-award',
      20001,
      'business',
    );
    expect(rowTop?.band.maxMiles).toBe(20000);
    expect(rowTop?.miles).toBe(230000);
    expect(rowBase?.band.minMiles).toBe(20001);
    expect(rowBase?.miles).toBe(250000);

    // Structural coherence: both measured totals zone into row 11.
    expect(
      estimateAwardPrice(
        PRICING_RV_2018Q2,
        CX_RV18_ID,
        withoutJaw.summary.totalDistanceMiles,
        'business',
      )?.band,
    ).toEqual({ minMiles: 20001, maxMiles: 25000 });
    expect(
      estimateAwardPrice(PRICING_RV_2018Q2, CX_RV18_ID, withJaw.summary.totalDistanceMiles, 'business')
        ?.band,
    ).toEqual({ minMiles: 20001, maxMiles: 25000 });

    // Non-opted products ignore jaws entirely (D3 conservative default):
    // same legs + same openJawSectors under the BR product leave the total
    // unchanged.
    const brWithout = validateRtwRoute(
      product('br-infinity-star-alliance-world-travel-award'),
      legs,
      { airports, allianceCatalog },
    );
    const brWith = validateRtwRoute(
      product('br-infinity-star-alliance-world-travel-award'),
      legs,
      { airports, allianceCatalog, openJawSectors: [{ from: 'BKK', to: 'SIN' }] },
    );
    expect(brWith.summary.totalDistanceMiles).toBe(brWithout.summary.totalDistanceMiles);

    // The CX run stays structurally clean with the jaw counted (D4: only
    // the priced distance moved; carrier combination still passes on
    // {BA, CX, JL}).
    expect(withJaw.valid).toBe(true);
    expect(withJaw.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'carrier-combination', severity: 'pass' }),
        expect.objectContaining({ ruleId: 'max-distance', severity: 'pass' }),
      ]),
    );
  });

  test('calib.sta-eligibility.co-terminal-direct-vs-two-sectors — physical sectors pinned; zone-arithmetic divergence documented', () => {
    // CONFLICT GUARD (docs/calibration-set.md #4): BR61/BR67-style
    // co-terminal hops are sold as ONE flight number but operate TWO
    // sectors, and the community readings genuinely diverge by rule
    // context:
    //   • Segment caps / eligibility: TWO physical sectors — what the
    //     engine pins below (current behavior, no change this phase).
    //   • ANA zone arithmetic: ONE direct sector for distance/zoning
    //     (community consensus: howlic/jimsun/lightring). NOT implemented:
    //     collapsing flown-sum → direct in totalDistanceMiles()/zone logic
    //     needs its own decision record.
    const pair: Leg[] = [
      { from: 'TPE', to: 'BKK', operatingCarrier: 'BR', stopover: false },
      { from: 'BKK', to: 'LHR', operatingCarrier: 'BR', stopover: false },
    ];
    const result = validate('br-infinity-star-alliance-world-travel-award', pair);
    expect(result.summary.flightSegments).toBe(2); // physical reading: both operated sectors count
    expect(result.summary.surfaceSectors).toBe(0);

    // Quantify the divergence the ANA-style zone reading would collapse:
    // flying-short via the co-terminal point adds real miles vs the sold
    // direct sector. The guard asserts the gap exists so a future
    // zone-arithmetic mode cannot silently ship without revisiting this.
    const flownSumNm =
      distanceNm(airport('TPE'), airport('BKK')) + distanceNm(airport('BKK'), airport('LHR'));
    const directNm = distanceNm(airport('TPE'), airport('LHR'));
    expect(flownSumNm).toBeGreaterThan(directNm);
  });

  // ==========================================================================
  // A8 — CI SkyTeam partner-award zone chart (docs/calibration-set.md §A8).
  // Zone-pair pricing model landed with the Era-2 matrix (capture
  // 20251008063633, confidence published-chart). Engine-supportable calib.*
  // ids are ACTIVATED below; rules that live in publication text only (one-
  // way semantics per era, sector/stopover caps, MU/FM suspension) are
  // pinned as data-shape assertions on the entry's notes and the matching
  // rtw-products entry — never silently dropped.
  // ==========================================================================
  const CI_PRICING_ID = 'china-airlines-skyteam-partner-award';
  const ciPricing = pricing.products.find((p) => p.productId === CI_PRICING_ID);
  if (!ciPricing || !('zoneMatrix' in ciPricing)) {
    throw new Error('CI SkyTeam partner award must be a zone-pair product');
  }
  const ciNotes = ciPricing.notes ?? [];

  test('calib.ci-skyteampartner.zone-pair-era2-chart — §A8 sample cells price through getZonePairQuote', () => {
    // ACTIVATED (engine support: zone-pair quote path). Values verbatim from
    // the §A8(a) Era-2 matrix; any chart drift fails loudly here.
    expect(getZonePairQuote(pricing, CI_PRICING_ID, 'NEA', 'EU', 'business')?.miles).toBe(160000);
    expect(getZonePairQuote(pricing, CI_PRICING_ID, 'NEA', 'SWP', 'economy')?.miles).toBe(110000);
    expect(getZonePairQuote(pricing, CI_PRICING_ID, 'SWP', 'SWP', 'economy')?.miles).toBe(35000);
    expect(getZonePairQuote(pricing, CI_PRICING_ID, 'NEA', 'EU', 'premium-economy')?.miles).toBe(120000);
  });

  test('calib.ci-skyteampartner.era1-me-diagonal-blank — ME is the UNIQUE blank Era-1 diagonal; Era-2 ME diagonal prices', () => {
    // ACTIVATED (engine support + note pin). Guards against column-shift
    // misreads of the archived chart: Era-1 left ME-ME blank while every
    // other diagonal was priced; Era-2 prices it (E35/P40/B60 ×1,000).
    expect(getZonePairQuote(pricing, CI_PRICING_ID, 'ME', 'ME', 'economy')?.miles).toBe(35000);
    expect(getZonePairQuote(pricing, CI_PRICING_ID, 'ME', 'ME', 'premium-economy')?.miles).toBe(40000);
    expect(getZonePairQuote(pricing, CI_PRICING_ID, 'ME', 'ME', 'business')?.miles).toBe(60000);
    expect(
      ciNotes.some(
        (note) =>
          note.includes('Middle East diagonal uniquely blank') &&
          note.includes('one-way equal to round-trip') &&
          note.includes('First Class'),
      ),
    ).toBe(true);
    // Era-2 has no blank cells at all — every one of the 66 pairs prices all
    // three published cabins.
    for (const cell of ciPricing.zoneMatrix) {
      expect(Object.keys(cell.prices).sort()).toEqual(['business', 'economy', 'premiumEconomy']);
    }
  });

  test('calib.ci-skyteampartner.data-shape — full 66-cell upper triangle over the 11 published zones', () => {
    // Data-shape coverage for the transcription as a whole: the generator
    // cross-checked all 198 values docs↔archived-HTML (zero diffs); this
    // pins the shipped shape so future edits cannot thin it silently.
    expect(ciPricing.zones).toEqual([
      'NEA',
      'SEA',
      'SWA',
      'ME',
      'EU',
      'NAf',
      'SAf',
      'NAm',
      'CAm',
      'SAm',
      'SWP',
    ]);
    expect(ciPricing.zoneMatrix).toHaveLength(66);
    const pairs = new Set(ciPricing.zoneMatrix.map((c) => `${c.originRegion}-${c.destinationRegion}`));
    expect(pairs.size).toBe(66);
    for (let i = 0; i < ciPricing.zones.length; i++) {
      for (let j = i; j < ciPricing.zones.length; j++) {
        expect(pairs.has(`${ciPricing.zones[i]}-${ciPricing.zones[j]}`)).toBe(true);
      }
    }
    for (const cell of ciPricing.zoneMatrix) {
      for (const price of Object.values(cell.prices)) {
        expect(price).toBeGreaterThan(0);
        expect(Number.isInteger(price)).toBe(true);
        expect(price % 1000).toBe(0); // chart unit is "1000 miles"
      }
    }
  });

  test('calib.ci-skyteampartner.oneway-half-of-roundtrip-era2 + oneway-equals-roundtrip-era1 — one-way semantics pinned as era notes', () => {
    // Engine models ROUND-TRIP chart values only; the per-era one-way
    // semantics are publication text, so they ride in notes (data-shape).
    expect(
      ciNotes.some((n) => n.includes('one-way = half round-trip (Era-2 rule)')),
    ).toBe(true);
    expect(
      ciNotes.some((n) => n.includes('kept one-way equal to round-trip')),
    ).toBe(true);
  });

  test('calib.ci-skyteampartner.mufm-oneway-suspension-note-current — current-era MU/FM suspension recorded', () => {
    // Current-era rules text (RSC payload, numerals absent) suspends MU/FM
    // one-way reward tickets; recorded so the drift story stays complete.
    expect(ciNotes.some((n) => n.includes('MU/FM one-way reward tickets'))).toBe(true);
  });

  test('calib.ci-skyteampartner.rt-caps-and-ocean-rejects — rtw-products entry pins sector/stopover limits and the dual-ocean reject', () => {
    // Rules that the rtw-products entry already models structurally:
    // six sectors / one stopover (RT), and the shortest-direct-route
    // via-prohibitions behind rejectsAtlanticAndPacificCrossing.
    const entry = product(CI_PRICING_ID);
    expect(entry.limits).toEqual({ maxFlights: 6, maxStopovers: 1, maxSurfaceSectors: 1 });
    expect(entry.geography.rejectsAtlanticAndPacificCrossing).toBe(true);
    // Captain-approved sourceUrl refresh (Phase 9): the Era-2 Wayback
    // capture (2025-10-08) leads as pricing provenance, the Era-1 capture
    // (2019-08-22) corroborates, and the live canonical page closes the
    // list — replacing the dead redeem-airline-miles slug.
    expect(entry.sourceUrls[0]).toContain('web.archive.org/web/20251008063633');
    expect(
      entry.sourceUrls.some((url) =>
        url.includes('web.archive.org/web/20190822111127'),
      ),
    ).toBe(true);
    expect(
      entry.sourceUrls.some((url) =>
        url.includes('china-airlines.com/us/en/member/miles/redeem/reward-ticket'),
      ),
    ).toBe(true);
    expect(getZonePairQuote(pricing, CI_PRICING_ID, 'NEA', 'EU', 'first')).toBeNull();
  });
});
