# TDX bounded operating-carrier acceptance: first EVA flight set

Date: 2026-09-06. Workspace: `E:\workspace\gcmp`.

This round closes the first *bounded* operating-carrier gate. It does not
declare all BR/CX designators in TDX to be operators, and it does not query
award inventory.

## Evidence roles

The saved TDX snapshot remains the evidence for **date, weekday, local clock,
direction and publication validity**. Its 1,111 rows all have `CodeShare: []`,
so `AirlineID` alone is still not accepted as operating-carrier proof.

Independent EVA evidence supplies only **operator identity for exact
route+flight-number pairs**:

- EVA Timetables states that its timetable covers international flights
  operated by EVA Air (BR) and UNI Air (B7), up to 360 days.
- EVA Flight Status states that information for codeshare flights operated by
  other carriers is not available.
- EVA's own status pages explicitly list the exact BR flight numbers below on
  the stated directional airport pairs.

Official pages reviewed:

- `https://booking.evaair.com/flyeva/eva/b2c/flight-schedules.aspx?lang=zh-tw`
- `https://booking.evaair.com/flyeva/eva/b2c/flight-status.aspx?lang=en-US`
- `https://booking.evaair.com/flyeva/eva/b2c/flight-status-erc.aspx?ACTCODE=&Orderby=&REASON=&airport=TPE%2FTSA%2FKHH&cmstitle=erc-note1&date=20260710-20260713&lang=&reqtime=`
- `https://booking.evaair.com/flyeva/eva/b2c/flight-status-erc.aspx?ACTCODE=&Orderby=&REASON=&airport=HKG%2FMFM%2FCAN%2FSZX&cmstitle=erc-note1&date=20260725-20260727&lang=zh-tw&reqtime=`

Operator-evidence review time is `2026-09-05T17:43:00Z` and review deadline is
`2026-10-05T17:43:00Z`. The evidence is **not retroactive**: replay at the TDX
capture time `17:09Z` remains operator-unverified. A combined replay is allowed
only at/after the operator review time while the original TDX snapshot is still
inside its own freshness window.

## Exact identities accepted

Only these identities are promoted from TDX references to selectable
`PublishedFlight` records:

- TPE→HKG, BR: `809`, `851`, `857`, `867`, `869`, `871`, `891`
- HKG→TPE, BR: `810`, `852`, `858`, `868`, `870`, `872`, `892`
- TPE→SFO, BR: `8`, `18`

No prefix/range rule exists. In particular `BR2891/2895/2897/2899`, `BR28`,
AS/AV/CM/DL/JX/TG/UA designators and every CX designator remain unverified
unless separately evidenced. Cathay's own conditions explain that a CX-marketed
codeshare may be operated by another carrier, so a CX prefix is not operator
proof.

## Implementation

`server/operator-evidence.ts` is a small exact-match evidence catalog. The TDX
normalizer is now `4-bounded-operator-evidence`:

1. apply the existing route/date/weekday/freshness/cargo/codeshare-candidate
   checks;
2. look up the exact route+carrier+flight number in the independent evidence
   catalog at the evaluation time;
3. if current evidence exists, emit a `PublishedFlight` with a separate
   `operatorEvidence` source;
4. otherwise emit the existing non-selectable `TimetableReference`.

The calendar filters the promoted flight through the selected product's
eligible operating carriers. Unresolved designators remain visible in the
separate customer-service section and never populate itinerary `op`/`fn`.
Operator evidence expiry removes the positive; it never produces a no-flight
negative.

Diagnostic v4 distinguishes partial operator acceptance from the earlier
all-unverified state. This round does not require another authenticated TDX
capture; the existing snapshot is sufficient for regression.

## Real Edge acceptance

`npm.cmd run schedules:qa:replay` was upgraded to evaluate the saved snapshot at
`2026-09-05T17:44:00Z`, one minute after the operator review and still within
the original TDX freshness window. It does not load credentials or call TDX.

Nine route/viewport cases passed (1440/1024/390 px):

- TPE→HKG: 7 verified BR flights + 41 unresolved designators; BR851 selected.
- HKG→TPE: 7 verified BR flights + 41 unresolved designators; BR852 selected.
- TPE→SFO: 2 verified BR flights + 14 unresolved designators; BR8 selected.

Each case verifies the operator-source label, clicks the verified flight,
writes `fn=` into the share URL, performs a real new-document reload, and finds
the saved flight reference again. TPE→SFO also keeps 2026-10-25 unknown after
keyboard selection and re-query. The report records zero unexpected requests
and zero browser runtime errors. Clipboard remains a test spy and remote fonts
remain blocked, so this is not OS-clipboard/full-visual/accessibility acceptance.

Report: `test-results/tdx-browser-replay/report.json`.

## Validation and remaining gate

Final baseline for this round: **59 test files / 849 tests** including all 24
calibration cases. TypeScript, ESLint, production build and `git diff --check`
must remain green before handoff.

Remaining operator work is evidence-driven, not heuristic-driven: obtain
sufficient official evidence for CX and any additional BR/partner flight
identities worth promoting. Do not broaden this exact catalog by airline prefix,
matching clock time, route plausibility or alliance membership.

Cathay follow-up in the same round found official route-level evidence that
Cathay Pacific flies TPE→HKG directly, but not an exact future-flight-number
operator mapping for the TDX CX designators. Cathay's own carrier rules and
conditions explicitly distinguish CX marketing from operating carriers, so
route-level presence is insufficient. The CX set therefore remains unverified;
no code/data change was made to promote it.

No commit, push, deploy, paid fallback, booking or award-seat lookup is part of
this round.
