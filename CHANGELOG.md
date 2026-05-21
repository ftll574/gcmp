# Changelog

All notable changes to this project will be documented in this file. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow `MAJOR.MINOR.PATCH.MICRO`.

## [0.4.0.0] - 2026-05-22

### Added — multi-group routings (the gcmap signature feature)

- **`RoutingGroup`** type — a routing is now an array of groups, each with its own `legs[]`. gcmap users can compare multiple routings on one map.
- **URL schema extended** for multi-group:
  - Path: `/r/v1/SFO-NRT,JFK-LHR` (groups separated by `,`)
  - `op` query: `op=AA,JL;BA,BA` (groups by `;`, legs by `,`)
  - Single-group URLs from v0.1–v0.3 still parse identically (1-element groups array)
- **`GroupTabs` component** — tab strip showing all routings; click to edit, × to remove, "+ Add routing" to append
- **Color-coded arcs on the map** — each group gets a different color from the rotation (teal, amber, moss, plum, bronze, steel blue); the active group is rendered at full opacity, others at 70%
- **Per-group breakdown in earning panel** when 2+ groups:
  - Grand totals (sum across groups) shown as the primary number
  - Small "per-routing" table below shows each group's PQM/RDM contribution
  - Per-leg breakdown is now per-group (each group has its own table)
- **New sample routing:** "Compare 2 routings" — `SFO → HKG` direct vs `SFO → NRT → HKG` via Tokyo
- **i18n strings for groups** — "Routing 1", "Add routing", "Across all routings", "Compare hint"

### Changed

- `RoutingRequest.legs` → `RoutingRequest.groups[].legs` (breaking shape change; backwards-compatible URL parsing)
- `RoutingResult.byLeg` → `RoutingResult.groups[].byLeg` with `grandTotals` rollup
- Engine refactored to compute per-group, then sum
- `MapErrorBoundary` takes `groups` instead of `airports + legs`
- `MapView` takes `airportLookup + groups + activeIndex` instead of single chain
- `EarningPanel` shows grand totals first, per-group table when multi-group

### Tests

- 4 new multi-group tests (URL round-trip, 3-group parse, mismatched group count, projection in multi-group)
- 3 new computeRouting multi-group tests (grand totals sum, direct vs connection comparison, per-group warning scoping)
- 51 → 56 tests passing

### Notes

- Bundle: 106.93 → 108.54 KB gzipped (multi-group adds ~1.6KB; under 350 budget)
- Hash-based URLs preserved — every v0.3 URL works in v0.4 unchanged
- New `src/lib/group-colors.ts` module breaks circular Fast-Refresh issue (was inside `GroupTabs.tsx`)

## [0.3.0.0] - 2026-05-22

### Added — interactive map + projections + continent outlines

- **4 map projections** via `d3-geo`, switchable in-place:
  - **Mercator** (default) — familiar
  - **Equirectangular** — flat 2:1 ratio
  - **Azimuthal Equidistant** — gcmap's signature; great-circle distances FROM CENTER appear as straight radial lines
  - **Orthographic** — globe view, only the visible hemisphere drawn
  - Azimuthal + Orthographic auto-center on the first airport in the chain
- **Pan and zoom on the map:**
  - Drag with mouse / touch to pan
  - Mouse wheel to zoom (zooms toward the cursor — keeps the point under the pointer fixed)
  - `Reset` button appears top-right when the view is panned/zoomed
  - Airport dot + label size compensate for zoom level (don't get huge when zoomed in)
- **Continent outlines** rendered from `world-atlas` 110m TopoJSON (~25 KB gzipped)
  - Land in cream parchment, sea in muted blue-gray (per DESIGN.md)
  - Graticule (lat/lon grid every 30°) drawn over the land
- **`ProjectionPicker`** — floating control top-left of the map
- **URL schema extended** with optional `?proj=<short>` param:
  - `m` = mercator (default — omitted from URL)
  - `e` = equirectangular
  - `a` = azimuthal-equidistant
  - `o` = orthographic
  - Shared URLs preserve the user's projection choice
- **`useWorldMap()`** hook backed by `useSyncExternalStore` — fetches world outline once per session, caches in module scope

### Changed

- `MapView` rewritten around `d3-geo` projection abstraction. Old hand-rolled Mercator math kept in `svg-arc.ts` for tests and backwards compat.
- Pan/zoom resets on projection change via React `key` (component remounts) — clean state, no setState-in-effect.

### Dependencies

- `d3-geo`, `d3-geo-projection`, `topojson-client`, `world-atlas` (runtime)
- `@types/d3-geo`, `@types/topojson-client` (dev)

### Tests

- Added 6 projection URL tests — round-trip for `a/e/o/m`, encode omits `m`, parse rejects unknown short code
- 51 tests passing (was 45)

### Notes

- Bundle: 95.52 KB gzipped → **106.93 KB gzipped** (d3-geo + topojson cost ~11 KB; under 350 KB budget)
- World atlas JSON loaded separately as `/data/world-countries-110m.json` (~25 KB gzipped), not bundled
- Next: v0.4.0 multi-group routings (gcmap-style `?P=SFO-NRT,JFK-LHR`)

## [0.2.0.0] - 2026-05-22

### Added — newbie-friendly + multilingual

- **i18n foundation** (`src/i18n/`):
  - Hand-rolled `t(key, params)` translator with dotted-key paths and `{name}` interpolation
  - `useLocale()` hook backed by `useSyncExternalStore`
  - Locale detection order: `?lang=` URL → localStorage → navigator.language → English fallback
  - Sets `<html lang>` on switch
  - Locales: English (en) + 繁體中文 (zh-TW) — every UI string translated
- **LanguagePicker** in the header (top-right)
- **Beginner / Pro mode toggle**:
  - Beginner: jargon glossary tooltips, sample-routing cards, plain-language earning summary, expanded placeholders
  - Pro: compact data-dense UI from v0.1
  - Choice persists in localStorage
- **Glossary tooltips** (`Glossary.tsx`) on PQM / RDM / cabin / credit / operating carrier (definitions in locale JSON)
- **Sample routings carousel** (`SampleRoutings.tsx`) — 4 preset routings (Trans-Pacific, Trans-Atlantic, US-Japan, Asia loop). Click → fills the routing immediately. Shown in Beginner mode when chain is empty.
- **City pseudo-code support** (`src/lib/city-codes.ts`):
  - NYC → JFK/LGA/EWR, TYO → HND/NRT, LON → LHR/LGW/STN/LCY/LTN/SEN, PAR/WAS/CHI/MOW/BJS/SHA/SEL/OSA/YTO/YMQ/MIL/STO/SAO/BUE/RIO
  - Autocomplete shows "{code} is a city — pick the airport you want" hint
  - Enter does NOT auto-commit ambiguous city codes
- **Localized airport search** (`src/i18n/localized-cities.ts`):
  - ~80 major hubs aliased in zh-TW
  - Type 東京 → finds HND + NRT; 倫敦 → LHR + LGW + STN; etc.
- **Plain-language summary** in Beginner mode panel: "在 American Airlines 飛 商務艙，你能賺：" above each program's PQM/RDM
- **"Clear" button** to reset the leg chain quickly

### Changed

- `EarningPanel` shows "Status Miles" / "Award Miles" full names in Beginner mode (with Glossary tooltips); reverts to "PQM" / "RDM" mono shorthand in Pro mode
- `CabinSelector` hides labels in Pro mode (letter-only) for compactness
- `AirportAutocomplete` now accepts a `mode` prop; Beginner placeholder mentions IATA + city + city codes; Pro placeholder is IATA-only
- `airport-index.search()` now returns `SearchResult[]` (was `Airport[]`) with a `match` field — 7 match-type tiers (exact-iata, localized, city-code, iata-prefix, icao-prefix, city-prefix, name-substring)

### Tests

- Added: airport-index covers city-code resolution, localized-alias matching, locale-aware fallback (no zh-TW alias matches when locale unset)
- 45 tests passing (was 41)

### Notes

- Bundle: 95.52 KB gzipped initial JS (well under 350 KB budget; was 87 KB in v0.1)
- All v0.1 features remain — pro mode is a strict superset
- Next: v0.3.0 interactive map + multi-group routings + projections + continent outlines

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
