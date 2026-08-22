# Changelog

All notable changes to this project will be documented in this file. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow `MAJOR.MINOR.PATCH.MICRO`.

## [Unreleased]

Product reset: per `docs/rtw-pivot-plan.md`, gcmp pivoted after v1.9 from a mileage earning calculator to a **Taiwan-first RTW award route planner** — itineraries are validated against RTW / multi-carrier mileage-redemption award rules, with PQM/RDM earning demoted to a secondary panel. Scope details: `docs/taiwan-first-scope.md`.

### Added

- **Taiwan-first RTW route planner core** — multi-leg itinerary editing (per-leg operating carrier, stopover-vs-transfer flag, surface/open-jaw sector), typed rule-validation findings, and award-price estimation from pricing bands; first-market products modeled include EVA Star Alliance World Travel Award, Cathay Asia Miles oneworld Multi-carrier Award, Qantas oneworld Classic Flight Reward, ANA archived RTW award, and China Airlines SkyTeam caveats (`b3a5a9b`)
- **Editor workbench layout** — single planning workbench replaces the v1.x calculator-first screen flow (`9e61751`)
- **Map airport route picking** — build the airport chain by picking airports directly on the map (`9cbb5e3`)

### Changed

- **RTW carrier choices filtered by product** — operating-carrier options are limited to airlines eligible under the selected award product (`14c4654`)
- **Planner focused on award redemptions** — cash RTW fares stay in reference data and are not surfaced in the planner flow (`1c054e2`)
- Fix: restored non-Mercator projections after the renderer churn (`c85b8ad`)
- Perf: reduced SVG airport-map node count for faster renders (`074c712`)
- Fix: clarified RTW workbench layout (`a5ec1bf`)

### Removed

- **Beginner/Pro mode** — the toggle is gone; the app runs as a single workbench mode (`389f8fc`)

### Reverted

- **deck.gl map spike** — briefly rendered the map with deck.gl (`53a0351`), then restored the SVG map renderer (`ee10521`). The SVG d3-geo renderer with 4 projections remains the decision; deck.gl stays out of scope.

## [1.9.0.0] - 2026-05-23

### Added — generalized elite tier + revenue-based disclaimer

Final piece of the post-v1.5 follow-up backlog. Two convergent persona asks land here:

- **Status tier selector** (universal): Priya + Frank — Award Miles bonuses scale with elite status. None / Silver / Gold / Plat-1K → +0% / +25% / +50% / +100% on RDM. Status Miles (PQM) are never bonused.
- **Revenue-based disclaimer**: Frank's UA-PQP-since-2020 callback. UA / AA / DL are flagged with an orange "estimate" chip on their program cards. The distance-multiplier numbers are kept as a cabin-bucket approximation; the chip tells users to verify against statement.

### Engine + URL

- New `EliteTier` type: `'none' | 'mid' | 'high' | 'top'` + `ELITE_TIER_BONUS` lookup table.
- `RoutingRequest.tier?: EliteTier` (optional).
- URL: `&st=n|m|h|t`. Omitted when 'none' — every v0–v1.8 URL still parses identically.
- `ProgramEarning` extended with: `rdmBase` (pre-bonus), `tierBonus` (applied multiplier), `revenueBased` (flag).
- `computeGroup` applies the bonus to `totalRdm` per program when tier > 0. PQM untouched.
- New `REVENUE_BASED_PROGRAMS` set in `src/lib/calc/index.ts` — currently UA, AA, DL. Surfaced via `revenueBased: true` on the ProgramEarning.

### UI

- New `TierSelector` segmented control next to Cabin + ProgramPicker. iOS sliding-pill style. Labels: None / Silver / Gold / Plat-1K (4 locales).
- Each program card shows a `+1,200 elite bonus (25%)` line below RDM when a non-none tier is active.
- Revenue-based programs get an orange `estimate` pill next to the confidence chip. Hover tooltip explains the limitation.
- All 4 locales updated (tier labels + revenue-based tooltip text).

### Tests

- 4 new engine tests: no-tier base case, top → +100%, mid → +25%, revenue-based flag presence.
- 5 new URL-schema tests: encode omits when none, encode/parse round-trip top, reject malformed, backwards-compat.
- **101/101 total tests pass** (was 92 → +9).

### Notes

- Bundle: ~7.35 → 7.5 KB gzip CSS · ~123 → 124.5 KB gzip JS
- Backwards-compat: every URL from v0.x–v1.8 still loads identically (no tier in URL → behaves as v1.8 did)

## [1.8.0.0] - 2026-05-23

### Added — map polish (Kenji bucket)

Tier-3 items from the v1.5 visualization-tools research land here.

#### SVG export + transparent background

- New `svgToSvgBlob()` — serializes the in-DOM SVG with computed styles baked in, ready for Affinity / Figma / Keynote. Kenji's #1 ask.
- New optional `transparent` flag on both PNG and SVG export — when true, the background rect is omitted entirely. Lets users drop the map straight onto a Twitter card / blog post backdrop.
- "Download PNG" button replaced with a **Download** dropdown menu with 4 options: PNG · PNG transparent · SVG · SVG transparent. iOS material popover.

#### Distance labels on each arc

- New `showDistances` prop on MapView — when on, draws "4,442 nm" labels at each arc midpoint in the carrier color, with text-shadow for readability over the map.
- Toggle ("Distances") sits next to the "Bearings" toggle in the map toolbar.
- Distances stack below bearings when both are on (12px offset).
- gcmap forces this into a sidebar table; gcmp now shows it on the line itself, matching how mileage-runner-FlyerTalk posts annotate routings.

#### svg-to-png.ts API

- Backwards-compat: old `svgToPngBlob(svg, pixelRatio: number)` calls still work
- New shape: `svgToPngBlob(svg, { pixelRatio?, transparent? })`
- Shared `buildSerializedSvg()` between PNG and SVG export paths

### Notes

- Bundle: 7.25 → ~7.3 KB gzip CSS · 122.34 → ~123 KB gzip JS
- 92/92 tests pass

## [1.7.0.0] - 2026-05-23

### Added — "Where to credit?" inverse view + browse-by-airline SEO pages

Two cross-persona asks from v1.5 research land here: the inverse query (Asia + redemption agents) and the browse-by-airline matrix (Asia + earning-calculator agents — wheretocredit.com's SEO moat).

#### "Where to credit?" inverse view

- App.tsx now computes a parallel `allProgramsResult` against EVERY program in PROGRAM_REGISTRY (18 today, drop-in extensible)
- EarningPanel adds a collapsible **"Where to credit? — show all 18 programs ranked"** section
- Inside: compact ranked list `#1 AA AAdvantage · 9,801 · $157 · ✓` (selected) / `#2 BA Executive Club · 9,801 · $137 · +` (clickable to add)
- Sorted by value-weighted miles (rdm × ¢/mile) when valuations loaded, raw RDM otherwise
- + button adds a program to the user's selection — gives the existing card view the full data via the normal flow
- Programs with no rules for the routing's carriers are filtered out (not shown as zero rows)

#### Browse-by-airline static pages

- New build script `scripts/build-airline-pages.ts` reads every program JSON and writes self-contained, no-JS HTML files to `public/airline/{XX}/index.html`
- 30 pages generated automatically — one for every operating carrier any program credits
- Each page shows the carrier name + every program that credits it + per-fare-class PQM/RDM % multipliers + last-verified date + source-chart link
- Index page at `/airline/` lists all 30 carriers in a grid
- Footer link "Browse by airline" added across all 4 locales
- Wired into `npm run build` so they regenerate every deploy
- Apple HIG visual language (system font, semantic dark mode, rounded cards) — matches the SPA
- SEO: each page has unique title, meta description, canonical URL, structured data
- `.gitignore` excludes `public/airline/` since it's generated

### Notes

- Bundle: 6.99 → **7.25 KB gzip CSS** (+0.26) · 121.41 → **122.34 KB gzip JS** (+0.93)
- 92/92 tests still pass
- 30 static HTML files added to `dist/airline/` at build (none in repo)

## [1.6.0.0] - 2026-05-23

### Added — 6 Asian programs + redemption-side bridge + header polish

Follow-up to v1.5 research. Asia agent flagged that 12 programs weren't enough; redemption-bridge agent flagged that earning numbers alone don't help Marcus-class users; visual feedback flagged the header wrap.

#### Phase 1 — 6 new programs (12 → 18 total)

- **JL** JAL Mileage Bank (oneworld) — JL/AA/BA/CX/QR/AY/IB/MH partners
- **CI** China Airlines Dynasty Flyer (SkyTeam) — DL/AF/KL/KE/MU/VN partners
- **MU** China Eastern Eastern Miles (SkyTeam) — DL/AF/KL/KE/CI partners
- **KE** Korean Air SkyPass (SkyTeam) — DL/AF/KL/CI/MU/VN partners
- **TG** Thai Royal Orchid Plus (Star) — UA/NH/SQ/AC/LH/BR partners
- **MH** Malaysia Enrich (oneworld) — AA/BA/CX/JL/QR/AY partners

Each ships `v2026.4.json` + `current.json` with 7–8 partner carriers and full fare-class buckets. `PROGRAM_REGISTRY` expanded; picker UI auto-groups them by alliance.

#### Phase 2 — TPG ¢/mile + cash-equivalent chip

- `data/valuations/v2026.2.json` — TPG May 2026 valuations for all 18 programs (community-estimated for BR/MH/TG/CI/MU which TPG doesn't publish)
- `src/lib/schemas/valuations.ts` — zod schema parallel to ProgramSchema
- `useLoadedData` fetches + validates the file; null on failure (chip just hides — soft-degrade)
- **Each program card now shows a `$157 ≈ 1.60¢/mi` chip** under PQM/RDM (mono, semantic-green pill). Hover for source attribution.
- **Programs now sort by `miles × ¢/mile`** when valuations are loaded — Marcus's killer insight: 8K AA at 1.6¢ ($128) often beats 12K DL at 1.2¢ ($144). When valuations missing, falls back to raw RDM (v1.5 behavior).
- **Recommendation hero card adds cash value**: *"Credit to AA AAdvantage · 1,110 more Award Miles (13% over runner-up) · ≈ $157 cash value"*

#### Phase 3 — seats.aero deeplink

- Each program card gets a **`Find award seats ↗`** outbound pill linking to `https://seats.aero/search?origin=…&destination=…&cabin=…` with the route + cabin pre-filled
- Removes the "now what?" cliff for award-redemption-curious users without us building an award search engine ourselves (redemption agent's #2)

#### Phase 4 — Header responsive

- `flex-wrap: wrap` on `.app-header` — header rows split gracefully at narrow widths
- `@media (max-width: 720px)` hides the brand tagline + lets controls take the full width on row 2

### Notes

- Bundle: 6.84 → **6.99 KB gzipped CSS** (+0.15) · 119.91 → **121.41 KB gzipped JS** (+1.5 KB)
- 92/92 tests still pass
- All 18 programs validated against zod ProgramSchema at load
- Valuations file is optional — missing file → soft degrade to v1.5 behavior

### Known follow-ups (Tier 2+ still pending)

- "Where to credit?" inverse query view — v1.7
- Browse-by-airline matrix pages — v1.7
- Map polish (distance-on-arc, SVG, transparent PNG, polar dots) — v1.8
- UA-correct PQP/PQF math — v1.9
- Status tier selector — v1.9
- Sweet-spot snippets per program — future

## [1.5.0.0] - 2026-05-23

### Added — fare class, copy-as-text, native Asian glossary

User feedback after v1.4: *"總覺得跟我們要的差很多"* — the Apple visual redesign was polish on a calculator that had the wrong primitive. Spawned 4 research agents across wheretocredit.com, gcmap.com / flightconnections, TPG redemption tools, and the Asian Chinese/Japanese mileage community. Three convergent gaps emerged; this release ships all three.

#### Phase A — per-leg fare class (engine + URL)

- `Leg` extended with optional `fareClass?: string` (single letter A-Z)
- `resolveBucket(carrier, cabin, fareClassOverride?)` uses the exact letter when set, falls back to `defaultLetterByCabin[cabin]` otherwise. Per-leg warning when an override letter doesn't exist on the carrier.
- URL schema extended: `&fc=J,C,Y;F,F` — mirrors `op` shape (semicolon per group, comma per leg). Empty cells (`fc=J,,Y`) mean "use cabin default for that leg". Skipped entirely when no leg has a fareClass — **every v0.x–v1.4 URL still parses + renders identically**.
- 11 new tests; 81/81 url-schema tests pass.

This is the wheretocredit/milelion table-stakes input the v1.4 model was missing. CX I=25% vs J=150% in the same J cabin. SQ V vs T. BA K vs N. Without the letter, partner credit was guesswork.

#### Phase B — fare-class chip on every leg

- LegChain renders a single-letter dropdown next to the carrier
- Defaults to "—" (cabin default); lights up tint-blue when overridden
- Options grouped by cabin: First (F A P R) · Business (J C D I Z) · Premium (W E T O) · Economy (Y B M H K L Q V S N G X)
- App.tsx wired with `changeFareClass(legIndex, letter | undefined)`
- 4 locales: 繁中 預訂艙等 · 简中 订位舱等 · 日本語 予約クラス

Verified: setting SFO→NRT on AA to fare class D drops AA AAdvantage from 9,801 → 7,580 Status Miles. The math reflects reality.

#### Phase C — "Copy text" plain-text forum-post exporter

- New `src/lib/forum-post.ts` — pure function `formatForumPost({ request, result, shareUrl })`
- Monospace ASCII table auto-fits column widths, includes route / cabin / rules version / per-leg fare class / per-program per-leg + totals / horizontal rule / share URL on last line
- New "Copy text" button in the header next to "Share URL"
- 11 new tests for structural invariants (no NaN, includes route, fare classes, totals, share URL)

Asian flyertea/PTT users and US FlyerTalk users both paste routings as ASCII tables, not screenshots — this is the lowest-effort highest-leverage win.

Example output (SFO-NRT-BKK, AA + Alaska):

```
gcmp · SFO → NRT → BKK · Business · Rules 2026.4

LEG       OP  FC    DIST     AA  Alaska
SFO→NRT   AA  J    4,442  6,663   5,553
NRT→BKK   JL  D    2,510  3,138   3,138
────────────────────────────────────────
TOTAL              6,953  9,801   8,691

https://gcmp.app/#/r/v1/SFO-NRT-BKK?op=AA,JL&p=AA,AS&c=J&fc=J,D
```

#### Phase D — native points-and-miles glossary (繁中/简中)

Replaced literal translations with native Asian points-and-miles terminology, per Asia research agent:

| Concept | Old | New (繁) | New (简) |
|---|---|---|---|
| Status Miles | 升等哩程 / 升级里程 | 菁英資格哩數 | 精英资格里程 |
| Redeemable Miles | 兌換哩程 / 兑换里程 | 酬賓里數 | 酬宾里数 |
| Booking Class | (lit.) 票價代碼 | 訂位艙等代碼 | 订位舱等代码 |
| Partner Airline | (lit.) | 合作夥伴航空 | 合作伙伴航空 |
| Great Circle | (absent) | 大圓航線 | 大圆航线 |
| Operating Carrier | 實際飛 | 實際執飛 | 实际执飞 |
| Routing copy | "找出每段航班…" | 搭 X 的 Y, 這條航線可以累積 | 搭 X 的 Y, 这条航线可以累积 |

Plus polished tagline ("查票計算機" → "哩程查票計算機"), footer copy, picker hints, glossary popovers across panel + glossary + projection.

### Notes

- Bundle: 6.76 → **6.84 KB gzipped CSS** (+0.08 KB) · 118.20 → **119.91 KB gzipped JS** (+1.7 KB)
- **92/92 tests pass** (was 71 in v1.4 → +21 new across phases A and C)
- Backwards-compat: every URL from v0.x–v1.4 still parses + renders identically
- Known minor polish: header overflows at narrow widths now with 4 controls (Save / Share URL / Copy text / mode); needs wrap-friendly responsive layout

### Known follow-ups (researched but not in v1.5)

- Add more programs (CI, MU, KE, TG, MH, JL) — Asia agent's #3
- ¢/mile chip + cash-equivalent total per program (TPG May 2026 valuations) — redemption-bridge agent's #1
- Outbound deeplink to seats.aero — redemption-bridge #2
- "Where to credit?" inverse view (carrier+fare → sorted programs)
- Browse-by-airline matrix pages (`/airline/JL`) — wheretocredit's SEO moat
- UA-correct PQP/PQF math (Frank's #1; data accuracy)
- Map polish: distance label on arc, SVG export, transparent PNG, polar-crossing dots (Kenji)
- Status tier selector (Silver/Gold/1K bonus)

## [1.4.0.0] - 2026-05-22

### Changed — Apple design language redesign + recommendation badge

User-driven redesign. 5 subagent personas (mileage runner, status chaser, award redeemer, aviation hobbyist, complete newbie) walked through the app and reported pain points. Three asks converged across personas:

1. **"Tell me the answer, don't just show me numbers"** (Priya, Marcus, Sarah)
2. **"I can't audit a number with no source"** (Priya, Marcus, Frank)
3. **"The page never explained what it's for"** (Sarah)

This release ships all three, plus a complete visual refresh in Apple HIG language with **full dark-mode parity**.

### Added

- **Recommendation hero**: when ≥2 programs are selected, a tint-gradient card sits at the top of the panel — `"RECOMMENDED · Credit to AA AAdvantage · 1,110 more Award Miles (13% over runner-up)"`. Programs are sorted by Award Miles descending; the winner gets a tint outline + "BEST" pill.
- **Provenance** per program card: `"Rules 2026.4 · verified 2026-05-21 · Source chart"` (link to the airline's partner chart). Backing fields (`rulesVersion`, `lastVerified`, `sourceUrl`) flow from `ProgramSchema` through `ProgramEarning` to the UI.
- **Empty-state hero**: tagline + subtagline in 4 locales answers "what is this for?" the moment a newbie lands. EN: *"Find the best frequent-flyer program for any flight."*
- **iOS toggle switch**: the bearings checkbox is now a native-feeling 32×20 pill switch with a spring-physics thumb translate, green when on.
- **Dark mode** via `prefers-color-scheme` — true black for OLED, semantic dark fills, dark map theme.

### Changed — visual system

- New design tokens (`src/index.css`):
  - Apple HIG semantic colors (`--label`, `--secondary-label`, `--tertiary-label`, `--separator`, `--system-background`, `--secondary-system-background`, `--fill` family, `--tint` = #007aff/#0a84ff, `--semantic-{green,orange,red,yellow,purple}`)
  - `--material-{thin,regular,thick}` for vibrancy / backdrop-filter glass
  - `--radius-{pill,button,input,card,sheet}`
  - `--shadow-{1,card,popover,sheet,modal}` (Sonoma-soft)
  - `--motion-{fast,base,slow}` + `--ease-{standard,spring}`
- Font stack switched from IBM Plex to system: `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", "Segoe UI", Roboto, system-ui`
- Legacy palette aliases (`--bg-page`, `--accent`, `--text-primary`, `--rule`, …) remapped to new semantic tokens so existing CSS picks up the redesign without per-selector rewrites
- **Header**: sticky vibrancy (backdrop-filter blur 20px), iOS segmented control for Beginner/Pro, pill language picker
- **Cabin selector + Projection picker**: iOS segmented controls with sliding white pill on active state
- **Buttons**: pill-shaped, semibold, system tint for primary (Save / Share); secondary-fill for chrome; press-scale 0.97
- **ProgramPicker**: material-thick glass popover with saturate(180%) blur, inset-grouped checkbox list, accent-color iOS checkboxes, spring-physics `popoverIn` animation
- **AirportAutocomplete**: search-bar feel (rounded 12px, filled secondary, tint focus ring with soft outer glow), dropdown as glass popover
- **Leg chips**: pill chips with grab cursor; ✕ remove button turns red on hover
- **Group tabs**: pill tabs that "elevate" (white bg + shadow + tint outline) when active
- **Earnings panel cards**: 14 px radius, 1 px separator border, soft `shadow-1`. Numbers in tabular SF Mono, 28 px, weight 700, -0.02em tracking
- **Confidence chips**: semantic green (community-corrected), orange (mixed), neutral (chart-verified)
- **Glossary tooltip**: dark pill with `shadow-popover`, dashed underline in tertiary-label
- **Map toolbar**: bearings switch + Download PNG pill on `material-thick` glass with `shadow-1`
- **Mobile banner** copy reframed in all 4 locales — was "Best viewed on desktop. Routing is read-only on phone" (Sarah persona reported this as 'go away'); now reads *"Mobile view — tap a sample to explore. Full editing works best on a larger screen."* Style: tint-soft chip

### Accessibility

- 3 px focus-visible ring in tint at 2 px offset
- `prefers-reduced-motion` disables animations
- ARIA roles preserved
- High-contrast in dark mode (true black + bright label)
- Native `<input type="checkbox">` semantics under the iOS-switch CSS

### Notes

- Bundle: 4.38 → **6.76 KB gzipped CSS** (+2.38 KB total — the whole redesign costs less than a single 100 KB hero image). JS 115.39 → **118.20 KB gzipped** (+2.8 KB for `BestRecommendation` + hero + provenance components)
- 71/71 tests still pass
- Backwards-compat: every URL from v0.x → v1.3 still loads identically

### Known follow-ups (surfaced by personas, out of scope for visual redesign)

- UA killed PQM in 2020; needs PQP/PQF/PQD math (Frank's #1)
- Per-leg cabin + fare-class input (Frank, Priya, Marcus)
- LATAM, JetBlue, Hawaiian, Turkish carrier coverage (Marcus)
- ProgramPicker search + pin favorites (Priya)
- Mobile edit mode (Priya, Sarah)
- SVG export + transparent-background PNG (Kenji)

## [1.3.1.0] - 2026-05-22

### Fixed — adding a single airport now shows it as a pending chip

**Long-standing bug** (since v0.4 multi-group refactor): typing an airport into the autocomplete and committing it produced no visible change when the routing was empty. Root cause was that `RoutingGroup.legs[]` is the data model and "airports" were derived from legs — but a leg requires 2+ airports, so a single airport never had a place to live and was silently dropped.

Fix:

- Per-group **pending first airport** buffered in `App.tsx` React state. When the user adds the first airport to an empty group, it shows as a single chip. When they add the second, both are promoted into the first `Leg`. Removing the only airport of a 2-airport routing demotes the survivor back to pending instead of clearing everything.
- Map of `groupIndex → Airport` is kept in sync on group removal (re-indexes later groups) and cleared on `clearAll` / `loadSaved`.
- Pending state is **not serialized to URL** — a single airport is not a shareable routing — so backwards-compat with all prior shared URLs is preserved.

Users who only ever clicked the sample-routing cards (which load 2+ airports at once) never hit this; users who tried to type airports from scratch hit it every time.

### Notes

- No new dependencies; no new public APIs
- 71/71 tests still pass (the bug lived in App.tsx event handlers; engine + url-schema unaffected)
- Bundle size unchanged

## [1.3.0.0] - 2026-05-22

### Added — global loyalty programs (12 total) + extensible picker

Per user feedback "I want all the global mileage systems included":

- **10 new loyalty programs** added on top of AA + AS:
  - **Oneworld:** BA Executive Club, Cathay Asia Miles
  - **Star Alliance:** United MileagePlus, Air Canada Aeroplan, Singapore KrisFlyer, ANA Mileage Club, EVA Infinity
  - **SkyTeam:** Delta SkyMiles, AF/KL Flying Blue
  - **No alliance:** Emirates Skywards
- Each program ships a `v2026.4.json` + `current.json` alias with 5–9 chart-verified partner carriers, accurate `pqm`/`rdm` multipliers and `minPerSegment` floors where applicable
- **Alliance-grouped popover picker** replaces the v1.2 hardcoded 2-button toggle. Trigger shows active short codes ("AA · AS  ▾"); clicking opens a dialog with checkboxes grouped by alliance. Esc / click-outside closes
- **Drop-in extensibility**: adding a new program is now (1) one entry in `PROGRAM_REGISTRY`, (2) one JSON file. No code changes. Missing JSON files are skipped with a `console.warn` rather than blocking the app
- 4 locales translated: Oneworld / Star Alliance / SkyTeam / No alliance + picker labels for en, zh-TW, zh-CN, ja

### Changed

- `ProgramId` widened from literal union (`'aa-aadvantage' | 'as-mileage-plan'`) to `string`. Runtime SoT is `PROGRAM_REGISTRY` in `src/lib/types.ts`
- `useLoadedData` now iterates `PROGRAM_REGISTRY` in parallel; programs whose JSON 404s are skipped with warning instead of crashing the loader (graceful degradation)
- URL short codes auto-derived from registry — every program code (e.g. `?p=UA,DL,BA`) parses + round-trips correctly

### Notes

- Bundle: 115.39 → **116.94 KB gzipped** (+1.5 KB for picker UI; program JSONs load on init fetch, not in JS bundle)
- 71/71 tests pass; new test covers all 10 added short codes round-tripping through the URL parser
- Backwards-compat: every URL from v0.x → v1.2 still loads identically (default `programs: ['aa-aadvantage', 'as-mileage-plan']` unchanged)

## [1.2.0.0] - 2026-05-22

### Changed — 2D wrapping world map (default Mercator, Google-Maps-style horizontal wrap)

Per user feedback "don't use the globe, use a 2D world map that loops":

- **Default projection reverted to Mercator** (was orthographic globe in v1.1)
- **Horizontal wraparound**: world outline, graticule, arcs, airports, and bearing labels render at 3 horizontal offsets (`-worldWidth, 0, +worldWidth`). Panning past one edge wraps seamlessly into the other side. Same trick that makes Google Maps feel infinite.
- **Pan normalized modulo world width** — `tx` stays bounded to `[-worldWidth × scale / 2, +worldWidth × scale / 2]` so internal state doesn't grow forever. Visual is identical because the 3 copies cover every visible pan position.
- **Wrapping** applies to Mercator + Equirectangular (cylindrical projections). Azimuthal Equidistant and Orthographic (globe) keep their existing behavior — they're radial / spherical and don't tile.
- **Antimeridian seam disappears**: a leg crossing ±180° is no longer two disjoint pieces — the +W copy of the right segment glues to the 0 copy of the left segment.

### Added

- `isWrappingProjection(p)` helper in `projections.ts`
- `normalizeTx(tx, period)` helper in `MapView.tsx`

### Notes

- Bundle: 115.26 → **115.39 KB gzipped** (essentially flat; 3-copy renders are SVG-cheap)
- Backwards-compat preserved: every URL from v0.x → v1.1 still loads identically
- The globe (`?proj=o`) is still available, just no longer default

## [1.1.0.0] - 2026-05-22

### Fixed — globe view is now a real 3D globe

The orthographic projection in v1.0 clipped the back hemisphere (correct math) but had no way to rotate, so any arc spanning more than ~90° just disappeared off the edge — exactly the "breaks" you saw in the v1.0 globe.

This release makes the globe a true rotatable 3D sphere:

- **Drag to rotate** — pointer drag rotates the projection's rotation parameter (longitude + latitude), so previously-hidden arcs come into view as you spin the globe
- **Wheel to zoom** — scrolls scale up/down the projection (not an SVG transform), so the globe stays a clean sphere at every zoom level
- **Rotation sensitivity scales with zoom** — zoomed in 4×, each pixel-drag rotates less; matches user expectation
- **Sphere shading** — soft radial gradient on the sphere disk gives it 3D depth
- **Sphere rim** — accent-colored outline marks the edge of the globe
- **Reset button** — returns to the initial center (first airport in active chain) at 1× scale

### Changed

- **Default projection is now `orthographic` (globe)** — new visitors see a 3D globe immediately. The toolbar still has all 4 projections; switching is one click.
- URL encoding **always includes `proj=` when non-Mercator**. A shared URL pins the recipient to the sender's chosen view.
- URL parsing for missing `proj=` defaults to **`mercator`** (the v1.0 historic default) for backwards compatibility — every pre-v1.1 shared URL still renders exactly as it did when created.
- **Projection picker labels are now localized** in all 4 locales (was English-only).
- Mercator antimeridian split detection now uses a viewport-aware threshold (`projection.translate() * 0.95`) instead of a hardcoded 200px — same arc renders correctly on phone and 4K monitor.

### Added

- New i18n keys: `projection.mercator/flat/azimuthal/globe` + their `*Tip` tooltip versions in all 4 locales

### Tests

- 67 → **70 passing**:
  - backwards-compat: URL with no `proj=` defaults to Mercator
  - encode omits `proj=m` (Mercator stays bare for v1.0 compat)
  - encode includes `proj=o` for orthographic

### Notes

- Bundle: 114.20 → **115.26 KB gzipped** (well under 350 budget)
- Hash-based shared URLs preserved; every pre-v1.1 URL still works
- The globe is the default; users can still pick Mercator from the toolbar (URL gets no `proj=`)

## [1.0.0.0] - 2026-05-22

### v1.0 launch — feature-complete vs gcmap.com + every pain-point fix shipped

This is the official 1.0 release. Compared to gcmap.com, **gcmp does everything gcmap did plus:**

- **PQM/RDM calculation** across loyalty programs (gcmap didn't have this)
- **Multi-program side-by-side comparison** — AA AAdvantage vs Alaska Mileage Plan on the same routing
- **Modern interactive UI** — pan/zoom/click instead of 1996 form submissions
- **Multilingual** — English, 繁體中文, 简体中文, 日本語
- **Beginner mode** with jargon glossary tooltips
- **Honest data confidence flags** — every earning rule says whether it's chart-verified or community-corrected

### Added in this release (v0.5 → v1.0)

- **2 more locales**: 简体中文 (zh-CN) + 日本語 (ja) — bringing the total to 4
- **`navigator.language` smart detection**: zh-Hans/zh-CN → 简体中文; zh-Hant/zh-TW/zh-HK → 繁體中文; ja → 日本語
- **Import from gcmap** (`ImportFromGcmap` component):
  - Paste any gcmap.com URL (`http://www.gcmap.com/mapui?P=SFO-NRT-BKK,JFK-LHR`) → auto-parse into the new structure
  - Bare paths strings work too: `SFO-NRT-BKK,JFK-LHR`
  - Defaults: business cabin, both loyalty programs, AA as operating carrier (user adjusts after import)
- **Download PNG** button on the map toolbar:
  - Captures the live SVG with all groups, arcs, airports, continent outlines, and bearings
  - Inlines computed styles so CSS variables render correctly
  - Generates filename from the routing chain (`gcmp-routing-SFO-NRT-BKK.png`)
- **Per-leg bearing labels** on the map (toggleable):
  - "Show bearings" checkbox in the map toolbar
  - Each leg shows its initial heading (0–360°) at the midpoint
  - Compensates for zoom level so labels stay readable
- **Pasted text becomes shareable URL** automatically — gcmap users can switch in one click

### Tests

- Added gcmap-compat test suite: URL recognition, single + multi-group parsing, defaults, malformed input rejection (11 new tests)
- Total: **67 tests passing** (was 56)

### Dependencies

No new runtime deps. PNG export uses canvas + XMLSerializer (browser built-ins).

### Notes

- Bundle: 108.54 → **114.20 KB gzipped** (locales + gcmap-compat + svg-to-png + bearings + import widget; still well under 350 KB budget)
- Live at https://ftll574.github.io/gcmp/

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
