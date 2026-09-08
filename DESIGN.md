# DESIGN.md

## FlightLeg / SurfaceLeg model — 2026-09-07 override

The itinerary model is a discriminated union, not one flight-shaped object with
a surface flag bolted onto it:

- `Leg = FlightLeg | SurfaceLeg`, using the existing literal `surface: true` as
  the discriminator so normal flight literals remain backwards-compatible.
- `FlightLeg` owns operating carrier, flight number, cabin, fare class,
  departure date and manual-route provenance. A flight may omit those optional
  details while planning, but it always has an operating carrier.
- `SurfaceLeg` owns only `from`, `to`, `surface: true` and optional
  transfer/stopover metadata. It has **no** operating carrier, flight number,
  cabin, fare class, departure date or manual-flight provenance.
- Converting a flight to surface reconstructs a SurfaceLeg and deliberately
  discards all flight-only metadata. Converting back creates a fresh FlightLeg
  with a newly resolved eligible carrier; old carrier/date/cabin data is never
  resurrected from the surface sector.
- Current share URLs encode an empty `op` cell for every surface sector. The
  parser still accepts older links that stored a placeholder carrier on a
  `surf=1` cell, but normalizes that legacy carrier and any flight-only surface
  metadata away. An all-surface group may therefore legitimately contain
  `op=`.
- UI, validation, pricing, map rendering and text export must narrow the leg
  variant before reading flight-only data. Parallel carrier/cabin/date arrays
  are not a substitute for the canonical `Leg[]` model.

## Flight-number evidence hierarchy — 2026-09-07 override

Exact flight designators are first-class planning evidence, but the selector
must not turn a known number into a stronger timetable claim than its source
supports.

- **Schedule-backed designator:** an `OfficialService` or schedule-catalog row
  identifies operating carrier + ordered airport pair + exact flight number and
  also supplies an effective window / operating days. It may drive covered vs
  weekday-mismatch status for the selected date.
- **Official flight-number reference:** an airline publication identifies the
  operating carrier + ordered airport pair + exact designator, but does not
  provide enough date/weekday detail for a timetable claim. The number remains
  selectable before the user chooses a date; schedule state stays unknown until
  a dated lookup confirms it.
- References are directional and operator-specific. Never infer the reverse
  flight number, import a marketing codeshare as the operator, or derive a
  designator from route symmetry.
- Publication evidence is freshness-gated by `checkedAt` / `reviewBy`. Expired
  references disappear from discovery rather than silently becoming stale.
- The 2026-09-07 expansion raises the combined selector pool to **410 exact
  designators** across the legacy schedule catalog plus official NH/JL/AC/CX/
  SQ/LH/OZ/AY/TG/QR/QF evidence. This is a coverage snapshot, not a completeness
  claim for the global alliance network.

## Plan gate + mixed-cabin workflow — 2026-09-07 override

This section supersedes the 2026-09-05 requirement that fresh sessions open
directly into the workbench with a visible routing-wide cabin selector.

- Fresh sessions start in a **plan gate**, not on the map. The required order is
  alliance → sourced member/network context → cataloged RTW or multi-carrier
  product rules → explicit product selection → workbench.
- The alliance step shows every full member airline from the alliance catalog.
  Each member explicitly states whether this repository currently has a sourced
  RTW/ticketing-rule product for that airline. Missing product data is unknown,
  never a claim that the airline cannot issue an RTW ticket.
- Route counts and route lists come only from the current sourced route-network
  catalog. They are labeled partial; an unlisted route is never presented as
  unavailable.
- Product comparison exposes all structured rules currently represented by the
  RTW schema (segment/stopover/transfer/surface limits, trip duration,
  geography/direction/ocean rules, distance policies, pricing basis, eligible
  airlines, carrier-combination constraints) plus source links and status.
  Discontinued/archived products remain visible for comparison but cannot enter
  the active planner.
- Shared/saved routings with actual legs bypass the gate and open the workbench
  directly. The workbench shows the selected product in a compact plan bar and
  provides a deliberate “change plan” path back to the gate.
- **Cabin is per flight leg.** There is no routing-wide cabin choice before the
  workbench. Every flown leg can independently be Y/W/J/F, so mixed-cabin
  itineraries are first-class. Surface sectors do not require a cabin.
- Current share URLs always serialize the per-leg cabin shape in `cab=`, keeping
  empty cells explicit. Legacy URLs without `cab=` inherit their historical
  global `c=` value onto each flown leg so old shared links retain meaning.
- Whole-itinerary award pricing stays incomplete until every flown leg has an
  explicit cabin. Once complete, products whose chart prices the itinerary by
  cabin use the highest selected cabin, while per-leg zone quotes use each
  leg's own cabin.
- Plain-text sharing includes a per-leg `CAB` column and labels mixed itineraries
  as mixed cabin rather than repeating the legacy routing-wide cabin.

The parchment/charcoal/teal editorial visual system, terse utility voice,
hairline separators, and partial-data honesty rules remain unchanged.

### Advanced airline RTW rules — 2026-09-07

The validator must model airline-specific structure instead of flattening every
award into a generic east/west check:

- JAL oneworld Award Tickets model origin-city and origin-country return
  restrictions, Japan-origin stopover prohibition, per-city visit/stopover
  limits, surface-as-stopover counting and the two-airline minimum. The official
  distance chart is eligible for automatic mixed-cabin pricing because JAL
  explicitly prices mixed itineraries at the higher booked class.
- Thai Star RTW models country/city stopover caps, origin-country stopover ban,
  open-jaw cap and duration. Mixed direction is a **review warning** because
  "required by the Star Alliance network" cannot be proven from geometry alone.
- Asiana Star RTW uses IATA Traffic Areas rather than raw leg longitude: reverse
  travel inside one Area is legal; reversing direction between Areas is not.
  The planner rejects departures after 2026-12-16 but does not pretend to know
  arrival-time completion or carrier-specific ticketing deadlines.

When a published condition cannot be expressed without inventing missing facts,
surface it as a manual-review note rather than fabricating a pass/fail rule.

> **2026-09-05 date evidence refinement:** calendars distinguish a provider's date-specific result from an official publication-derived date. Publication days use dashed borders plus a textual legend, not color alone; missing clock times/arrival dates are printed as unknown. Each publication exposes its source, validity and review date. Existing legacy weekly references cannot assert these states. See `docs/decisions/official-timetable-dates.md`.

> **2026-09-05 date calendar addition:** source-backed monthly dates live beside route discovery and under existing-leg editing, using the same parchment/teal tokens. Every day has textual scheduled/no-matching-flight/unknown status; uncertainty is not only encoded by color. No provider connection means an explicit notice and disabled query, never demo flights. Legacy weekly badges are reference-only. See `docs/dated-flight-search-2026-09-05.md`; the new date panel was dimension-checked in isolated Edge, not the entire application accessibility surface.

## Next-leg workflow update — 2026-09-05

The explorer starts with the current itinerary endpoint and all product-eligible
operators. Airport/city/country search narrows the results; alternate origins are
secondary browsing controls. One destination contains independently selectable
operating airlines, each with its own evidence and schedule state. An uncovered
endpoint remains visible with an honest empty state. Published route evidence
never uses a seat-availability success treatment. Source details retain original
publication dates alongside inspection dates. Existing typography/palette and
hairline vocabulary remain unchanged. This replaces the schedule-only,
carrier-first discovery flow, not the rest of the workbench. Browser-level visual
and keyboard QA has not yet been performed for this update.

Design system source of truth for **gcmp** (Great Circle Mapper Reimagined). All UI decisions calibrate against this file. Updates land in the same commit as the code that requires them.

## Workflow simplification — 2026-09-07 override

This section supersedes only the expansion and workbench-layout defaults in the
2026-09-05 RTW workflow section below. Evidence semantics, route integrity,
palette, typography and the hairline visual vocabulary remain unchanged.

- The default desktop workbench has **two primary regions: route editor + map**.
  Rule results, tools and saved routes live in an on-demand inspector drawer
  rather than permanently occupying a third column.
- The primary editor order is **selected ticketing plan → route chain**. The product
  selector exposes the available RTW products directly; alliance chips are an
  optional shortcut inside secondary disclosure, not a required first step.
  Cabin remains a per-leg decision for mixed-cabin itineraries. Product limits
  stay visible as a terse one-line summary; carrier lists,
  product facts and market notes are secondary disclosure.
- Airport order is the visual priority inside the route chain. Each leg shows a
  compact operator/timing summary; **one physical leg owns one visual row, with
  the airport pair kept together on the primary line (`TPE → CNX`)**. Flight
  number, cabin and timing are secondary metadata for that same row rather than
  a control inserted between separate airport rows. Operating carrier, legacy
  booking code, transfer/stopover and surface controls expand only for the leg
  being edited.
- Trip dates + per-leg flight settings remain collapsed verification detail.
  **Next nonstop is now part of the primary route-building flow and stays
  visible once a start airport exists.** It is anchored to the actual current
  endpoint and presents one sourced physical airport pair at a time; a
  connecting journey such as SFO → BKK via NRT is represented as two explicit
  legs, SFO → NRT and then NRT → BKK. Selecting a pair promotes it out of the
  candidate list into the primary route card (`TPE → SEA`); **Choose another
  airport** is secondary. The user selects a sourced flight designator next
  (for example BR024 / BR026) **when one is known**, but a flight designator is
  never required to continue planning. Every sourced operating airline also has
  a first-class “flight number later” draft. After airline/flight selection the
  arrival is marked Transfer / Stopover / undecided, then cabin and date/time
  may be filled or deferred. A selected flight number may be stored and shared
  before a date is chosen so the later date query can validate that exact
  flight. Cabin remains a planning choice: equipment notes do not imply cabin
  availability or award inventory. There is no primary-flow carrier filter,
  alternate-origin browser, or inferred multi-hop path.
- Route-catalog incompleteness must **never block itinerary composition**. The
  next-step panel includes an explicit manual planner for an airport pair absent
  from sourced discovery. Manual FLIGHT mode requires the user to choose an
  eligible operating airline and is visibly labeled unverified; it is not route
  evidence. That provenance persists on the leg as `manual=true`, round-trips in
  share URLs via sparse `man=`, remains visible as an **Unverified route** badge,
  and emits a validator review warning after reload/share; manual input must not
  silently become sourced evidence. Manual SURFACE / open-jaw mode creates a ground sector without
  pretending a flight exists. Both modes can carry Transfer / Stopover /
  undecided metadata, and manual flights may carry a cabin choice.
- Airport changes are first-class SURFACE sectors, not fake flight coupons.
  The next-step panel proactively offers alternate physical airports in the same
  metropolitan area (for example NRT ⇢ HND, LHR ⇢ LGW, TPE ⇢ TSA). The UI and
  validator share the curated metropolitan registry; exact municipality strings
  are only a fallback because production NRT is “Narita” while HND is “Tokyo”.
  TPE/TSA use a reverse-only Taipei metro group so typing physical `TPE` still
  selects Taoyuan directly rather than becoming an ambiguous city-code search.
  Surface rows never expose their internal carrier placeholder, flight number,
  or cabin controls. The map renders surface/open-jaw sectors with their own
  orange dashed ground-transfer stroke (no flight halo and no normal flight
  distance badge), and plain-text/forum export prints `SURF` rather than leaking
  the internal carrier placeholder.
- Route building uses **guided progressive disclosure**. After the user
  explicitly chooses a starting airport or appends a leg, the completed route
  setup (airport input, routing tabs, existing leg rows and date-detail section)
  collapses into a compact `Start / route` summary such as `TPE → CNX`. The
  selected product bar remains globally visible. Focus and scroll position move
  to **Next nonstop**, so `CNX → ?` becomes the immediate action instead of
  requiring the user to hunt down the editor. The compact summary reopens the
  full route setup for edits, and an explicit "done here" action collapses it
  again. An itinerary that merely arrives through an existing share URL opens
  without this auto-collapse until the user makes a new planning choice.
- The map consumes the exact same one-hop `NextLegDestination[]` as the selector.
  While a next leg is being planned, a subdued veil de-emphasizes generic map
  detail, the user-entered current departure airport stays explicitly marked,
  and only source-backed next-stop airports are highlighted. Clicking a
  highlighted airport selects the same primary pair card used by the list,
  previews that single great-circle segment and surfaces known flight-number
  hints; the map never bypasses the flight-number-first workflow by directly
  committing an airline. Search filtering on the selector also filters the map
  guide. Unlisted airports/routes stay unknown, never inferred or presented as
  unavailable.
- Validation still runs continuously while the inspector is closed. Opening
  **Check** reveals the current verdict and findings without mutating routing
  state or introducing any new share-URL state.
- Tablet uses the same two-region model. On phone the inspector becomes a
  bottom sheet; existing phone editing limitations remain unchanged.
- Automated DOM/interaction tests protect the hierarchy and hidden controls.
  Browser-rendered visual/overflow QA is still required when a browser-control
  bridge is available and must not be inferred from jsdom alone.

## Current RTW workflow — 2026-09-05 override

This section supersedes the earning-era layout/hierarchy and desktop breakpoint sections below. The palette, typefaces, spacing and hairline vocabulary remain in force; this is not a new visual theme.

- The primary task is award itinerary planning, not PQM/RDM earning. Start with visible product/cabin settings and airport entry; offer sample routes in the empty editor. Preserve flight operators when changing the rule product.
- Planning settings and per-leg dates start expanded. Route dates come before the network explorer. Legacy booking-code controls appear only for imported legs that already carry those codes.
- The inspector distinguishes incomplete data, warnings and structural passes. Flight operations and award availability remain explicitly unconfirmed. Error findings name affected legs. Whole-itinerary estimates show their unit and applicable booking era where known.
- Explorer destinations remain based on the partial catalog, with user-selected coverage date, validity windows and sources. Geographic groups start open; missing/expired schedules require rechecking, never a fabricated "cannot fly" verdict.
- At 1280px and above, keep the three-region workbench. At 768–1279px, retain the editor on the left and place the inspector below the map on the right; hide resize handles there. Phone editing limitations remain unchanged.
- Browser-rendered spacing/overflow/keyboard checks remain pending; passing jsdom tests is not a visual sign-off.

> **2026-08-26 re-alignment:** the v1.4 Apple-HIG token layer had drifted from
> this file (system-ui fonts, iOS blue on white, pill radii, card shadows —
> several AI-slop-blacklist violations). The token layer was rewritten back to
> the editorial system below (recorded in `docs/convergence-contract.md`). This
> file remains the source of truth; drift from it is a bug.

## Aesthetic

**Aviation-cartographic, not SaaS-dashboard.** This is a precision tool for mileage runners; it should feel closer to an OFP (operational flight plan) chart than to a marketing landing page. Numbers are the hero, not illustration.

Voice in copy: utility, terse, present tense. "Add airport," not "Please add an airport." "Saved," not "Successfully saved." No marketing hero copy, no emoji, no exclamation points.

## Typography

Two faces. No system-ui fallback as primary.

| Use | Family | Weights |
|-----|--------|---------|
| Display + UI | IBM Plex Sans | 400, 500, 600 |
| Numbers (distance, PQM, RDM, fare class) | IBM Plex Mono | 400, 500 |

Both via Google Fonts CDN or self-host. Latin subset only for v1.

### Scale

| Token | Size | Use |
|-------|------|-----|
| `--type-brand` | 32px | Page brand mark |
| `--type-headline` | 28px | Panel totals (PQM, RDM) |
| `--type-body` | 16px | Body, labels |
| `--type-chip` | 14px | Leg chain chips, secondary labels |
| `--type-detail` | 12px | Per-leg breakdown, footnotes |

Body minimum is 16px (WCAG-friendly, not 14px). Mono is intentional for numbers — it makes per-leg comparison scan-able and signals precision.

## Color

Parchment, charcoal, deep teal. Never purple, never indigo, no gradients.

| Token | Hex | Use |
|-------|-----|-----|
| `--bg-page` | `#F4EFE6` | Page background (parchment) |
| `--bg-map-land` | `#FAF6EE` | Map land (lighter than page) |
| `--bg-map-sea` | `#DCE5E8` | Map sea (muted blue-gray) |
| `--text-primary` | `#1F1F1F` | Primary text (charcoal) |
| `--text-secondary` | `#6B6359` | Secondary / muted text (warm gray) |
| `--accent` | `#0D5C73` | Active states, focus ring, leg arc |
| `--accent-hover` | `#0A4858` | Hover state for accent |
| `--warning` | `#C97A3F` | Codeshare unverified, MPM warning, polar route banner |
| `--rule` | `#E5DECF` | Hairline rules (panel section dividers) |

Contrast:
- Primary on page: **14:1 (AAA)**
- Accent on page: **6.4:1 (AA)**
- Warning on page: **3.9:1** — for icon + label combos only, not body text (WCAG 2.2 Non-text Contrast)

### Dark mode ("night chart") — added 2026-08-26

First-party dark theme, switched by `prefers-color-scheme` only (no toggle).
The metaphor shifts from daylight paper chart to a night operations chart:
charcoal-slate paper, parchment-white ink, teal accent brightened to keep AA
contrast. Same hairline-only separation rules; shadows stay restricted to
detached layers.

| Token | Hex | Light counterpart |
|-------|-----|-------------------|
| `--bg-page` | `#16191D` | `#F4EFE6` |
| `--bg-map-land` | `#20252B` | `#FAF6EE` |
| `--bg-map-sea` | `#0F1317` | `#DCE5E8` |
| `--text-primary` | `#ECE7DD` | `#1F1F1F` |
| `--text-secondary` | `rgba(236,231,221,.64)` | `#6B6359` |
| `--accent` | `#5FB9CC` (~7.4:1 on page) | `#0D5C73` |
| `--accent-hover` | `#8ACBDB` | `#0A4858` |
| `--warning` | `#D98E54` | `#C97A3F` |
| `--rule` | `rgba(236,231,221,.18)` | `#E5DECF` |

Type scale is identical in both modes. The canonical five tokens
(brand 32 / headline 28 / body 16 / chip 14 / detail 12) are joined by an
explicit auxiliary ladder (`title` 22, `title-3` 20, `subheadline` 15,
`footnote` 13, `caption` 12) used by the two-panel layout; panel totals use
`--type-total` = headline size 28px in mono — numbers are the hero.

## Spacing

Multiples of 4 only.

| Token | px |
|-------|----|
| `--space-1` | 4 |
| `--space-2` | 8 |
| `--space-3` | 12 |
| `--space-4` | 16 |
| `--space-6` | 24 |
| `--space-8` | 32 |
| `--space-12` | 48 |
| `--space-16` | 64 |

## Component vocabulary

| Component | Description |
|-----------|-------------|
| **chip** | A draggable leg in the chain. Border `1px solid --rule`, radius `4px`, padding `--space-2 --space-3`. Contains IATA code (mono) + airport name (sans, secondary) + drag handle + × button. |
| **panel-section** | A grouped section inside the right panel. Separated from siblings by `1px solid --rule` hairline. No card border, no shadow. |
| **hairline** | `1px solid --rule`. Used for separation. NOT used as decoration. |
| **button** | Radius `6px`, padding `--space-2 --space-4`, font-weight 500. Primary: accent bg + page-color text. Secondary: transparent bg + accent text + accent 1px border. |
| **autocomplete-dropdown** | Max 8 rows, radius `4px`, hairline border. Each row: IATA (mono) + city + airport name + country flag emoji. |
| **leg-arc** | SVG `<path>` rendered from haversine + great-circle samples. Stroke `--accent`, 2px width. Hover: slight glow (opacity uplift on adjacent group). |
| **airport-dot** | 6px diameter. Filled `--text-primary` when in chain; hollow stroke when hovered; muted gray when off-chain. |
| **codeshare-badge** | 8px amber (`--warning`) dot adjacent to a leg row. Click/hover opens inline "Why?" explainer. |
| **polar-banner** | Top overlay on map when route crosses ±70°. Amber background, charcoal text, dismissible. |

## Layout regions

```
┌───────────────────────────────────────────────────────────────────────┐
│  brand mark                                       [Save] [Share URL]  │ ← top action bar
├───────────────────────────────────────────────────────────────────────┤
│  [autocomplete input: "Add airport (IATA code, e.g. SFO)"      ]      │
│  [chip SFO ✈] [chip NRT ✈] [chip BKK ✈]              (wrap row 2)     │
├──────────────────────────────────────────────────┬────────────────────┤
│                                                  │  cabin: Y / W / J / F │
│                                                  │  ─────────           │
│                                                  │  AA AAdvantage       │
│                                                  │    14,200 PQM (28px) │
│                              MAP                 │    14,200 RDM        │
│                       (SVG great-circle arcs)    │  ─────────           │
│                                                  │  AS Mileage Plan     │
│                                                  │    11,400 EQM (28px) │
│                                                  │    11,400 Miles      │
│                                                  │  ─────────           │
│                                                  │  Total: 13,847 nm    │
│                                                  │  Time est: 32h 15m   │
│                                                  │  ─────────           │
│                                                  │  ▸ Per-leg (collapse)│
└──────────────────────────────────────────────────┴────────────────────┘
```

Right panel fixed width ~360px. Map fills remaining width and height. PQM is the largest type on screen — Premise 1 says the calculation IS the product.

## Hierarchy in the right panel

1. **PQM (per program)** — largest type, primary
2. **RDM (per program)** — half-size, immediately below
3. **Total distance + flight time** — secondary, smaller
4. **Per-leg breakdown** — collapsible, default collapsed

Distance is secondary because gcmap already solves distance. PQM/RDM is the differentiator.

## Map style

The production map remains a lightweight SVG/d3-geo renderer. Its hierarchy is
route-first rather than airport-database-first:

- Sea / land use `--bg-map-sea` and `--bg-map-land`; coastlines stay legible
  while the 45°×30° graticule is deliberately low contrast.
- At the default world scale, global background-airport dots are hidden. They
  appear only after zooming to detail (about 1.8×), and hit-testing follows the
  same threshold so invisible airports never trigger surprise hover cards.
- The active routing group renders above every comparison group with a wide
  neutral halo plus a 3.2px colored great-circle stroke. Other groups are thin,
  dashed and low-opacity context.
- Active airports are the only persistent labels. They carry route order
  directly (`1 TPE`, `2 HKG`, or `1/6 TPE` for a repeated loop endpoint), and
  labels stagger through four quadrants to reduce dense-cluster collisions.
- During next-leg planning, the exact user-entered/current endpoint is always
  visible as a distinct `FROM TPE`-style origin marker even when it is only the
  pending first airport and no serialized leg exists yet. Source-backed next
  stops use the contrasting availability treatment; selecting one previews the
  pair and may list sourced flight designators, but flight/cabin/time choices
  are completed in the route panel.
- Non-active route labels appear only in detail mode. Background airports stay
  dots without global text labels.
- Optional distance labels apply only to the active group and use compact
  backed badges so coastlines and route strokes remain readable underneath.
- Mercator and equirectangular retain horizontal wrapping using the
  projection's true 360° period (`2π × scale`), never the viewport width.
  Render enough periodic copies for the current zoom so panning or zooming out
  cannot reveal blank strips. Their initial central meridian follows the active
  route origin, keeping transpacific itineraries visually continuous instead
  of placing the default seam through the middle of the Pacific. Azimuthal and
  orthographic views retain pan/rotate + zoom behavior.

## Motion

Default: instant. The fast feedback loop is the product (Premise 1).

| Event | Motion |
|-------|--------|
| Add leg | Instant on first draw; 200ms ease-out fade for subsequent adds/removes |
| Drag chip to reorder | Native drag, no custom motion |
| Hover airport | Opacity uplift, no transform |
| Save / share success | Button morphs to ✓ for 1.2s |

`prefers-reduced-motion: reduce` disables the 200ms animation entirely.

## Accessibility baseline (v1)

- Tab order: skip-link → autocomplete → leg chain (Tab in, arrow keys reorder, Backspace deletes focused chip) → cabin selector → save/share buttons.
- Focus ring: `2px solid --accent` with `2px` offset on all interactive elements.
- ARIA labels on leg chips: `aria-label="Leg N of M: SFO San Francisco to NRT Tokyo Narita, 5,103 nautical miles"`.
- Map fallback: `role="img" aria-label="..."` plus offscreen route description.
- Touch / hit target minimum: 24×24px (including chip × button and drag handle).
- `aria-live` regions on totals: **deferred to v1.1** (per eng review OV4 — basic ARIA labels only in v1).
- Body text minimum: 16px (set globally on `<body>`).
- All color combinations pass WCAG AA contrast; primary text passes AAA.

## Responsive (v1)

| Viewport | Behavior |
|----------|----------|
| ≥ 1024px | Full hero UI as spec'd |
| 768–1023px | Right panel becomes bottom drawer |
| < 768px | Top banner: "Best viewed on desktop. Routing read-only on phone — drag/edit in v1.2." Map + numbers render; autocomplete + edits disabled. |

Mobile drag-and-edit is explicitly v1.2.

## AI-slop blacklist (avoided)

- ❌ Purple / indigo / violet → ✓ parchment + teal
- ❌ 3-column feature grid (icon-circle + title + 2-line copy ×3) → ✓ no feature grid; data-dense right panel
- ❌ Centered everything → ✓ left-aligned, data-grid style
- ❌ Uniform large border-radius on every element → ✓ small intentional radii (4–6px)
- ❌ Decorative gradients, blobs, wavy SVG dividers → ✓ 1px hairlines only
- ❌ Emoji decoration → ✓ none (country flag emoji in autocomplete is data, not decoration)
- ❌ Generic hero copy ("Welcome to gcmp", "Unlock the power of...") → ✓ no marketing hero; app loads straight into the calculator
- ❌ `system-ui` / `-apple-system` as primary font → ✓ IBM Plex Sans / Mono explicit
- ❌ Colored left-border on cards → ✓ no cards in v1
- ❌ Cookie-cutter section rhythm (hero → 3 features → testimonials → pricing) → ✓ single screen, no sections

## Open design decisions (deferred, with override path)

- Map projection toggle (Mercator ↔ orthographic) — v1.1
- Mixed cabin per leg — v1.1
- Saved routings sync across devices — v2 if at all
- OG image preview cards — v1.1 (per office-hours D11)
- "Copy as FlyerTalk post" button — cut from v1 per eng review OV7
- aria-live on totals — v1.1 per eng review OV4
- Locale-based initial map zoom — v1.1 per eng review OV4

## Source

This file was extracted from the design doc at `~/.gstack/projects/GreatCircleMapper/zhenyu-initial-design-20260521-044157.md` after `/office-hours`, `/plan-design-review`, and `/plan-eng-review` had locked the design specifications. Update DESIGN.md whenever a design decision changes; the next code that touches the affected component must align.
