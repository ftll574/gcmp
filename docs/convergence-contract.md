# Convergence Contract

Date: 2026-08-26
Origin: three-round scope grill (user + agent), transcribed decisions below.
Status: **acceptance demonstrated 2026-08-26** — the §4 freeze is lifted and §7 retires with it; scope changes still go through an explicit recorded decision.

## 1. North Star (arbitrated)

**Bounded rigor.** Engine correctness serves the BR/CX end-to-end planning loop — it is not maximized for its own sake. "Correct enough" is defined by the calibration set (`docs/calibration-set.md`, pinned by `tests/calibration/flyertalk-routings.test.ts`): when the demanded real-world cases pass, rigor work stops.

This reverses the Phase 7–12 drift, where unbounded data rigor ("one more PDF") consumed phases that the primary products did not require.

## 2. Acceptance Line (definition of done)

> A TPE-origin user can plan one complete BR (Star Alliance World Travel Award) or CX (Asia Miles oneworld Multi-carrier Award) itinerary end to end: every leg carries an operating carrier, a departure date, and a price estimate — and every violation comes with an actionable fix hint.

Nothing else may start before this line passes a real walk-through.

> **Demonstrated 2026-08-26 (CX).** Six-leg TPE-origin oneworld itinerary `TPE-HKG-HEL-LHR-JFK-HND-TPE`, carriers `CX,AY,AY,BA,JL,JL` (four alliance members), dated legs 2026-11-02…11-12, 4 stopovers + 2 transfers, Atlantic + Pacific crossed. Engine: `valid=true`, all seven structural findings PASS. Panel: 「目前可行」 verdict, award estimate 230,000 mi business (zone 18,001–20,000), every leg carrying carrier/date/price context. Violation-side of the line was demonstrated the same day: a deliberately broken routing rendered the stopover fix hint (「↪ 修正：把 1 個停留改成轉機…」) live, and a corrupted share URL surfaced its typed parse error after the banner-clobber fix. Evidence: computer-use session transcript; share-URL clipboard round-trip preserved carriers/dates verbatim.

## 3. Sole Next Phase: Violation Fix Hints v1

The acceptance line requires a capability that does not exist anywhere in the codebase today.

Scope (bounded):

- Identify the offending leg(s) + violated rule + one textual remedy pattern (e.g. "convert leg 3 stopover to transfer", "drop leg N or reroute").
- Coverage limited to the top-5 high-frequency fail rules: segment count, stopover count, distance cap, carrier eligibility, ocean crossing. All other fail rules fall back to existing rule text/source link.
- No automatic alternative-route generation, no one-click apply. That is explicitly out of scope until v1 ships and survives contact with users.

> **Status:** v1 shipped 2026-08-26 (`src/lib/rtw/fix-hints.ts`, pinned by `tests/lib/rtw/fix-hints.test.ts`, rendered on the validation panel); §2 demonstrated the same day — see the record under §2.

## 4. Frozen Backlog (must NOT start before §2 passes)

Frozen, not cancelled — but the freeze is hard:

| Item | Rationale |
| --- | --- |
| CI airport→region wiring (itinerary-level SkyTeam zone quotes) | Serves CI, which this project's own scope doc classifies as *not* a true RTW candidate; not on the acceptance line. The 66-cell matrix + 65-station map stay as-is at their current half-wired state. |
| Schedule catalog expansion (CX rows, more routes/carriers) | Dates are user input; the catalog only upgrades warning quality. Not on the acceptance line. |
| Alliance/carrier network explorer ("after picking a product, see which airports it can fly") | User-raised 2026-08-26: without route discovery the user still searches carrier networks manually on the open web. **Promoted 2026-08-26** (post-acceptance scope round, user-approved): ship A (alliance→carrier two-step selection) + B (destinations panel sourced ONLY from the existing schedule catalog, honest empty states) now; C (CX + partner network harvesting research round) deferred until A+B ships. No map feature, no URL-schema change — alliance is a filter layer derived from the selected product. **Follow-ups within scope (2026-08-26):** the product picker now narrows to the active alliance so cross-alliance products no longer leak into it, and the destinations panel gained a four-tier grouping (洲→區塊→國家→機場, continent → subregion → country → airport) driven by a `subregion` field added to the geo catalog — both recorded here because they extend the promoted item, not as new subsystems. |
| UI re-alignment to DESIGN.md ("aviation-cartographic") + first-party dark mode | User-raised 2026-08-26: the v1.4 Apple-HIG token layer had silently diverged from DESIGN.md (system-ui fonts, iOS blue on white, pill radii, card shadows — several AI-slop-blacklist violations). **Promoted 2026-08-26** (user-approved, "重新全部設計"): token layer rewritten back to the editorial parchment/teal/IBM-Plex system; a charcoal night-chart dark mode was designed and added to DESIGN.md (its first dark-mode spec). Pure presentation-layer change — zero behavior, routing, data, or URL-schema impact. |

"No start" includes "while I'm in there anyway" opportunism — that is precisely the mechanism that produced six phases of divergence.

## 5. Cuts Executed Under This Contract

Deleted outright (code, components, tests). The URL parser stays backward compatible so already-shared URLs keep parsing; retired parameters become inert.

1. **Earning/PQM/RDM secondary panel** — the pre-pivot product remnant.
2. **Map extras** — projection picker (single default projection remains), bearing display, PNG/SVG export.
3. **Award fee schedule cards** — display-only data carrying drift obligations without entering any total-cost estimate.
4. **zh-CN / ja locales** — first market is Taiwan; every UI change was paying a fourfold translation tax. en + zh-TW remain.

## 6. Maintenance Honesty

Quarterly chart-drift re-verification (`docs/process/chart-drift-checklist.md`) and schedule-catalog refreshes are **best-effort**, not guaranteed cadence. Data renders its `asOf`/era honestly; stale data degrades visibly instead of silently claiming currency.

## 7. Anti-Divergence Rule

While §2 is unmet, no new data subsystem, product, locale, map feature, or pricing source may be added unless it cites either (a) a calibration-set case it unblocks, or (b) an acceptance-line requirement. Anything else goes to the frozen backlog above.
