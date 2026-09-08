# Classic RTW itinerary benchmark — 2026-09-08

This benchmark asks a product-level question rather than only testing isolated
rule clauses: can GCMP represent and validate itineraries that airlines or
travelers have actually used as round-the-world / multi-carrier awards?

`tests/benchmarks/classic-rtw-itineraries.test.ts` pins four cases that are
independent of uncommitted schedule research. For this document, **supported**
means all of the following:

1. every airport/surface sector can be represented by the current itinerary
   model;
2. every flown pair exists in the current route graph (with evidence quality
   reported separately);
3. the selected RTW product validator returns no hard failure.

It does **not** mean award inventory is available on a requested date. Seat
availability remains a separate live-search problem.

The active development working tree also has newer share-URL persistence work
for RTW product / per-leg metadata. That layer was intentionally excluded from
this durable benchmark because it is still shared, uncommitted work; this test
must pass from a clean index without depending on it.

## 1. EVA Infinity MileageLands — official Star Alliance RTW example

Source:
https://www.evaair.com/en-sg/infinity-mileagelands/mileage-award-program/mileage-redemption/award-ticket/star-alliance/

Official example route:

`TPE → NRT → LAX → EWR → LHR → FRA → SIN → BKK → TPE`

GCMP benchmark result:

- PASS under `br-infinity-star-alliance-world-travel-award`.
- 8 flight sectors, 7 stopovers.
- 21,921 statute miles by GCMP's airport great-circle calculation.
- Atlantic and Pacific are both crossed.
- Direction resolves eastbound; the regional SIN → BKK movement does not
  incorrectly invalidate the itinerary.
- All 8 flown sectors have current confirmed-operating route evidence in the
  runtime graph.

This is the strongest current end-to-end control because the itinerary itself
comes from the airline publishing the award rules.

## 2. Qantas — actually ticketed oneworld Classic Flight Reward (2025)

Source:
https://www.australianfrequentflyer.com.au/community/threads/oneworld-classic-flight-reward-discussion-the-definitive-thread.8228/page-829

Ticketed routing reproduced in GCMP:

`SYD-QF11-LAX → LAX-AA6424-PDX → PDX-AA4891-LAX → LAX-AA27-HND`

`HND // KIX → KIX-JL727-BKK → BKK-AY142-HEL → HEL-AY1339-LHR → LHR-QF2-SIN → SIN-QF2-SYD`

The source reports 34,383 miles. GCMP calculates 34,228 miles, a 155-mile
(about 0.45%) difference, which is small enough for a great-circle / surface
calculation implementation comparison.

GCMP benchmark result:

- PASS under `qantas-oneworld-classic-flight-reward`.
- 9 flown sectors, 1 surface sector, 5 stopovers.
- The benchmark fixture retains the cited flight numbers and mixed cabins.
- No route pair is missing from the current network.
- Evidence caveat: AA on `LAX → PDX` and `PDX → LAX` is currently only
  `provider-listed` in GCMP rather than confirmed operating evidence. The
  itinerary is structurally representable, but those two operator claims
  should not be promoted without stronger source evidence.

## 3. Cathay Asia Miles — issued 2017 oneworld Multi-carrier Award

Source:
https://www.ptt.cc/bbs/points/M.1500623520.A.36A.html

Issued routing:

`TSA-JL-HND → HND-JL-LHR → LHR-BA-CDG → CDG // ZRH → ZRH-CX-HKG → HKG-CX-TPE`

The traveler reports a successfully issued mixed Business/First award for
155,000 miles plus HKD 2,182 tax.

GCMP benchmark result:

- PASS under `cx-asia-miles-oneworld-multi-carrier-award`.
- 5 flown sectors and 1 surface sector.
- All 5 flown sectors have current confirmed-operating route evidence.
- The benchmark retains the Business/First mix and the surface sector.

Historical Cathay tickets remain rule-version sensitive. This benchmark pins
the itinerary mechanics and current structural compatibility; it must not be
used to imply that every 2017 pricing/routing clause is identical to today's
Cathay rules.

## 4. ANA Mileage Club — actually ticketed historical Star Alliance RTW

Sources:

- https://www.reddit.com/r/awardtravel/comments/1idfm3a
- follow-up trip report: https://www.reddit.com/r/awardtravel/comments/1qv00ec

Ticketed routing reproduced in GCMP:

`IAD-UA-BRU → BRU // IST → IST-TK-HKG → HKG-BR-TPE → TPE-BR-KIX → KIX // HND → HND-NH-LAX`

The booking report states roughly 15,922 flown miles and 105,000 ANA miles per
person. GCMP calculates 15,892 miles, 30 miles (about 0.19%) lower.

GCMP benchmark result:

- PASS in archived validation mode under `ana-star-alliance-rtw-award`.
- 5 flown sectors and 2 surface sectors.
- Atlantic and Pacific are both crossed; direction resolves eastbound.
- All flown sectors have current confirmed-operating route evidence.
- GCMP correctly emits the product-status warning that ANA stopped issuing new
  Star Alliance RTW awards on 2025-06-23 instead of presenting the itinerary as
  currently ticketable.

## Overall verdict

The four durable benchmark itineraries are representable and structurally
accepted by GCMP. EVA is a clean current official control; Qantas exposes a
route-evidence-quality gap rather than a rule-engine failure; Cathay validates
the mixed-cabin/surface mechanics while remaining historically version-sensitive;
and ANA validates correctly only as a discontinued historical product.

The next useful benchmark layer is **dated flight realizability**: for each
classic itinerary, pick a future date range and require every flown sector to
resolve to an operating flight number on that date before calling it a fully
actionable booking plan.
