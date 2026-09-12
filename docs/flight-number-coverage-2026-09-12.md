# Flight-number coverage audit — 2026-09-12

This is the evidence-backed flight-number audit for phase 2 task `t_c08244ba`.

## Repeatable audit

```bash
npm run coverage:flight-numbers -- 2026-09-12 --summary
```

Without `--summary`, the command emits the complete target ledger.

The audit deliberately does **not** use `runtime-current.json` as its
denominator. The CLI reconstructs the merged route graph before runtime's
no-number suppression, then keeps the explicit bounded target set:

- every active alliance route touching a Taiwan (`TW`) airport;
- every active alliance route touching that alliance's existing bounded hubs;
- explicitly pinned high-value review targets: BR TPE→NRT, CX TPE→HKG,
  CI TPE→LAX and the provider-listed LH FRA→KUL relationship.

This lets a target remain visible with `runtimePresent=false` when the planner
runtime suppresses it for lacking operating/number proof.

The bounded hubs remain the existing route-freshness benchmark:

- oneworld: HKG, LHR, JFK, LAX, NRT
- Star Alliance: NRT, LAX, SFO, EWR, FRA, IST, SIN
- SkyTeam: ICN, LAX, ATL, CDG, HAN

Global route coverage remains `unknown`. GCMP still does not have a complete,
operator-resolved global directional-route denominator for all 60 active
alliance members. The bounded target counts below must never be presented as
global completeness.

## Number-state semantics

Each target is classified independently from its route-existence window:

- `confirmed`: at least one exact **carrier + direction + pair + flight number**
  evidence record has its own effective window containing `asOf`;
- `candidate-only`: route-number observations/references exist, but no exact
  flight-number evidence window is valid on `asOf`;
- `unknown`: the target has no usable number evidence;
- `operating` / `provider-listed` remains a separate carrier-identity axis.

The route's `effectiveFrom` / `effectiveUntil` decides only whether the route
is an active audit target. It is never borrowed as a flight-number evidence
window. Exact number windows live in
`public/data/route-network/flight-number-audit-evidence.json`. Source metadata
(`id`, `url`, `checkedOn`) is resolved from the route-network source catalog.

Candidate rows retain their source metadata but do not gain an effective window
unless exact number evidence has been independently established.

## Review fix: before / after

The first implementation used 30,103 active runtime rows as its denominator
and treated any non-empty runtime `flightNumbers` array as confirmed. Those old
counts are not comparable to the corrected bounded denominator, so they are
retained only as historical review context, not as an improvement percentage.

Concrete behavior changes on 2026-09-12:

| Target | Before review fix | After review fix |
| --- | --- | --- |
| CI TPE→LAX | `confirmed` from ADSB observations ending 2026-09-06 | `candidate-only`; route window 2026-09-08..10-07 is not number evidence |
| CX TPE→HKG | `confirmed`, including CX2015 | `candidate-only`; CX2015 is outside the bounded exact-operator set |
| CX HKG→TPE | `confirmed`, including CX2026 | `candidate-only`; CX2026 is outside the bounded exact-operator set |
| bounded target absent from planner runtime | invisible | retained with `runtimePresent=false`; no number evidence => `unknown` |

Corrected bounded-target metrics:

| Slice | Targets | Confirmed | Candidate-only | Unknown |
| --- | ---: | ---: | ---: | ---: |
| All bounded targets | 5,537 | 2 | 5,501 | 34 |
| Taiwan origin/destination | 408 | 2 | 406 | 0 |
| High-value review targets | 4 | 0 | 3 | 1 |
| oneworld bounded hubs | 1,138 | 0 | 1,133 | 5 |
| Star bounded hubs | 2,483 | 0 | 2,463 | 20 |
| SkyTeam bounded hubs | 1,559 | 0 | 1,550 | 9 |

The 34 unknown rows are real target-ledger entries that were previously hidden
by runtime suppression. `unknown=34` replaces the structurally forced old
`missing=0` result.

## Exact confirmed evidence

Source: China Airlines official 2026 summer timetable/travel-fair page
`https://2026ste.china-airlines.com/`, checked 2026-09-12.

| Carrier | Direction | Confirmed number | Independent evidence window |
| --- | --- | --- | --- |
| CI | TPE → AMS | CI73 | 2026-09-01 through 2026-10-23 |
| CI | AMS → TPE | CI74 | 2026-09-02 through 2026-10-24 |

The operator-owned page identifies the exact carrier, direction, endpoints,
flight number and dated operating window. Those two windows are stored
separately from the route windows in `flight-number-audit-evidence.json`.
Date-specific extra flights CI2073/CI2074 are not promoted across the route
window and remain candidate evidence.

## Historical and bounded evidence handling

`flight-numbers-adsbiq-recent-20260908` explicitly describes observations from
2026-08-01 through 2026-09-06. Therefore those observations cannot confirm CI
TPE→LAX on 2026-09-12 even though the merged route row itself is active from
2026-09-08 through 2026-10-07.

The Cathay bounded review in
`docs/cx-cross-source-operator-evidence-2026-09-06.md` accepts exactly 26 Cathay
operating identities for TPE↔HKG in 2026-09-06..2026-09-14. CX2015 and CX2026
are not in that set. The audit therefore cannot promote them through a CX
prefix, route presence or historical ADSB observation. Until the cross-source
record is represented as structured exact flight-number evidence, the route's
raw designators remain candidates rather than audit-confirmed numbers.

## Remaining candidate / unknown ledger

On 2026-09-12 the bounded ledger contains 5,501 candidate-only and 34 unknown
targets. Taiwan contains 406 candidate-only and 0 unknown targets. The four
pinned high-value targets contain three candidates plus one explicit unknown:
`LH FRA→KUL`, which is provider-listed and absent from the plannable runtime.
That target status is a review obligation, not an assertion that Lufthansa
operates a nonstop FRA→KUL service.

Through-flight modeling remains governed by physical nonstop sectors. This
audit does not recreate the removed EVA TPE–Europe endpoint-skipping edges;
existing BR75/76 and BR67/68 regression coverage continues to require the BKK
intermediate stop.
