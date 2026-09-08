# CLAUDE.md

Project conventions and skill routing for **gcmp** (Taiwan-first RTW award route planner).

## What this is

A web app that replaces the FlyerTalk RTW-routing-thread habit for Taiwan-based award travelers. Build a multi-leg round-the-world itinerary, validate it against RTW and multi-carrier mileage-redemption award rules (segment counts, stopovers vs transfers, surface sectors, ocean crossings, direction, start/end constraints), estimate the award price where pricing bands exist, then fix violations and share the URL. Mileage earning / PQM-RDM panel was removed outright (see `docs/convergence-contract.md` §5); the pure earning engine stays as lib code and legacy URL params keep parsing. Single-page static frontend, with an OPTIONAL Node gateway for date-specific schedules (TDX access verified by user-run report; post-fix operator acceptance pending; static-only planning still works). URL is the share artifact.

**Binding scope:** while the acceptance line in `docs/convergence-contract.md` is unmet, no new data subsystem, product, locale, or map feature may start — frozen backlog items (CI airport→region wiring, schedule-catalog expansion) included.

## Source of truth

- **Alliance mileage-ticketing coverage (2026-09-07):** `docs/alliance-ticketing-rules-2026-09-07.md` and `public/data/rtw-products/current.json` → `ticketingPrograms`. Every current full member in oneworld (16), Star Alliance (26) and SkyTeam (18) has an official ticketing / partner-award reference: **60/60 airlines across 49 loyalty-program records**. This reference layer is broader than planner products. Never infer an RTW product from alliance membership or ordinary partner-award eligibility. Only records with a `plannerProductId` may open the RTW validator. Planner-safe additions now include Iberia, Miles & More, JAL, Thai and Asiana. JAL uses origin-city/country, surface-stopover and city-visit primitives plus its official distance chart; Thai hard limits are automated but network-required backtracking stays a warning; Asiana uses IATA Area direction and a 2026-12-16 departure cutoff while carrier-specific ticketing/final-arrival timing remains a recheck.

- **Global alliance coverage target (2026-09-06):** `docs/alliance-global-coverage-baseline-2026-09-06.md`. The long-term route/schedule/operator target is all directional nonstop routes operated by current oneworld + Star Alliance member airlines. `npm.cmd run coverage:alliances -- YYYY-MM-DD` provides an evidence-only ledger from existing alliance, route-network and schedule catalogs. Global route coverage MUST remain `unknown` until a complete directional route denominator exists; the current curated catalog cannot be used as the denominator. Baseline on 2026-09-06: oneworld 16 active members / 4 with route evidence (25.0%), Star 26 / 3 (11.5%). Known partial routes: oneworld 34, Star 28; these are not global route counts.

- **Completed bounded CX cross-source acceptance (2026-09-06):** `docs/cx-cross-source-operator-evidence-2026-09-06.md`. The saved 1,111-row snapshot's TPE↔HKG Cathay designators are fully classified for 2026-09-06..09-14: 26 exact CX-operated identities are selectable and three exact marketing codeshares (CX5110/5111/5117) are explicitly identified as HK Express/UO-operated and remain non-selectable. There is NO CX-prefix rule; future/unlisted CX designators remain unresolved. The evidence chronology is preserved: the original 10-identity tranche was reviewed at 19:30Z while the completion tranche and UO negatives were reviewed at 23:45Z. Historical Edge replay uses only still-fresh saved supplier rows; later completion identities use a clearly labeled synthetic-freshness operator/UI fixture, not fresh TDX evidence. Current baseline: 895 tests / 61 files.

- **Schedule-catalog operator expansion (2026-09-06):** `docs/schedule-catalog-operator-evidence-2026-09-06.md` supersedes the EVA-only operator set. Existing chart-verified schedule data may establish an operator ONLY for exact route + exact flight number + applicable date/weekday. Added BR28 TPE-SFO from the existing airline-filing record and STARLUX JX233/JX234/JX12 only inside the official 2026-09-09..09-15 window. Product eligibility remains separate, so verified JX is still filtered out of BR/CX RTW products. Real Edge selects BR28 and survives `fn=28` share reload. The historical statement that CX was unresolved is superseded by the completed bounded CX record above.

- **Free AeroDataBox calibration (2026-09-06):** `docs/aerodatabox-free-calibration-2026-09-06.md`. Initial 18 unresolved targets returned 16 provider assertions and 2 UO Unknown, but AS7218 and JX12 on the same TPE-SFO relationship were BOTH labeled `IsOperator`; provider-only assertions are therefore never trusted. Zero-network exact-date cross-validation finds BR28 is the only original target with a same-date chart-verified match (agreement; 15 others lack overlapping evidence, not conflicts). Known-answer near-term BR controls BR851/852/8/18/28 on 2026-09-07 are 5/5 operator agreement; farther 9/10-9/12 controls were mostly Unknown, proving inconsistent free-tier future coverage. No AeroDataBox result is in production operator evidence. Current verified suite baseline is 857 tests / 61 files.

- **Bounded EVA operator acceptance (2026-09-06):** `docs/tdx-bounded-operator-acceptance-2026-09-06.md` supersedes the blanket "all TDX operators unverified" state. Normalizer v4 promotes ONLY exact identities with independent current official operator evidence: TPE→HKG BR809/851/857/867/869/871/891; HKG→TPE BR810/852/858/868/870/872/892; TPE→SFO BR8/18. No prefix/clock/alliance heuristic. All other TDX designators, including BR289x and CX, remain non-selectable references. Operator evidence checked `2026-09-05T17:43Z`, review due `2026-10-05T17:43Z`, and is not retroactive to the 17:09Z capture. Real Edge bounded replay selects BR851/BR852/BR8 and survives `fn=` share reload across 1440/1024/390px with zero unexpected requests. Use saved snapshot for regression; do not ask for another identical capture.

- **Historical real-Edge QA (2026-09-06):** `docs/tdx-browser-replay-2026-09-06.md`. Agent-run `npm.cmd run schedules:qa:replay` owns an isolated Edge + loopback Vite, intercepts schedule requests with the full saved snapshot at original capture time, and never starts a schedule gateway or authenticated request. Nine route/viewport cases passed (TPE–HKG, HKG–TPE, TPE–SFO × 1440/1024/390px), including dates, cross-day clipboard text, true share reload and unknown-date keyboard/requery. Clipboard is stubbed; Google Fonts blocked, fallback-font geometry only. Operator evidence remains missing; no selectable TDX flights, no fresh-supplier/full-accessibility acceptance. Do not ask for another identical capture or upgrade unverified references based on these tests.

- **Latest real-capture review (2026-09-06):** `docs/tdx-capture-review-2026-09-06.md` supersedes "snapshot missing" and pending-v3 statements. User-run v3 at `2026-09-05T17:09:57.251Z` saved all 1,111 public-field rows, no redactions; every CodeShare is an empty array. Agent-run offline replay matches all nine report windows with ZERO external requests. Operator acceptance remains unverified. A 61-row real fixture adds date/time regressions; calendar queries now preserve a useful current date and all deliberate date clicks, rather than jumping to the first monthly record. Use the saved snapshot for follow-up; do not request another capture for pure code changes. Historical replay is not fresh supplier or live-browser acceptance.

- **Offline TDX regression workflow (2026-09-06):** `docs/tdx-offline-replay-2026-09-06.md`. `schedules:verify` now saves a strict public-field `test-results/tdx-live/snapshot.json` from the same account-holder requests; no raw response or secrets. Agents may execute `npm.cmd run schedules:replay` themselves, without env loads, authentication or live fallback. Replay retains original capture time and is NOT fresh supplier acceptance. Read snapshot presence first; v2 statistical reports cannot reconstruct missing rows. Do not repeatedly ask the user to fetch again for pure normalizer edits. The authenticated-tool restriction remains unchanged.

- **Latest TDX operator-evidence gate (2026-09-06):** `docs/tdx-operator-evidence-2026-09-06.md` supersedes historical activation/pending-v2 statements. User-run v2 at `2026-09-05T16:09:44.097Z` has HTTP 200 access, 1,111 parsed rows, ZERO CodeShare entries, and unchanged flight-number sets. It does NOT establish operators. Normalizer `3-unverified-operators` retains TDX dates/designators in typed `references` (airlineCode, no carrier), never selectable operating flights or alliance eligibility. Diagnostic v3 separates reference counts, captures missing/null/empty CodeShare states and at most 16 public examples even with no aliases. Read the latest user-run report first. Never run authenticated TDX requests or indirectly bypass the prior tool-side block. Real operator acceptance remains open; ANA's independently sourced published-flight workflow remains available.

- **TDX real-report review (2026-09-05):** `docs/tdx-live-review-2026-09-05.md` — user-run report at 14:43Z proves auth + three timetable calls HTTP 200, observed dates through Oct 24. It exposed a structured-CodeShare handling gap; normalizer v2 and 25 regressions fix the documented shape. Corrected live operator counts still await user rerun. CodeShare.FlightNumber is a suffix paired with AirlineID, NOT necessarily a full identifier. Diagnostic v2 captures whitelisted public-field examples. Do not bypass the prior tool-side auth block; only read user-run results. Historical activation record: `docs/tdx-activation-check-2026-09-05.md`.
- **Follow-up diagnostic evidence:** the last report read still had checkedAt `2026-09-05T14:43:02.524Z`, without v2 fields. `timetableSnapshots[].summaryVersion=2` now preserves split-field/padding, direction, validity, weekdays, update time and explicit offsets, plus capped-example omission counts. The operating normalizer itself is unchanged. Sixteen new synthetic regressions and all 75 focused TDX tests passed, as did TypeScript; the full validation command's result was blocked during tool output retrieval and remains unconfirmed. Read the latest report before requesting another user run; never treat truncated examples as a complete replay snapshot.
- **Official publication / TDX round (2026-09-05):** `docs/official-timetable-2026-09-05.md` and `docs/decisions/official-timetable-dates.md` refine the prior date-search restriction: verified, validity-bounded official publications may produce a distinct `published` state, even with missing times. Legacy network/weekly data still cannot. The static ANA catalog works without a key. TDX adapter is implemented but real credentials and payload acceptance remain pending; default provider is TDX, never silent paid fallback.

- **Date-specific schedules (2026-09-05):** `docs/dated-flight-search-2026-09-05.md` and `docs/decisions/dated-flight-search.md` — user-requested month calendar and optional server-only schedule gateway. Live supplier credentials are NOT configured; fixture tests are not airline service evidence. Never derive a confirmed flight/no-flight date from route observations, legacy weekly rows or empty booking results. Keep operating flight references when sharing; clear them when date/operator changes. Secrets never enter VITE_ variables or public assets.
- **Next-leg discovery round (2026-09-05):** `docs/network-discovery-2026-09-05.md` and `docs/decisions/route-network-discovery.md` — 42 sourced directional route observations, default product-eligible operators and current endpoint, per-operator additions. Network evidence must NEVER be inserted into schedules as invented weekdays. Actual-App BR/CX blank-start/share/reload tests pass; full browser QA and broad network coverage remain open.
- **Implemented repair round (2026-09-05):** `docs/takeover-repairs-2026-09-05.md` — read after the audit. The eight reproduced integrity failures are fixed and permanently tested. Preserve operators on product changes; preserve leg metadata by airport-occurrence identity. Current Qantas new-booking prices and historical fixtures are separate. Full browser QA and BR/CX partner-network coverage remain open.
- **Takeover audit (2026-09-05):** `docs/takeover-audit-2026-09-05.md` — read before further development. Records the user's usability/data concerns, 8 reproduced planning-integrity failures, catalog gaps, and a proposed repair order. Findings are not implemented fixes or a replacement for explicit scope decisions; archived failing probes live under `docs/audits/` as text, outside the normal passing suite.
- **Design system:** `DESIGN.md` — typography, palette, spacing, component vocabulary, AI-slop blacklist
- **Pivot plan:** `docs/rtw-pivot-plan.md` — the product reset from earning calculator to RTW route planner
- **Convergence contract:** `docs/convergence-contract.md` — BINDING north star (bounded rigor), BR/CX acceptance line, sole next phase (violation fix hints v1), frozen backlog, executed cuts, best-effort maintenance stance
- **Taiwan-first scope:** `docs/taiwan-first-scope.md` — first-market product priorities (BR/EVA, CX primary; CI important-but-not-true-RTW)
- **Chart-drift review:** `docs/process/chart-drift-checklist.md` — quarterly rv-era chart re-verification workflow: Wayback CDX playbook (`filter=` soft-fails; use prefix queries), JS-shell/RSC discrimination, dual confidence vocabulary, CONFLICT #N ledger, negatives-as-evidence
- **Full design doc** (problem statement, premises, cross-model reviews, 13 design decisions, 11 eng findings, 20 implementation tasks): `~/.gstack/projects/GreatCircleMapper/zhenyu-initial-design-20260521-044157.md`
- **Test plan** for `/qa` consumption: `~/.gstack/projects/GreatCircleMapper/zhenyu-initial-eng-review-test-plan-20260521-051002.md`

## Stack

- **Vite + React + TypeScript** (`strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- **SVG d3-geo map renderer** — great-circle arcs, antimeridian wraparound; projection picker cut (single default projection renders unless a shared URL carries one) (deck.gl was spiked post-v1.9 and reverted; don't reintroduce without a new decision)
- **zod** for build-time + runtime validation of `public/data/**` JSON (loyalty programs, alliances, market profiles, RTW products, award pricing, airports, continent mapping, network gaps)
- **Vitest + Testing Library** for unit + component tests — Vitest only. There is NO E2E framework: no `test:e2e` script, no Playwright devDep.
- **GitHub Pages** hosting (`https://ftll574.github.io/gcmp/`); **GitHub Actions** for CI + deploy

## Conventions

- **Engine purity:** Files under `src/lib/calc/**` MUST NOT import React, react-dom, or any UI library. ESLint enforces this (Q3 from eng review). Engine is pure functions only — portable to CLI, npm package, Raycast extension later.
- **Earning rules:** Each program lives at `data/programs/{carrier}/v{YYYY.Q}.json`. Validated by zod schema at build and runtime. Every entry carries a `confidence` field (`chart-verified` or `community-corrected`).
- **URL schema (v1):** hash routes — `#/r/v1/TPE-NRT-LAX?op=BR,BR&p=AA,AS&c=J&stp=1,0&surf=0,0&fc=J,J&proj=a&rv=2026.4&st=n&rtw=eva-star-alliance-world-travel`. Path = airport chains (groups separated by `,`, legs within a group by `-`); query carries operating carriers (`op`), stopover flags (`stp`: 1 stopover / 0 transfer), surface sectors (`surf`), fare classes (`fc`), per-leg departure dates (`d`: mirrors `op`'s shape — groups by `;`, legs by `,`, empty cell = undated leg; a present group's date count must equal its leg count or parsing fails with a typed error; absent ⇒ every leg undated), projection (`proj`), rules version (`rv`), elite tier (`st`), and selected RTW product (`rtw`). The `/v1/` segment exists so v2 can coexist without breaking shared URLs. Parser is `src/lib/url-schema.ts` and returns a typed error union, never throws; v0.x URLs still parse.
- **Rules version drift:** Shared URLs include `rv=YYYY.Q`. When the current rules version differs, the app shows a banner: "Rules have changed since this URL was created." Past 4 quarterly snapshots bundled.
- **Diagrams in comments:** Non-trivial pipelines (engine, URL parsing, rules resolver) get inline ASCII diagrams. Update diagrams in the same commit as the code they describe.

## Testing

Run command: `npm.cmd run test` on Windows PowerShell (Vitest — 895 tests in 61 files confirmed on 2026-09-06, including all 24 calibration cases plus bounded operator evidence, complete saved-snapshot CX classification, known-other-operator codeshare handling, replay, AeroDataBox calibration and exact-date cross-validation regressions). TypeScript, lint, build and diff check also pass for this round. No E2E framework: there is no `test:e2e` script and no Playwright dependency. `scripts/qa-flight-calendar.mjs` and `scripts/qa-tdx-replay.mjs` are bounded isolated-Edge smoke/capture scripts, not a complete E2E suite. Historical cases use saved public rows only while the post-freshness CX completion cases are explicitly labeled synthetic-freshness operator/UI fixtures; neither is fresh TDX or full accessibility acceptance.

- 100% coverage is the goal for `src/lib/calc/**` (engine purity makes it cheap)
- Every new function gets a test; every if/else gets tests for both branches
- Every fixed bug gets a regression test
- **Iron Rule:** `tests/calibration/flyertalk-routings.test.ts` pins real FlyerTalk/community RTW routing threads (transcribed in `docs/calibration-set.md`): 24 active structural tests, zero open engine-gap TODOs. Failing any one of the active tests blocks `/ship`. This operationalizes Success Criterion #2 from the design doc; activated in commit `2af6e2c` (Phase-1 debt payoff), extended in Phase 2 (QF caps, ANA archived band/surface), in Phase 4 t4 (CX any-first pricing — mechanism pinned against live bands plus the complete official rv=2018.Q2 chart fixture (research round 2, Wayback 20180528013013); BR TPE–GUM network-gap watchlist warning; co-terminal direct-vs-two-sectors conflict guard), in Phase 5 (CX open-jaw distance counting — `calib.cx-multicarrier.open-jaw-distance-counts` activated per decision record `docs/decisions/open-jaw-distance.md`), and in Phase 9 (CI SkyTeam partner zone-pair chart — six `calib.ci-skyteampartner.*` pins over the §A8 Era-2 matrix via `getZonePairQuote()`). Quarterly chart re-verification follows `docs/process/chart-drift-checklist.md`.

## Testing strategy minimums (from eng review)

- **Distance accuracy:** haversine SFO→NRT ≈ 4,470 nm (±5 nm tolerance); symmetric A↔B; triangle inequality on multi-leg
- **URL round-trip:** `parseShareUrl(encodeShareUrl(routing)) === routing` (property test)
- **Schema validation:** loading `data/programs/aa/*.json` passes zod; injecting malformed JSON fails CI
- **Engine boundary:** ESLint catches any UI import in `src/lib/calc/**`

## NOT in scope

See `README.md`'s "Current Limits" section. Standing cuts: deck.gl (spiked and reverted — SVG d3-geo is the decision), live award-availability claims, fare-basis input, OG image worker, "Copy as FlyerTalk post" button (cut per eng review OV7), aria-live on totals, locale-zoom, mobile drag-edit, codeshare auto-resolution, MPM, earning/PQM-RDM panel + valuations data, map projection picker / bearing labels / PNG·SVG export, award fee-schedule cards + fee schema/data, zh-CN/ja locales (all cut under `docs/convergence-contract.md` §5).

## Day 0 prerequisites (status)

1. **Calibration set** — done (Phase-1 debt payoff): 5 real FlyerTalk/community RTW routing threads transcribed into `docs/calibration-set.md`, pinned by the active `tests/calibration/flyertalk-routings.test.ts`. Still the spec for the engine — without it, the rules schema is guessing.
2. **DESIGN.md** — done (scaffold commit).

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

- Product ideas / brainstorming → `/office-hours`
- Strategy / scope → `/plan-ceo-review`
- Architecture / engineering planning → `/plan-eng-review`
- Design system / plan review → `/design-consultation` or `/plan-design-review`
- Full review pipeline → `/autoplan`
- Bugs / errors → `/investigate`
- QA / testing site behavior → `/qa` or `/qa-only`
- Code review / diff check → `/review`
- Visual polish → `/design-review`
- Ship / deploy / PR → `/ship` or `/land-and-deploy`
- Save progress → `/context-save`
- Resume context → `/context-restore`
