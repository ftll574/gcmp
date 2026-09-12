# gcmp — RTW Route Planner

### First bounded Cathay cross-source acceptance (2026-09-06)

CX407 TPE→HKG and CX400 HKG→TPE now have a short-lived `cross-source verified` operator tier for 2026-09-06..09-14. The evidence combines Cathay's current route/operated-flight statements, exact current Flight.info identities, and the prior AeroDataBox assertion; it is intentionally weaker than airline-official exact flight evidence and never generalizes to `CX*`. Real Edge replay selects both flights under the Cathay/oneworld product and survives `fn=` share reload. See `docs/cx-cross-source-operator-evidence-2026-09-06.md`.

### Free AeroDataBox calibration prototype (2026-09-06)

An isolated `schedules:calibrate:aerodatabox` harness now samples unresolved designators from the saved TDX snapshot for a low-quota second-source experiment. It does not feed production UI/eligibility. Without a local RapidAPI key it generates an 18-target plan with zero external requests; with a key it is capped at 30 calls and 1 req/s, and Unknown/conflicting operator signals stay unresolved. See `docs/aerodatabox-free-calibration-2026-09-06.md`.

### First bounded operating-carrier acceptance (2026-09-06)

TDX dates can now become selectable flights **only** when an independent official source establishes the exact operating identity. The first accepted set is narrowly scoped to EVA: TPE→HKG BR809/851/857/867/869/871/891, HKG→TPE BR810/852/858/868/870/872/892, and TPE→SFO BR8/BR18. All other TDX designators remain operator-unverified references; there is no BR-prefix rule and CX remains unverified. Operator evidence has its own review deadline and is not applied retroactively to the earlier TDX capture. Real Edge replay selected BR851/BR852/BR8, wrote `fn=`, and survived full share reload at 1440/1024/390px. See `docs/tdx-bounded-operator-acceptance-2026-09-06.md`; public deployment is unchanged.

### Existing schedule catalog expands exact operator evidence (2026-09-06)

The same evidence gate now also accepts **exact, date-bounded chart-verified schedule records** already in the repo. BR28 TPE→SFO is now selectable from the existing airline-filing record; STARLUX JX233/JX234/JX12 are operator-verified only inside the official 2026-09-09..09-15 timetable window. This never becomes a carrier-prefix rule, and product eligibility is still separate: verified JX flights do not become valid EVA/Cathay RTW segments. Real Edge selected BR28, wrote `fn=28`, and survived full share reload. CX remains unresolved. See `docs/schedule-catalog-operator-evidence-2026-09-06.md`.

### Historical TDX browser replay (2026-09-06)

`npm.cmd run schedules:qa:replay` now runs an isolated real-Edge check against the saved 1,111-row snapshot, without a schedule server or supplier request. All nine route/viewport cases passed: selected dates, cross-day customer-service copy, true share reload, keyboard navigation to an unknown date and calendar geometry. The clock is historical, clipboard is stubbed and remote fonts are blocked. This does **not** establish operating airlines or enable selecting TDX references as operating flights. See `docs/tdx-browser-replay-2026-09-06.md`; public deployment is unchanged.

### Real TDX snapshot replayed; enquiry date preserved (2026-09-06)

The account-holder's v3 capture at `2026-09-05T17:09:57.251Z` now provides all 1,111 public-field rows with no row redactions. Agent-run offline replay matches all nine diagnostic windows with zero external requests. Every CodeShare is an empty array, so operators remain unverified. A 61-row real-data regression fixture exposed and fixed a calendar bug that moved an October 24 enquiry to the first October record; queries now retain useful current dates and deliberate date selections. This is historical replay plus mocked-HTTP component testing, not live-browser or operating-carrier acceptance. See `docs/tdx-capture-review-2026-09-06.md`. Older sections below describe their respective historical rounds.

### Offline TDX regression replay (2026-09-06)

The account-holder `npm.cmd run schedules:verify` now saves a strict public-field `test-results/tdx-live/snapshot.json` from the same existing requests, with no secret/raw-response dump. Agents can then run `npm.cmd run schedules:replay` without credentials or network access. Replay keeps the original capture time and never upgrades old evidence into a fresh supplier check. Missing/invalid snapshots stop without a live fallback. Statistical reports alone cannot reconstruct the missing rows; no real replay snapshot was available in this checkout during this round. See `docs/tdx-offline-replay-2026-09-06.md`.

### TDX dates retained; unverified operators isolated (2026-09-06)

The latest user-run v2 report confirms access but has **zero CodeShare entries across 1,111 parsed rows**, so operating-carrier acceptance has not passed. TDX records now appear as dated references with explicit operator-unverified labels and customer-service copy, not selectable operating flights or BR/CX eligibility results. No carrier blacklist or flight-number heuristic is used. The independently verified ANA publication workflow remains selectable. Diagnostic v3 captures missing/null/empty relationship fields without extra API requests. See `docs/tdx-operator-evidence-2026-09-06.md`; public deployment is unchanged.

### TDX access verified; operator cleanup under acceptance (2026-09-05)

The account holder's diagnostic returned HTTP 200 for authentication and three timetable routes, with observed publications through 2026-10-24. This proves access, not complete global coverage. A structured-codeshare parsing defect has since been fixed and tested; live post-fix operator counts require a second user-run diagnostic. See `docs/tdx-live-review-2026-09-05.md`. Public deployment remains unchanged.

The follow-up diagnostic preserves split codeshare fields, validity, weekdays and explicit day offsets without collapsing distinct source records; bounded samples now state their omitted counts (`timetableSnapshots[].summaryVersion=2`). This is an offline diagnostic improvement, not completed live operator acceptance. The stored live report was still the first version when last read. The 75 focused TDX tests and TypeScript passed; the full validation command was started but its result could not be read because of a tool safety block. The badge below remains the **previous fully confirmed baseline**, not a claim about the newly expanded full suite.

### Official timetable calendars (2026-09-05)

The static app now expands 37 reviewed ANA seasonal service records into explicitly labeled **official timetable dates**, without an API key or backend. It handles validity, exceptional additions/cancellations and review expiry; absent times stay unknown. Dates are not live operating confirmations or award availability. An optional server-side TDX adapter queries Taiwan-related international timetable snapshots; user-run authentication and data access have passed, while post-fix operating-carrier acceptance remains pending. See `docs/official-timetable-2026-09-05.md` for coverage/setup and `docs/tdx-live-review-2026-09-05.md` for the latest live-report status. Public deployment has not been changed.

**Live at: https://ftll574.github.io/gcmp/**

Taiwan-first round-the-world award route planner. Build an itinerary, mark stopovers and surface sectors, validate it against RTW and multi-carrier mileage-redemption award rules, and share the URL.

![Status: RTW pivot](https://img.shields.io/badge/status-RTW%20pivot-blue) ![License: MIT](https://img.shields.io/badge/license-MIT-green) ![Tests: 861 passing](https://img.shields.io/badge/tests-861%20passing-green)

### 2026-09-05 repair round

Eight reproduced planning-integrity defects are fixed: editing dates/stopovers/surface sectors and deleting/reordering airports no longer loses unrelated metadata; importing or changing redemption products preserves the original operating carriers; explorer additions use the selected carrier; schedule warnings reach the main rule panel. Settings and dates start expanded, missing information is no longer a green verdict, and schedule sources/validity are visible. See `docs/takeover-repairs-2026-09-05.md` for the implementation record and limits. These checkout changes are not a claim that the public deployment has been updated.

## What It Does

- **Date-specific flight calendar (TDX access verified; bounded operator acceptance)** — query a month of schedules through an optional server-only gateway. Exact identities with separate current official operator evidence can be selected; unresolved designators remain enquiry-only references. Award seats are never queried. See `docs/tdx-bounded-operator-acceptance-2026-09-06.md`; no claim that the public website is already connected.
- **Plan multi-leg RTW routings** — add airports by IATA code, city name, or city code.
- **Discover the next leg from the current endpoint** — all product-eligible operators, destination search, separate carrier-specific add buttons, and visible source/publication dates. The initial network catalog adds 42 directional CX/AY/BA/AA/LH/UA records to the existing schedules without inventing weekly service or award seats. See `docs/network-discovery-2026-09-05.md` for the tested BR/CX workflows and remaining gaps.
- **Validate mileage-redemption RTW products** — current planning candidates include EVA Star Alliance World Travel Award, Cathay Asia Miles oneworld Multi-carrier Award, Qantas oneworld Classic Flight Reward, ANA archived RTW award, and China Airlines SkyTeam partner award caveats.
- **Taiwan-first priority** — BR/EVA, CI/China Airlines, JX/STARLUX, CX/Asia Miles, JL/JAL, NH/ANA, and SQ/KrisFlyer are modeled as first-market priorities.
- **Taiwan carrier notes** — the Rules inspector explains why China Airlines cannot form a classic RTW ticket (both-ocean crossings rejected) and why STARLUX COSMILE stays on the watchlist (no own RTW award product today).
- **Track RTW-specific metadata** — stopover vs transfer, surface/open-jaw sectors, operating carrier eligibility, segment count, distance caps, same-city/same-country constraints.
- **Estimate award price** — EVA, Cathay, and Qantas Classic Flight Reward products show miles required from pricing bands where data is available; CI legs get SkyTeam zone-pair quotes.
- **Map the route** — great-circle arcs, pan/zoom, optional per-arc distance labels.
- **Share URL** — routing, operating carriers, fare classes, stopover flags, dates, and surface sectors round-trip in the URL.
- **Earning calculator removed** — the pre-pivot PQM/RDM panel was cut outright (`docs/convergence-contract.md` §5); its legacy URL parameters still parse so previously shared links never break.

## Why

Taiwan-based travelers planning complex RTW or multi-carrier award itineraries need a different tool from a generic mileage earning calculator.

The core questions are:

- Can this route be redeemed under this RTW award or multi-carrier award product?
- Which airline alliance or mileage program can support it?
- Which leg violates the rule?
- How many segments, stopovers, surface sectors, and miles have I used?
- Which Taiwan-relevant programs are useful, limited, or not true RTW candidates?

`gcmp` is now aimed at that workflow.

## Taiwan-First Scope

The first-market profile lives at `public/data/markets/tw/current.json`.

Current priority:

- **Primary**: EVA Star Alliance World Travel Award, Cathay Asia Miles oneworld Multi-carrier Award
- **Important but limited**: China Airlines Dynasty Flyer, STARLUX COSMILE
- **Secondary / watch**: JAL Mileage Bank, ANA Mileage Club, Singapore KrisFlyer

China Airlines is intentionally modeled as Taiwan-important but not a true RTW award candidate because its SkyTeam partner award rules reject itineraries crossing both the Pacific and Atlantic.

ANA Star Alliance RTW award is modeled as discontinued for new ticketing because ANA stopped issuing new Star Alliance RTW award tickets as of 2025-06-23.

Cash RTW fares such as oneworld Explorer and Star Alliance Round the World Fare may remain in reference data, but they are not surfaced in the planner. The product is for travelers redeeming miles, not buying cash RTW tickets.

## Quick Start

Run the checkout with `npm run dev` to try the unreleased changes. The public deployment is not updated by these local edits.

1. Choose the redemption product and cabin.
2. From TPE, pick a sourced next-leg option by its operating airline, or add airports manually. Each addition follows the new endpoint.
3. Fill departure dates, mark arrivals as transfers/stopovers, and mark surface sectors when no flight is taken.
4. Set the trip boundaries, review rules and the whole-ticket price estimate, then resolve failed findings.
5. Save or share the URL. Flight schedules and award seats still need independent verification.

## URL Schema

Shareable URLs use a hash so any static host works:

```text
https://ftll574.github.io/gcmp/#/r/v1/TPE-NRT-LAX-JFK-LHR-HKG-TPE?op=JL,JL,AA,BA,CX,CX&p=AA,AS&c=J&stp=1,1,1,1,1,0&surf=0,0,0,0,0,0&proj=a&rv=2026.4
```

- `/r/v1/...` — schema version
- Path — airport chains; groups separated by `,`, legs within group by `-`
- `op` — operating carriers; groups by `;`, legs by `,`
- `stp` — per-leg stopover flags: `1` stopover, `0` transfer, empty unknown
- `surf` — per-leg surface/open-jaw flags: `1` surface, `0` flown sector
- `d` — optional per-leg departure dates (ISO `YYYY-MM-DD`), same shape as `op`: groups by `;`, legs by `,`, empty cell = undated leg; a present group's date count must equal its leg count (typed parse error otherwise); absent ⇒ every leg is undated (e.g. `&d=2026-04-03,,2026-04-07`)
- `fc` — optional fare class letters (parsed for backward compatibility)
- `p`, `c`, `st` — legacy earning-estimate parameters: parsed so old links keep working, no longer surfaced in the UI
- `rv` — rules version; drives the drift banner when it differs from the bundled snapshot
- `proj` — map projection; parsed for backward compatibility (the picker was cut — URLs render the projection they carry, otherwise the default)

## Data Model

RTW planning data is separate from mileage earning data:

- `public/data/alliances/current.json` — airline alliance membership
- `public/data/markets/tw/current.json` — Taiwan-first product priorities
- `public/data/rtw-products/current.json` — RTW fare and award products
- `public/data/award-pricing/current.json` — award pricing bands for supported products
- `public/data/network-gaps/current.json` — carrier pairs known not flown, backing honest sector warnings
- `public/data/route-network/current.json` — source-backed, directional operating routes, deliberately separate from weekly schedules and seats
- `public/data/schedules/current.json` — curated weekly operating-day catalog (directional carrier pairs, evidence-graded) backing the date picker's day-disabling and schedule warnings
- `public/data/programs/**` — mileage earning rules backing the plain-text share post

Schemas live in:

- `src/lib/schemas/alliance.ts`
- `src/lib/schemas/market.ts`
- `src/lib/schemas/rtw-rule.ts`
- `src/lib/schemas/program.ts`
- `src/lib/schemas/airports.ts`
- `src/lib/schemas/network-gaps.ts`
- `src/lib/schemas/flight-schedules.ts`
- `src/lib/schemas/route-network.ts`

Pure engines:

- `src/lib/rtw/validate.ts` — RTW rule validation
- `src/lib/rtw/award-pricing.ts` — award price estimation
- `src/lib/rtw/schedule-days.ts` — schedule lookup: ISO weekday of a date plus operating-day/window resolution against the schedules catalog
- `src/lib/rtw/next-leg-discovery.ts` — merge network observations with schedules, preserving direction, product eligibility and explicit operating carriers
- `src/lib/calc/**` — distance and mileage estimate engine

## Development

```bash
npm install
npm run dev
npm run typecheck
npm run test
npm run lint
npm run build
npm run coverage:route-freshness -- 2026-09-12 30
```

## Testing

Current local baseline:

- 861 Vitest tests in 61 files (incl. 24 calibration cases plus bounded operator-evidence, schedule-catalog operator evidence, unverified-operator, offline-replay, real-capture/date-selection, browser-replay, AeroDataBox free-calibration and exact-date cross-validation regressions)
- strict TypeScript
- ESLint engine purity rule for `src/lib/calc/**`
- production build via Vite

## Current Limits

- **Live award availability is not checked.** The app validates structural rule eligibility only; seat inventory is out of scope.
- **Route-network coverage is partial and distinct from timetables.** The merged runtime currently represents all 60 configured alliance-member carriers and tens of thousands of directional rows, but this is a curated/provider-backed planning graph rather than a complete global denominator. `npm run coverage:route-freshness -- <asOf> <days>` separates confirmed-current operating evidence from stale and provider-listed/unknown rows, reports Taiwan and bounded alliance-hub gaps, and always leaves global coverage `unknown`. See `docs/route-data-freshness.md` for the 2026-09-12 audit, evidence rules, and source-backed repairs.
- **Award pricing is product-specific.** EVA has fixed RTW prices; Cathay has distance bands with recheck confidence; Qantas oneworld has all ten bands/four cabins from the official new-booking table effective 2025-08-05 (verified 2026-09-05), including 365,800 Qantas Points for top-band business. The original pre-Aug-2025 partial table is frozen in `tests/fixtures/qantas-pre-2025-08-05.json`; current planning does not reconstruct old-ticket pricing from departure dates or share URLs. ANA remains a partial archived chart. CI's 66-cell zone-pair reference chart is wired to per-leg station-zone quotes, not a true RTW total. The two cash RTW fares are excluded from the planner. See `docs/takeover-repairs-2026-09-05.md` for source/era handling; not all charts have been freshly verified.
- **Cathay fourth-era chart drift is resolved at cell level; two gaps stay honestly open.** The FT 2184572 Jan-2025 data point (230,000 miles @ 19,442 self-stated flown miles) that matched no frozen-era band cell is now explained: it is Zone 10 (18,001–20,000 mi) Business under the revised fourth-era grid — pinned by two independent data points (Prince of Travel 2025-07-16; Suitesmile full-grid transcription 2026-05-02) with a third browser-render cross-check (§A9). Zone edges are byte-identical to rv=2018.Q3; only prices moved. Remaining gaps: the official flights.cathaypacific.com chart page is unresolvable from this network (DNS failure), so the grid rests on community sources rather than the airline's own page; and the exact effective date inside the bracket (2023-02-26, 2025-01-25] stays unpinned.
- **Total cost with taxes/fees is not estimated.** The former display-only fee-schedule cards were cut under `docs/convergence-contract.md` §5 — they carried chart-drift obligations without feeding any total.
- **Per-leg dates are modeled; chronology and schedule checks run on them.** Legs carry an optional departure date (`Leg.departsOn`, ISO `YYYY-MM-DD`, shared via the URL `d=` parameter), and the `trip-duration` rule (`src/lib/rtw/validate.ts`) still fails itineraries outside the product's min/max trip days whenever start+end dates are set (severity unknown without them). On top of leg dates the engine enforces `leg-chronology` as a fail (consecutive dated legs may not run backwards), warns when trip start/end dates disagree with the first/last leg dates (`trip-dates-mismatch`), and warns when a dated flight leg falls on a weekday its carrier+pair doesn't operate (`schedule-day-mismatch`) — a warning, never a fail, because timetables drift and a conflict makes a trip unbookable rather than illegal. Stopover *duration* remains user-marked with no duration model.
- **Flight-schedule coverage is a curated national-carrier catalog, not live data.** `public/data/schedules/current.json` holds 138 directional weekly-frequency entries — **JX×78 `chart-verified` harvested from STARLUX's official public schedule API** (`ecapi.starlux-airlines.com/flightSchedule/v2/timetable`; every route × both directions, each row citing its exact query URL, quarterly refresh via `scripts/harvest-jx-schedules.mjs`), **BR×28 `chart-verified` from AeroRoutes official filings** (current NS26/W26 seasons incl. the new TPE→IAD launch and the TPE→DEL Dec-2026 launch window), and **CI×32 `chart-verified` from China Airlines' official complete-timetable PDF** (Issue 2, validity 2025-01-01→2025-03-29 — expired windows seed the catalog honestly but produce no current-date findings, by design; a newer official PDF exists but has never been archived and the live page blocks crawlers, so current-season CI grids remain an honest gap). All three carriers now cover both directions of every pinned route. Pairs without a verified entry keep a fully enabled date input plus a 「班表未知」 badge — unverified schedules never disable or block dates. The CX HKG→LHR April-2026 transcription is deliberately excluded from the seed (it pins only extra sections over an unpinned near-daily base service). No live/global schedule coverage exists or is claimed; sources, negatives, and omissions are recorded in research appendices §A10–§A12 (`docs/calibration-set.md`). CI zone-pair quotes resolve through a 65-station chart-verified map (§A12) covering every station in the pinned network.
- **Standing cuts:** MPM (maximum permitted mileage), fare-basis input, plus the full list under CLAUDE.md's "NOT in scope".
- **Scope convergence:** binding scope decisions (acceptance line, frozen backlog, executed cuts) live in `docs/convergence-contract.md`.
- **Data freshness is best-effort, not a guaranteed cadence.** Quarterly chart-drift re-verification (`docs/process/chart-drift-checklist.md`) and schedule-catalog refreshes happen when they happen; datasets render their asOf/era honestly and stale data degrades visibly instead of silently claiming currency.
- Earning/PQM/RDM math remains as a secondary estimate and should not drive RTW validity.

## License

MIT
