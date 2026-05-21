# Changelog

All notable changes to this project will be documented in this file. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow `MAJOR.MINOR.PATCH.MICRO`.

## [0.1.0.0] - 2026-05-22

### Added

- **Routing engine** (`src/lib/calc/`):
  - Haversine + great-circle math (distance, bearing, sampled polyline path, polar-region detection)
  - SVG arc renderer with antimeridian splitting (replaces deck.gl in v1 per /plan-eng-review OV3)
  - `computeRouting(legs, programs)` engine returning per-leg + per-program PQM/RDM
  - `parseShareUrl` / `encodeShareUrl` with `/r/v1/...?op=&p=&c=&rv=` schema and typed error union (never throws)
  - Zod schema for loyalty-program JSON files (program-loader.ts) with build- and runtime validation
  - Airport prefix-trie index with ambiguous-code handling (e.g. "LON" → all 3 London airports surfaced)
- **Data** (`public/data/`):
  - `airports.json` — 4,563 airports filtered from Our Airports (large + medium commercial only)
  - `airlines.json` — 45 carriers covering both program partner networks
  - `programs/aa/v2026.4.json` — AA AAdvantage with 9 partner carriers and 16+ fare buckets, chart-verified
  - `programs/as/v2026.4.json` — Alaska Mileage Plan with 12 partner carriers, chart-verified
  - Every carrier entry has a `confidence: 'chart-verified' | 'community-corrected'` field surfacing AA's chart-vs-postings divergence to users
- **UI** (`src/components/`):
  - AirportAutocomplete with debounced search + IATA/ICAO/city/name ranking + ambiguous-code dropdown
  - LegChain with HTML5 drag-to-reorder + per-leg operating-carrier select + × removal
  - CabinSelector (Y / W / J / F tabs)
  - ProgramToggle (AA / AS side-by-side)
  - MapView — SVG world with Mercator projection + lat/lon grid + great-circle arcs
  - MapErrorBoundary — text-route fallback + retry button if map render throws
  - EarningPanel — per-program PQM/RDM display (Plex Mono numbers, hero typography), confidence chip, collapsible per-leg breakdown
  - ActionRow — Save (localStorage) + Share URL (clipboard)
  - SavedRoutings sidebar
  - MobileBanner — read-only mode below 768px (drag/edit deferred to v1.2)
- **State hooks** (`src/state/`):
  - `useRoutingState` — hash-based URL sync (works on any static host)
  - `useSavedRoutings` — localStorage with quota-exceeded handling
  - `useLoadedData` — parallel fetch of airports + airlines + programs
  - `useViewportWidth` — mobile-breakpoint detection
- **Design system** in DESIGN.md applied as CSS variables: IBM Plex Sans/Mono, parchment/teal/amber palette, 4-multiple spacing, hairline rules (no card mosaic)
- **Tests** (`tests/`):
  - 41 unit tests covering haversine accuracy, URL round-trip + typed errors, computeRouting end-to-end (AA + AS), airport index, polar detection
  - `tests/calibration/flyertalk-routings.test.ts.template` — Iron Rule scaffold; activate by transcribing 5 FlyerTalk threads
- **CI/CD** (`.github/workflows/`):
  - `ci.yml` — lint + typecheck + test + build + JSON schema validation on every push/PR
  - `deploy.yml` — GitHub Pages deploy on push to main with SPA 404.html fallback
- **Build script** `scripts/build-airports.ts` — fetches Our Airports CSV and filters at build time
- **ESLint engine-purity rule** — `src/lib/calc/**` cannot import React, react-dom, UI components, or state hooks (keeps engine portable to CLI / npm package / Raycast extension)
- `npm run typecheck` script added
- `tsconfig.app.json` — `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` all enabled

### Notes

- Initial bundle: **87 KB gzipped** (well under the 350 KB budget from /plan-eng-review A4)
- Hash-based URLs (`gcmp.app/#/r/v1/SFO-NRT-BKK?...`) — no SPA redirects needed
- `confidence: 'chart-verified'` on all v1 earning entries explicitly acknowledges OV2 — AA's published chart and actual posted miles regularly disagree. v1.1+ accepts community-corrected entries via PR
- "Copy as FlyerTalk post" button cut per OV7 (thesis contradiction)
- Calibration set is paper-exercise homework; tests scaffold ships, real PQM numbers come from the user transcribing FlyerTalk threads

## [0.0.0.0] - 2026-05-21

### Added

- Scaffold: Vite + React + TypeScript with strict mode (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- `DESIGN.md` with locked design system (IBM Plex Sans/Mono typography, parchment + teal palette, spacing scale, component vocabulary)
- MIT `LICENSE`
- `CLAUDE.md` with project conventions and skill routing
- `README.md` with v1 scope, NOT-in-scope, and stack
- `VERSION` and `CHANGELOG.md` for gstack ship workflow
