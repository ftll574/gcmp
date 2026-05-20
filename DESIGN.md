# DESIGN.md

Design system source of truth for **gcmp** (Great Circle Mapper Reimagined). All UI decisions calibrate against this file. Updates land in the same commit as the code that requires them.

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

deck.gl is deferred to v1.1 (per eng review OV3). v1 ships an SVG arc renderer:

- Sea: `--bg-map-sea`
- Land: `--bg-map-land` (lighter than page bg)
- Lat/lon grid: not drawn in v1
- City/road labels: not drawn — only airports show
- Great-circle arc: 2px stroke `--accent`, sampled polyline (N=64 points) using haversine + bearing
- Airport dots: 6px filled charcoal for chain airports, hollow on hover, muted gray when not in chain
- Hover label: small text bubble with IATA + city, only when chain has ≤ 3 legs (clutter avoidance)
- Polar warning banner: appears as a top overlay when any leg crosses 70°N or 70°S (Mercator distortion is too misleading otherwise)

Projection: Web Mercator in v1. Toggle to orthographic is deferred to v1.1.

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
