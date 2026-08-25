# Decision: CI zone-pair award price display (Phase 12)

Status: accepted · Owner: captain · Date: 2026-08-25
Supersedes the Phase-9 deferral ("zone-pair products have NO price-display
path"); implements `docs/taiwan-first-scope.md`'s award-zone pricing goal for
the `china-airlines-skyteam-partner-award` catalog entry.

## Problem

`getZonePairQuote(catalog, productId, fromZone, toZone, cabin)` works, but the
panel cannot call it: an itinerary names AIRPORTS, the chart indexes REGIONS
(`NEA, SEA, SWA, ME, EU, NAf, SAf, NAm, CAm, SAm, SWP`). No airport→zone
mapping exists anywhere in `public/data/**`.

## Rulings

- **Z1 — Hybrid display.** When BOTH endpoints of a flight leg resolve through
  the curated map (`public/data/geo/ci-zones.json`, `airport → zoneId`), the
  panel renders that leg's zone quote. Legs that do not resolve render a
  「區域未知」 marker instead — never a guess. If NO leg resolves, the panel
  offers the full 66-cell chart table for self-service instead of hiding the
  product's pricing.
- **Z2 — Source ladder for the map.** Official CI station-lists on the
  partner-award pages (Wayback or live) grade `chart-verified`; geographic
  inference from the CI network grades `community-corrected` and must be noted
  per-row. The researcher's §A8/§A11 evidence is the audit trail.
- **Z3 — Per-leg resolution, directed lookup.** Zone comes from each leg's own
  `from`/`to`; cell lookup stays undirected upper-triangle (existing
  semantics). Surface legs never get quotes.
- **Z4 — Cabin.** Quote at the routing's global cabin (same as
  `estimateAwardPrice`; PE maps through the existing bridge).
- **Z5 — Whole-ticket arithmetic stays OPEN.** Whether CI sums sector prices,
  takes the highest single-sector price, or applies co-terminal merging
  (CONFLICT #4 family) is UNVERIFIED. v1 therefore renders per-leg quotes plus
  a clearly-labeled 「各段合計」 line whose caption states it is a lower-bound
  aid, not CI's ticketed arithmetic. No whole-ticket claim ships until a
  source pins the rule.

## Consequences

- New data file + zod schema (`ci-zones.json`,
  `src/lib/schemas/ci-zones.ts`) with a completeness guard test against the
  CI product's `zones[]`.
- Panel wiring is captain-owned; lib resolver + tests are engineer-owned;
  the station→zone research appendix is researcher-owned (append-only §A12).
- Coverage honesty moves into README Current Limits (which airports resolve).
