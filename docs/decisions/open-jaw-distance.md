# Decision Record — Open-jaw distance in priced RTW totals

Status: Accepted
Date: 2026-05-24 (Phase 5)
Decided by: captain
Supersedes: header caveat 4 in `tests/calibration/flyertalk-routings.test.ts`
("OPEN (engine limitation): open jaws are not legs, so totalDistanceMiles()
cannot see them").

## Context

Two distinct "open jaw" realities surfaced during calibration:

1. **Jaws traveled by surface** — Qantas Classic Flight Reward Case 1
   (PointHacks thread 24765): CDG⇢MXP by rail and HND⇢NRT by shuttle are
   real surface sectors of the ticket. gcmp models these as `surface: true`
   legs, so the existing per-product `surfaceDistancePolicy` already covers
   them (`counts-toward-distance` for QF). No new mechanism needed.
2. **True open jaws** — CX oneworld Multi-carrier Case (FlyerTalk 2184572):
   a two-group routing JFK-LHR-HKG-TPE-KUL-BKK // SIN-HKG-JFK has a gap
   BKK⇢SIN that is *not* flown as part of the award and *not* a surface
   sector; it is simply absent from the itinerary. Community-correct agent
   practice still includes the jaw's great-circle distance when zoning the
   ticket: 19,442 flying miles were zoned into the 20,001–25,000 band
   because the BKK⇢SIN jaw pushed the total over 20,001. gcmp's engine
   cannot see such gaps today (`totalDistanceMiles()` sums legs only).

## Rulings

- **D1 — Where open jaws exist.** A true open jaw is representable only as
  the gap between consecutive groups of a multi-group routing (last airport
  of group k → first airport of group k+1). Intra-group legs are contiguous;
  gaps inside a group do not exist. Callers derive jaw pairs from group
  boundaries; the engine never infers them.
- **D2 — Explicit caller-supplied seam.** `validateRtwRoute` gains an
  optional `inputs.openJawSectors: ReadonlyArray<{from, to}>` (IATA pairs,
  unknown airports skipped). The engine stays pure and does not parse group
  structure itself.
- **D3 — Per-product policy, conservative default.** New ruleSet field
  `openJawDistancePolicy: 'counts-toward-distance' | 'excluded-from-distance'`,
  default `'excluded-from-distance'` (= current behavior). Only the CX
  oneworld Multi-carrier product opts into `counts-toward-distance`, per FT
  2184572 (chart-verified agent practice). Other products stay excluded
  until evidence appears.
- **D4 — Jaws affect distance ONLY.** Jaws carry no carrier, cabin, or date:
  they never count as flight segments, stopovers, transfers, surface
  sectors, or ocean crossings, and direction checks must not see them. The
  only consumer is the priced/validated distance aggregation, and only when
  the product's policy includes them.
- **D5 — The 230k data point stays unresolved.** FT 2184572 reports a third
  DP: ~230,000 miles for a ~19,442 mi itinerary with the cabin unstated.
  That matches no recovered era's cell for any zone this routing could hit.
  We document it, encode nothing, and let late-rv archaeology (§A5) try to
  explain it.

## Measured addendum (Phase 5 implementation QA)

Reconstructing the thread's routing with our own haversine falsified part
of the Context narrative above — recorded here rather than silently
rewriting it:

- The seven flown sectors sum to 19,426.98 nm ⇒ **22,356 statute miles**;
  the OP's "19,442 miles" is effectively the **nautical** flown total
  (Δ≈0.08%), not a statute figure. Jaw BKK⇢SIN measures 765.07 nm ⇒ 880 sm
  (totals 22,356 / 23,236).
- Under statute-canonical measurement the real chain sits inside row 11
  (20,001–25,000) with or without the jaw; the thread's "jaw pushed it over
  20,001" crossing only appears when nautical sums are compared against
  the statute band table. The calibration pin therefore asserts the exact
  jaw delta and demonstrates the zone cliff via direct chart edges, not
  via this chain.
- D1–D5 are unaffected: the mechanism (caller-supplied jaws, per-product
  opt-in, distance-only) is exactly as ruled.

## Consequences

- `src/lib/schemas/rtw-rule.ts`: `RtwOpenJawDistancePolicySchema` + field on
  `RtwRuleSetSchema` (default excluded).
- `public/data/rtw-products/current.json`: CX entry gains
  `"openJawDistancePolicy": "counts-toward-distance"`.
- `src/lib/rtw/validate.ts`: aggregation adds rounded jaw GC distance
  (statute miles, same `MILES_PER_NAUTICAL_MILE` conversion) iff policy
  counts them; all other checks remain blind to jaws.
- `RtwValidationPanel` derives jaw pairs from `routing.groups` boundaries
  (captain-owned wiring) and passes `inputs.openJawSectors`.
- Calibration: `calib.cx-multicarrier.open-jaw-distance-counts` activates —
  exact delta assertion (with-jaw total = without-jaw total + jaw GC) plus
  fixture-level band-crossing edges. Header caveat 4 rewrites to RESOLVED.
- Unit tests pin: default excludes, opt-in includes, jaws invisible to
  segments/oceans/direction.
