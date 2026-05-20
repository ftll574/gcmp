# CLAUDE.md

Project conventions and skill routing for **gcmp** (Great Circle Mapper Reimagined).

## What this is

A web app that replaces the FlyerTalk routing-thread habit for mileage runners. Single-page static site. No backend. URL is the share artifact.

## Source of truth

- **Design system:** `DESIGN.md` — typography, palette, spacing, component vocabulary, AI-slop blacklist
- **Full design doc** (problem statement, premises, cross-model reviews, 13 design decisions, 11 eng findings, 20 implementation tasks): `~/.gstack/projects/GreatCircleMapper/zhenyu-initial-design-20260521-044157.md`
- **Test plan** for `/qa` consumption: `~/.gstack/projects/GreatCircleMapper/zhenyu-initial-eng-review-test-plan-20260521-051002.md`

## Stack

- **Vite + React + TypeScript** (`strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- **SVG arc renderer** for the map (deck.gl deferred to v1.1)
- **zod** for earning-rules schema validation
- **Vitest + Testing Library** for unit + component; **Playwright** (Chromium only) for E2E
- **Cloudflare Pages** for hosting; **GitHub Actions** for CI

## Conventions

- **Engine purity:** Files under `src/lib/calc/**` MUST NOT import React, react-dom, or any UI library. ESLint enforces this (Q3 from eng review). Engine is pure functions only — portable to CLI, npm package, Raycast extension later.
- **Earning rules:** Each program lives at `data/programs/{carrier}/v{YYYY.Q}.json`. Validated by zod schema at build and runtime. Every entry carries a `confidence` field (`chart-verified` or `community-corrected`).
- **URL schema (v1):** `/r/v1/{IATA-IATA-IATA}?p=AA,AS&c=J&rv=2026.2`. The `/v1/` segment exists so v2 can coexist without breaking shared URLs. Parser is `src/lib/url-schema.ts` and returns a typed error union, never throws.
- **Rules version drift:** Shared URLs include `rv=YYYY.Q`. When the current rules version differs, the app shows a banner: "Rules have changed since this URL was created." Past 4 quarterly snapshots bundled.
- **Diagrams in comments:** Non-trivial pipelines (engine, URL parsing, rules resolver) get inline ASCII diagrams. Update diagrams in the same commit as the code they describe.

## Testing

Run command: `npm run test` (Vitest), `npm run test:e2e` (Playwright). To be wired up in v1 build.

- 100% coverage is the goal for `src/lib/calc/**` (engine purity makes it cheap)
- Every new function gets a test; every if/else gets tests for both branches
- Every fixed bug gets a regression test
- **Iron Rule:** `tests/calibration/flyertalk-routings.test.ts` contains 5 tests pinned to real FlyerTalk routing-thread answers. Failing any one of these blocks `/ship`. This operationalizes Success Criterion #2 from the design doc.

## Testing strategy minimums (from eng review)

- **Distance accuracy:** haversine SFO→NRT ≈ 4,470 nm (±5 nm tolerance); symmetric A↔B; triangle inequality on multi-leg
- **URL round-trip:** `parseShareUrl(encodeShareUrl(routing)) === routing` (property test)
- **Schema validation:** loading `data/programs/aa/*.json` passes zod; injecting malformed JSON fails CI
- **Engine boundary:** ESLint catches any UI import in `src/lib/calc/**`

## v1 NOT in scope

See `README.md`'s "NOT in v1" section. Notable: deck.gl, fare-basis input, OG image worker, "Copy as FlyerTalk post" button (cut per eng review OV7), aria-live on totals, locale-zoom, mobile drag-edit, codeshare auto-resolution, MPM.

## Day 0 prerequisites (do BEFORE Day 1 code)

1. **Calibration set** — open FlyerTalk, find 5 recent routing-discussion threads in the AA + Alaska forums, transcribe (OP question + answer + reply count) on paper. This is the spec for the engine — without it, the earning-rules schema is guessing. Save as `docs/calibration-set.md` once you have it.
2. **DESIGN.md** — done (this scaffold commit).

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
