# gcmp — RTW Route Planner

**Live at: https://ftll574.github.io/gcmp/**

Taiwan-first round-the-world award route planner. Build an itinerary, mark stopovers and surface sectors, validate it against RTW and multi-carrier mileage-redemption award rules, and share the URL.

![Status: RTW pivot](https://img.shields.io/badge/status-RTW%20pivot-blue) ![License: MIT](https://img.shields.io/badge/license-MIT-green) ![Tests: 309 passing](https://img.shields.io/badge/tests-309%20passing-green)

## What It Does

- **Plan multi-leg RTW routings** — add airports by IATA code, city name, or city code.
- **Validate mileage-redemption RTW products** — current planning candidates include EVA Star Alliance World Travel Award, Cathay Asia Miles oneworld Multi-carrier Award, Qantas oneworld Classic Flight Reward, ANA archived RTW award, and China Airlines SkyTeam partner award caveats.
- **Taiwan-first priority** — BR/EVA, CI/China Airlines, JX/STARLUX, CX/Asia Miles, JL/JAL, NH/ANA, and SQ/KrisFlyer are modeled as first-market priorities.
- **Taiwan carrier notes** — the Rules inspector explains why China Airlines cannot form a classic RTW ticket (both-ocean crossings rejected) and why STARLUX COSMILE stays on the watchlist (no own RTW award product today).
- **Track RTW-specific metadata** — stopover vs transfer, surface/open-jaw sectors, operating carrier eligibility, segment count, distance caps, same-city/same-country constraints.
- **Estimate award price** — EVA and Cathay RTW/multi-carrier award products show miles required from pricing bands where data is available.
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

- 309 Vitest tests (incl. the Iron Rule calibration suite)
- strict TypeScript
- ESLint engine purity rule for `src/lib/calc/**`
- production build via Vite

## Current Limits

- Award availability is not checked. The app validates structural rule eligibility only.
- Some RTW product rules still need deeper implementation, especially date-based minimum trip duration, ocean-crossing validation, per-city stopover/open-jaw checks, and award-zone pricing display.
- Stopover duration is user-marked; there is no date/time itinerary model yet.
- Earning/PQM/RDM math remains as a secondary estimate and should not drive RTW validity.

## License

MIT
