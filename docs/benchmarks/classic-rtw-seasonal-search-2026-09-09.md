# Classic RTW seasonal schedule search — 2026-09-09

This package takes the fixed-date EVA / Star Alliance RTW benchmark one step
further: instead of replaying only the eight flights selected for
2026-11-02..2026-11-18, GCMP can now search a bounded Winter 2026/27 schedule
template for the earliest complete itinerary after a requested start date.

The route remains EVA Infinity MileageLands' published Star Alliance World
Travel Award example:

`TPE → NRT → LAX → EWR → LHR → FRA → SIN → BKK → TPE`

## What the solver proves

`src/lib/rtw/seasonal-itinerary.ts` is deliberately narrower than an award
search engine. A successful result means:

1. every segment has a source-backed operating flight pattern on the selected
   date;
2. every intermediate stop keeps at least one **full calendar day** before the
   next flight (arrival Monday → earliest next departure Wednesday);
3. if more than one flight pattern can operate a segment, the earliest local
   departure is selected deterministically;
4. the full generated routing still passes the selected EVA RTW rule set; and
5. every generated carrier + directional airport pair exists as confirmed
   operating evidence in GCMP's current route network.

It does **not** prove award inventory, married-segment availability, minimum
connection time, tax/surcharge amounts or that an airline agent will issue the
award exactly as generated.

## Source-backed seasonal template

The runtime template is:

`public/data/rtw-seasonal/eva-star-w26.json`

Its search window is intentionally bounded to `2026-11-01` through
`2027-03-27`. Patterns are not extrapolated beyond their reviewed evidence.

Key schedule controls include:

- BR198 TPE-NRT: daily winter pattern, cross-checked with EVA and Flight.info.
- NH6 NRT-LAX: ANA Winter 2026/27 daily operation plus Flight.info timing.
- LAX-EWR: the fixed benchmark keeps UA2743 only on the reviewed 2026-11-06
  occurrence; broader winter searches use UA2303 rather than extending that
  one UA2743 observation unnecessarily.
- UA14 EWR-LHR: daily except Saturday in the reviewed winter window.
- LHR-FRA: LH901 is preferred while its reviewed early-winter pattern applies;
  LH915 is the daily fallback later in winter.
- LH780 FRA-SIN: daily winter pattern.
- TG404 SIN-BKK: daily inside the bounded RTW template window.
- BR202 BKK-TPE: Monday / Wednesday / Thursday / Saturday winter pattern.

The template schema fails loud on duplicate IDs, unknown sources/patterns,
non-contiguous segment chains, mismatched pattern routes, invalid dates and
patterns that escape the template's declared search window.

## Deterministic examples

### Requested start: 2026-11-02

`BR198 11/02 → NH6 11/04 → UA2743 11/06 → UA14 11/08 → LH901 11/11 → LH780 11/13 → TG404 11/16 → BR202 11/18`

This differs slightly from the earlier hand-picked dated benchmark after
UA14: the seasonal solver enforces a full calendar day at every stop, so a
11/09 London arrival makes 11/11 the earliest LHR departure.

### Requested start: 2026-12-05

`BR198 12/05 → NH6 12/07 → UA2303 12/09 → UA14 12/13 → LH901 12/16 → LH780 12/18 → TG404 12/21 → BR202 12/23`

This proves the solver is not merely shifting the original flight numbers. It
switches LAX-EWR from the one reviewed UA2743 occurrence to UA2303 and skips
the Saturday on which UA14 is not in the reviewed operating pattern.

### Requested start: 2027-02-20

`BR198 02/20 → NH6 02/22 → UA2303 02/24 → UA14 02/28 → LH915 03/03 → LH780 03/05 → TG404 03/08 → BR202 03/10`

Later in winter the solver automatically moves LHR-FRA to LH915 rather than
claiming LH901 outside the early-winter pattern used by this template.

### Requested start: 2027-03-20

The solver returns `no-flight` rather than inventing a route. With a full day
reserved after BR198, the second segment would need to depart on or after
2027-03-22, while this template's reviewed NH6 window ends earlier.

## Product UI

`SeasonalItineraryFinder` is a progressive-disclosure component. It lazy-loads
the 7–8 KB seasonal JSON only when opened, accepts a preferred start date,
shows the resulting eight flights and their source links, and requires an
explicit **Apply and replace current itinerary** action.

The active development worktree wires that action to the current planner so
the generated operating carrier, flight number, departure date and stopover
flags replace the active itinerary and update trip start/end dates. Cabin is
not inferred from schedule evidence.

Because `src/App.tsx` already contains unrelated shared uncommitted work, that
small integration hunk is intentionally kept out of the isolated core commit;
the component, solver, schema, data and regressions remain independently
testable from a clean index.
