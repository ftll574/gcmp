# CLAUDE.md

Project conventions and skill routing for **gcmp** (Taiwan-first RTW award route planner).

## What this is

A web app that replaces the FlyerTalk RTW-routing-thread habit for Taiwan-based award travelers. Build a multi-leg round-the-world itinerary, validate it against RTW and multi-carrier mileage-redemption award rules (segment counts, stopovers vs transfers, surface sectors, ocean crossings, direction, start/end constraints), estimate the award price where pricing bands exist, then fix violations and share the URL. Mileage earning / PQM-RDM comparison survives as a secondary panel, not the main flow. Single-page static site. No backend. URL is the share artifact.

## Source of truth

- **Design system:** `DESIGN.md` — typography, palette, spacing, component vocabulary, AI-slop blacklist
- **Pivot plan:** `docs/rtw-pivot-plan.md` — the product reset from earning calculator to RTW route planner
- **Taiwan-first scope:** `docs/taiwan-first-scope.md` — first-market product priorities (BR/EVA, CX primary; CI important-but-not-true-RTW)
- **Full design doc** (problem statement, premises, cross-model reviews, 13 design decisions, 11 eng findings, 20 implementation tasks): `~/.gstack/projects/GreatCircleMapper/zhenyu-initial-design-20260521-044157.md`
- **Test plan** for `/qa` consumption: `~/.gstack/projects/GreatCircleMapper/zhenyu-initial-eng-review-test-plan-20260521-051002.md`

## Stack

- **Vite + React + TypeScript** (`strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- **SVG d3-geo map renderer** — great-circle arcs, 4 projections, antimeridian wraparound (deck.gl was spiked post-v1.9 and reverted; don't reintroduce without a new decision)
- **zod** for build-time + runtime validation of `public/data/**` JSON (loyalty programs, alliances, market profiles, RTW products, award pricing, airports, continent mapping, network gaps)
- **Vitest + Testing Library** for unit + component tests — Vitest only. There is NO E2E framework: no `test:e2e` script, no Playwright devDep.
- **GitHub Pages** hosting (`https://ftll574.github.io/gcmp/`); **GitHub Actions** for CI + deploy

## Conventions

- **Engine purity:** Files under `src/lib/calc/**` MUST NOT import React, react-dom, or any UI library. ESLint enforces this (Q3 from eng review). Engine is pure functions only — portable to CLI, npm package, Raycast extension later.
- **Earning rules:** Each program lives at `data/programs/{carrier}/v{YYYY.Q}.json`. Validated by zod schema at build and runtime. Every entry carries a `confidence` field (`chart-verified` or `community-corrected`).
- **URL schema (v1):** hash routes — `#/r/v1/TPE-NRT-LAX?op=BR,BR&p=AA,AS&c=J&stp=1,0&surf=0,0&fc=J,J&proj=a&rv=2026.4&st=n&rtw=eva-star-alliance-world-travel`. Path = airport chains (groups separated by `,`, legs within a group by `-`); query carries operating carriers (`op`), stopover flags (`stp`: 1 stopover / 0 transfer), surface sectors (`surf`), fare classes (`fc`), projection (`proj`), rules version (`rv`), elite tier (`st`), and selected RTW product (`rtw`). The `/v1/` segment exists so v2 can coexist without breaking shared URLs. Parser is `src/lib/url-schema.ts` and returns a typed error union, never throws; v0.x URLs still parse.
- **Rules version drift:** Shared URLs include `rv=YYYY.Q`. When the current rules version differs, the app shows a banner: "Rules have changed since this URL was created." Past 4 quarterly snapshots bundled.
- **Diagrams in comments:** Non-trivial pipelines (engine, URL parsing, rules resolver) get inline ASCII diagrams. Update diagrams in the same commit as the code they describe.

## Testing

Run command: `npm run test` (Vitest — 332 tests passing, see README badge). No E2E runner: there is no `test:e2e` script and no Playwright dependency; verify site behavior through component tests + CI.

- 100% coverage is the goal for `src/lib/calc/**` (engine purity makes it cheap)
- Every new function gets a test; every if/else gets tests for both branches
- Every fixed bug gets a regression test
- **Iron Rule:** `tests/calibration/flyertalk-routings.test.ts` pins real FlyerTalk/community RTW routing threads (transcribed in `docs/calibration-set.md`): 18 active structural tests, zero open engine-gap TODOs. Failing any one of the active tests blocks `/ship`. This operationalizes Success Criterion #2 from the design doc; activated in commit `2af6e2c` (Phase-1 debt payoff), extended in Phase 2 (QF caps, ANA archived band/surface), in Phase 4 t4 (CX any-first pricing — mechanism pinned against live bands plus the complete official rv=2018.Q2 chart fixture (research round 2, Wayback 20180528013013); BR TPE–GUM network-gap watchlist warning; co-terminal direct-vs-two-sectors conflict guard), and in Phase 5 (CX open-jaw distance counting — `calib.cx-multicarrier.open-jaw-distance-counts` activated per decision record `docs/decisions/open-jaw-distance.md`).

## Testing strategy minimums (from eng review)

- **Distance accuracy:** haversine SFO→NRT ≈ 4,470 nm (±5 nm tolerance); symmetric A↔B; triangle inequality on multi-leg
- **URL round-trip:** `parseShareUrl(encodeShareUrl(routing)) === routing` (property test)
- **Schema validation:** loading `data/programs/aa/*.json` passes zod; injecting malformed JSON fails CI
- **Engine boundary:** ESLint catches any UI import in `src/lib/calc/**`

## NOT in scope

See `README.md`'s "Current Limits" section. Standing cuts: deck.gl (spiked and reverted — SVG d3-geo is the decision), live award-availability claims, fare-basis input, OG image worker, "Copy as FlyerTalk post" button (cut per eng review OV7), aria-live on totals, locale-zoom, mobile drag-edit, codeshare auto-resolution, MPM.

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
