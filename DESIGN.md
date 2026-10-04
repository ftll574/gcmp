# GCMP visual system — Flight atlas, revision 2026-10-04

This replaces the previous parchment/charcoal/teal editorial treatment. Product behavior, evidence semantics, route data and share URLs remain authoritative in code and `PRODUCT.md`.

## Direction contract

GCMP turns source-backed airport-pair evidence into an editable, rules-aware around-the-world itinerary. Travelers compare award products, construct a physical airport sequence, inspect its path and rule findings, then share it. The screen must feel like a clear working route planner within seconds; its visual world adds character through typography, palette, density and one signature move without changing web navigation or control conventions.

### Grounded directions considered

1. Aeronautical enroute charts: their symbols and directional traces make airport pairs readable at a glance; this is the most obvious fit and remains the close alternative.
2. Portolan charts and maritime pilot books: route geometry and coastlines carry a long-distance journey across separate regions.
3. Public transport network diagrams: transfer order and branching are legible without implying that every possible connection is known.
4. Printed airline timetables: disciplined columns support dense evidence and clear source distinctions.
5. Airport wayfinding systems: consistent codes, gates and directional arrows reduce navigation effort.
6. **The route atlas plate**: layered geographic reference maps combine readable coastlines, sparse graticules, indexed nodes and measured, directional arcs. This is the assigned direction and the working choice: the route itself becomes the main visual signature, with sequence labels and evidence marks kept on the plotted path.
7. Passport and luggage ephemera: recognizable travel material can humanize the experience, but it is too ornamental to govern a planning tool.

The top-ranked direction is familiar route-chart mapping; the assigned atlas plate keeps geographic structure while leaving layout and controls to standard web patterns. The concept seed produced assignment 6, but its catalog service was degraded on retry, so this direction uses the grounded list only and no challenger board or quality-bar comparison.

## World

A field atlas printed for a real working journey: mineral blue-green sea, warm off-white chart stock, dark ink, and a restrained rust mark for the active point or exception. Coastlines and graticules come from the actual map renderer; do not add fake terrain, traffic, schedules, availability, scale or completeness claims. Use IBM Plex Sans for interface copy and IBM Plex Mono only for airport codes, distances, dates and flight designators. Distinct spaces are made with alignment, rules and tint; no repeated card stack, glass, gradients, ornamental paper noise or aviation-cockpit costume.

## Signature move

A plotted route is a sequence of indexed airport nodes joined by directional great-circle arcs. The active leg receives a clear origin/destination treatment; other routes stay quiet. In the route library, an airport profile highlights every loaded outbound edge in the same treatment used by its result list. Source confidence is stated in words beside the relevant route or flight number. A route-only observation never looks like an available schedule or award seat.

## Shell and surfaces

### Shared navigation

A dark ocean-ink header holds the compact `gcmp` wordmark, the existing Home / Planner / Route library navigation and language picker. On small screens, navigation spans a second, full-width row. Selected navigation is a warm chart-stock tab with a clear current-page state. Keep skip navigation and keyboard focus visible.

### Home

The first viewport pairs the existing Traditional Chinese product promise and two real actions with the working globe route showcase. Real catalog route counts stay tied to their existing labels. The map remains the visual lead; no fabricated coverage, seats or schedules. Subsequent sections explain the actual planner, route library and evidence boundaries in a compact reading order.

### Planner gate

The heading and its explanatory copy establish the task. The alliance choices begin the left-hand decision rail; selecting one reveals the partial network evidence and qualifying members. Ticketing products occupy the adjacent, wider work area and expose their rules and sources in place. A fixed chart-stock footer keeps the selected plan and Continue action visible. On mobile the sections stack and the footer remains reachable without covering content.

### Planning workspace

Keep the existing two-region route editor and geographic map. The plan bar, endpoint-driven next-leg choice, airport pair, carrier/flight evidence, leg cabin, dates and route findings retain their current hierarchy and behavior. Results and tools remain in the existing inspector. Route order and codes are the first read; optional flight numbers, dates and source details remain secondary. The map remains usable and legible rather than becoming a background illustration.

### Route library and details

Keep the existing search, alliance filters, map, and airport / airline / route detail actions. Place search and filters before the map; keep geographic context dominant and selected profile information legible alongside or below it. Preserve partial-load notices and explicitly say when a list is scoped to an airport, airline or route. Search, map selection and the result detail continue to point to the same entity.

### Data and evidence

Do not show a public development-progress dashboard, global route-completion counters, or research backlog. Show provenance and limitations next to a route only when they help a traveler evaluate that route; distinguish current route evidence from dated schedules, actual operation, bookability, and award eligibility. Keep build metadata and detailed research status in repository artifacts, not site navigation.

## Color and type tokens

- Shell: ocean ink `#17343d`; pale chart type `#f5f3e9`.
- Page stock: `#f3f1e8`; raised work area: `#fbfaf5`; quiet inset: `#e8ece6`.
- Sea: `#dce9e7`; land: `#f2efdf`; coast `#254c53`; graticule is low contrast and subordinate.
- Route/selection: deep chart blue `#176478`; active origin and notable exceptions: rust `#a6532c`; semantic green, amber and red remain reserved for their existing meaning and are also labeled in text.
- IBM Plex Sans is the interface face. IBM Plex Mono is for measurements and identifiers, never body copy.
- Hairline rules support dense information; radii 5–10px belong to controls and detached surfaces. Shadows appear only under a floating inspector or menu.

## Interaction and states

- Preserve every existing routing, query, selection, save, import, share and URL behavior.
- Retain loading, empty, error, unavailable, partial-data and disabled states; explain recovery when possible.
- Source evidence and schedule evidence remain distinct. Published routes do not imply dates, frequencies or seats. Missing rules are unknown, not a negative verdict.
- Use direct button, link, select and input semantics, a persistent visible focus ring, responsive keyboard order, reduced motion, and readable color contrast.
- Match layout and map height to viewport: desktop paired work areas, tablet stacked regions, and mobile readable editor/map sections with touch-sized actions.

## Implementation boundary

This design belongs to the UI only. Do not alter route catalogs, evidence, carrier admission, itinerary rules or schedules as part of this redesign. Keep localization in Traditional Chinese and English and preserve legacy URL compatibility.
