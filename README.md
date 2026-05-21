# gcmp — Mileage Runner Routing Calculator

**Live at: https://ftll574.github.io/gcmp/**

A reimagined Great Circle Mapper. Plan flight routings, see the great-circle distance and **PQM / RDM (Premier Qualifying Miles / Redeemable Miles)** across multiple loyalty programs side by side. Modern UI, no 1996 form submission, no FlyerTalk-thread wait.

![Status: v1.0](https://img.shields.io/badge/version-1.0.0-blue) ![License: MIT](https://img.shields.io/badge/license-MIT-green) ![Tests: 67 passing](https://img.shields.io/badge/tests-67%20passing-green)

## What it does

- **Plan multi-leg routings** — add airports by IATA code (`SFO`), city name (`Tokyo` or `東京`), or city code (`NYC`, `TYO`, `LON`).
- **Compare multiple routings on one map** — gcmap's signature, e.g. `SFO→HKG` direct vs `SFO→NRT→HKG`. Color-coded per group.
- **PQM / RDM per leg, per program** — see what AA AAdvantage gives you vs Alaska Mileage Plan for the same routing.
- **4 interactive map projections** — Mercator (default), Equirectangular (flat), Azimuthal Equidistant (the gcmap classic), Orthographic (globe).
- **Pan and zoom** the map.
- **Show bearings** — initial heading for each leg.
- **Download PNG** of the current map for FlyerTalk posts or trip notes.
- **Share URL** — every routing has a unique hash-based URL that round-trips losslessly.
- **localStorage saved routings** — your frequent trips are one click away.
- **Honest data confidence flags** — every earning rule is labeled `chart-verified` or `community-corrected`. The airline's published chart and what actually posts to your statement aren't always the same; gcmp surfaces this.
- **Beginner mode** for mileage newbies, **Pro mode** for the FlyerTalk veterans.
- **4 languages**: English, 繁體中文, 简体中文, 日本語.

## Why

`gcmap.com` is the 1996-era tool aviation enthusiasts learned with. It nails the distance + map, but:

- Doesn't compute PQM / RDM
- Doesn't compare loyalty programs
- Doesn't surface ambiguous airport codes
- UI hasn't been touched in 25 years
- No multi-language support
- No clean URL state

`gcmp` is the answer to "what would gcmap look like if it shipped today and had to compete with FlyerTalk threads?"

## Quick start

Open https://ftll574.github.io/gcmp/ and try:

1. **Click a sample card** — "舊金山 → 東京 → 曼谷" or "Compare 2 routings" — to see the tool with one click.
2. **Type SFO, NRT, BKK** in the input (or 東京 if you set 繁中). Press Enter to commit.
3. **Drag the leg chips** to reorder. Click × to remove.
4. **Switch cabin** (Y/W/J/F) to see how the PQM changes.
5. **Click "+ Add routing"** to compare a second routing on the same map.
6. **Change the projection** from the top-left toolbar — Azimuthal Equidistant centered on your first airport shows great-circle distances as straight radial lines (the gcmap signature view).
7. **Pan and zoom** with mouse drag and wheel.
8. **Download PNG** to share on FlyerTalk.

Or paste a gcmap URL or path: click "Import from gcmap" and paste e.g. `SFO-NRT,LAX-HKG`.

## URL schema

Shareable URLs use a hash so any static host works:

```
https://ftll574.github.io/gcmp/#/r/v1/SFO-NRT-BKK,JFK-LHR-CDG?op=AA,JL;BA,BA&p=AA,AS&c=J&proj=a&rv=2026.4
```

- `/r/v1/...` — schema version (`v2` can coexist later without breaking shared links)
- Path — airport chains; groups separated by `,`, legs within group by `-`
- `op` — operating carriers; groups by `;`, legs by `,`
- `p` — loyalty programs (AA, AS, ...)
- `c` — cabin (Y/W/J/F)
- `proj` — projection (m/e/a/o); omitted means Mercator
- `rv` — earning-rules version (YYYY.Q)

## Development

```bash
npm install
npm run dev           # vite dev server
npm run typecheck     # tsc -b --noEmit
npm run test          # vitest run (67 tests)
npm run lint          # eslint .
npm run build         # tsc -b && vite build
npm run build:airports # regenerate public/data/airports.json from Our Airports
```

## Stack

- **Vite + React + TypeScript** with strict mode (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- **d3-geo** + **world-atlas** for map projections and continent outlines
- **zod** for earning-rules JSON schema validation
- **SVG-native rendering** — no canvas, no WebGL, ~114 KB gzipped initial bundle
- **Vitest** for unit + component tests
- **GitHub Actions** for CI; **GitHub Pages** for hosting
- **IBM Plex Sans + IBM Plex Mono** for typography
- **Hand-rolled i18n** (no react-i18next dep)

## Engine purity rule

Files under `src/lib/calc/**` cannot import React, react-dom, or any UI library. Enforced by ESLint. The engine is pure functions only — portable to CLI, npm package, or Raycast extension later.

## Earning rules dataset

Each loyalty program lives in `public/data/programs/{carrier}/{version}.json`, validated against the zod schema at build and runtime.

Every carrier entry has a `confidence` field:
- `chart-verified` — transcribed from the airline's published partner chart. Accurate to chart, may differ from actual posted miles.
- `community-corrected` — adjusted against actual statement postings reported on FlyerTalk and similar. Most accurate.

The published chart and actual posted miles regularly disagree (a common FlyerTalk complaint). `confidence` makes this limitation honest. v1 ships only `chart-verified` entries; community-corrected entries land via PR in v1.1+.

## Contributing

PRs welcome for:
- New loyalty programs (one JSON file per program; schema in `src/lib/schemas/program.ts`)
- Community-corrected earning entries with statement-posting evidence
- Additional locales (add a new file in `src/i18n/locales/`)

CI runs lint + typecheck + tests + build + schema validation on every PR.

## Background

This project was designed via the [gstack](https://github.com/garry-clark/gstack) skills:

- `/office-hours` produced the design doc (problem statement, premise challenges, cross-model second opinion, 13 design decisions)
- `/plan-design-review` rated the design 5/10 → 9/10 and locked the visual system
- `/plan-eng-review` surfaced 11 issues + outside voice tensions (7 raised, 4 applied), planned 20 implementation tasks

The full artifact set lives at `~/.gstack/projects/GreatCircleMapper/`.

Version history (per CHANGELOG):

- **v1.0.0** (2026-05-22) — 4 locales, gcmap URL import, PNG download, per-leg bearings
- v0.4.0 — multi-group routings (gcmap signature)
- v0.3.0 — 4 projections + pan/zoom + continent outlines
- v0.2.0 — i18n foundation + Beginner mode + city codes
- v0.1.0 — engine + UI + AA + Alaska data + tests + CI/CD

## License

MIT
