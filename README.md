# gcmp — RTW Route Planner

**Live at: https://ftll574.github.io/gcmp/**

Taiwan-first round-the-world award route planner. Build an itinerary, mark stopovers and surface sectors, validate it against RTW and multi-carrier mileage-redemption award rules, and share the URL.

![Status: RTW pivot](https://img.shields.io/badge/status-RTW%20pivot-blue) ![License: MIT](https://img.shields.io/badge/license-MIT-green) ![Tests: 353 passing](https://img.shields.io/badge/tests-353%20passing-green)

## What It Does

- **Plan multi-leg RTW routings** — add airports by IATA code, city name, or city code.
- **Validate mileage-redemption RTW products** — current planning candidates include EVA Star Alliance World Travel Award, Cathay Asia Miles oneworld Multi-carrier Award, Qantas oneworld Classic Flight Reward, ANA archived RTW award, and China Airlines SkyTeam partner award caveats.
- **Taiwan-first priority** — BR/EVA, CI/China Airlines, JX/STARLUX, CX/Asia Miles, JL/JAL, NH/ANA, and SQ/KrisFlyer are modeled as first-market priorities.
- **Taiwan carrier notes** — the Rules inspector explains why China Airlines cannot form a classic RTW ticket (both-ocean crossings rejected) and why STARLUX COSMILE stays on the watchlist (no own RTW award product today).
- **Track RTW-specific metadata** — stopover vs transfer, surface/open-jaw sectors, operating carrier eligibility, segment count, distance caps, same-city/same-country constraints.
- **Estimate award price** — EVA, Cathay, and Qantas Classic Flight Reward products show miles required from pricing bands where data is available.
- **Map the route** — great-circle arcs, four projections, pan/zoom, bearings, distance labels, PNG/SVG export.
- **Share URL** — routing, operating carriers, fare classes, stopover flags, and surface sectors round-trip in the URL.
- **Mileage estimate as secondary** — earning/PQM/RDM comparison remains available in a collapsed panel, but it is no longer the main product flow.

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

Open https://ftll574.github.io/gcmp/ and try:

1. Add airports such as `TPE`, `NRT`, `LAX`, `JFK`, `LHR`, `HKG`, `TPE`.
2. Set each leg's operating carrier in the RTW itinerary table.
3. Mark each arrival as `Transfer` or `Stopover`.
4. Mark surface/open-jaw sectors when no flight is taken.
5. Pick an RTW product in the right-side rule check panel.
6. Fix any failed rule findings.
7. Share the URL.

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
- `fc` — optional fare class letters for mileage estimate
- `p`, `c`, `rv`, `st` — secondary mileage estimate parameters
- `proj` — map projection

## Data Model

RTW planning data is separate from mileage earning data:

- `public/data/alliances/current.json` — airline alliance membership
- `public/data/markets/tw/current.json` — Taiwan-first product priorities
- `public/data/rtw-products/current.json` — RTW fare and award products
- `public/data/award-pricing/current.json` — award pricing bands for supported products
- `public/data/network-gaps/current.json` — carrier pairs known not flown, backing honest sector warnings
- `public/data/programs/**` — secondary mileage earning rules

Schemas live in:

- `src/lib/schemas/alliance.ts`
- `src/lib/schemas/market.ts`
- `src/lib/schemas/rtw-rule.ts`
- `src/lib/schemas/program.ts`
- `src/lib/schemas/airports.ts`
- `src/lib/schemas/network-gaps.ts`

Pure engines:

- `src/lib/rtw/validate.ts` — RTW rule validation
- `src/lib/rtw/award-pricing.ts` — award price estimation
- `src/lib/calc/**` — distance and mileage estimate engine

## Development

```bash
npm install
npm run dev
npm run typecheck
npm run test
npm run lint
npm run build
```

## Testing

Current local baseline:

- 353 Vitest tests in 23 files (incl. the Iron Rule calibration suite — 24 active structural tests)
- strict TypeScript
- ESLint engine purity rule for `src/lib/calc/**`
- production build via Vite

## Current Limits

- **Live award availability is not checked.** The app validates structural rule eligibility only; seat inventory is out of scope.
- **Pricing covers 4 of 7 catalog products** — EVA (fixed price), Cathay (distance bands, rebased to the fourth-era/current chart), Qantas Classic Flight Reward (partial: top bracket only — 19,201–35,000 mi ⇒ flat 318,000 business, chart-verified against the pre-Aug-2025 chart era; smaller brackets/economy intentionally absent pending verification), and the ANA archived award (partial: business cabin only). A fifth entry sits catalog-ready but does not change the planner count yet: the China Airlines SkyTeam partner award zone-pair chart (full 66-cell Era-2 matrix over the 11 published zones, `published-chart`, asOfEra 2025-10) plus a direction-agnostic engine accessor (`getZonePairQuote()`, `src/lib/rtw/award-pricing.ts`) — itinerary-level CI estimates wait on airport→region wiring, so CI still validates rules without a price estimate. The two cash fares are excluded by adjudication: oneworld Explorer and Star Alliance RTW Fare are paid tickets sold in money (continent-count / distance fares; miles flow earn-side only — §A8(b)); continent-count *awards* shaped like Explorer would need separately verified productIds. Research appendix §A6 (`docs/calibration-set.md`) scoped JL/NH/SQ: no compatible band-chart or RTW award product exists at JAL or Singapore, and ANA's distance-band RTW chart is discontinued for new ticketing (2025-06-23) — already modeled as archived.
- **Cathay fourth-era chart drift is resolved at cell level; two gaps stay honestly open.** The FT 2184572 Jan-2025 data point (230,000 miles @ 19,442 self-stated flown miles) that matched no frozen-era band cell is now explained: it is Zone 10 (18,001–20,000 mi) Business under the revised fourth-era grid — pinned by two independent data points (Prince of Travel 2025-07-16; Suitesmile full-grid transcription 2026-05-02) with a third browser-render cross-check (§A9). Zone edges are byte-identical to rv=2018.Q3; only prices moved. Remaining gaps: the official flights.cathaypacific.com chart page is unresolvable from this network (DNS failure), so the grid rests on community sources rather than the airline's own page; and the exact effective date inside the bracket (2023-02-26, 2025-01-25] stays unpinned.
- **Award fee schedules are display-only.** Era-pinned fees render on the validation panel (CX seed: date-change / reissue / refund, as of 2018-05), but total cost with taxes/fees is not estimated.
- **Date-based trip-duration limits ARE enforced when dates exist.** The `trip-duration` rule (`src/lib/rtw/validate.ts`) fails itineraries outside the product's min/max trip days whenever start+end dates are set, and reports severity unknown ("Trip duration cannot be checked until start and end dates are set.") without them. What stays shallow is per-segment timing: stopover duration is user-marked and there is no per-leg/per-stopover date model yet, so stopover-length rules have nothing to check.
- **Standing cuts:** MPM (maximum permitted mileage), fare-basis input, plus the full list under CLAUDE.md's "NOT in scope".
- Earning/PQM/RDM math remains as a secondary estimate and should not drive RTW validity.

## License

MIT
