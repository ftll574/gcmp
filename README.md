# gcmp — Mileage Runner Routing Calculator

A reimagined Great Circle Mapper for mileage runners. Drag airports onto an interactive map; see distance and **PQM/RDM (Premier Qualifying Miles / Redeemable Miles)** for multiple loyalty programs side by side. Replaces the FlyerTalk-thread habit of "anyone know how SFO-NRT-BKK on AA J earns?"

**Status:** Pre-v1 scaffold. Engine + UI under construction. See [DESIGN.md](DESIGN.md) for the locked design system and `~/.gstack/projects/GreatCircleMapper/` for the full design doc, eng review, and design review.

## v1 scope

- Multi-leg routing (A→B→C→D) with drag-to-reorder
- Distance calculation (great-circle, summed across legs)
- **PQM/RDM** computed per leg for **AA AAdvantage** and **Alaska Mileage Plan**, displayed side by side
- One cabin selector (Y / W / J / F) globally
- Shareable URL: `/r/v1/SFO-NRT-BKK?p=AA,AS&c=J&rv=2026.2`
- Saved routings via `localStorage`
- Open source, MIT licensed, single-page static site on Cloudflare Pages

## NOT in v1

- Fare basis string input (`QLX0ZNB1` → cabin + earning) — v1.1
- Map projection toggle (Mercator ↔ orthographic) — v1.1
- Mixed cabin per leg — v1.1
- OG image preview cards — v1.1
- Codeshare auto-resolution from marketing carrier — v1.1
- MPM (Maximum Permitted Mileage) auto-resolution — v2
- More than 2 loyalty programs — v1.1 via community PR
- Mobile drag-and-edit — v1.2 (v1 shows a read-only banner below 768px)
- Auth / accounts — never unless project earns it

## Development

```bash
npm install
npm run dev           # vite dev server
npm run typecheck     # tsc -b --noEmit
npm run build         # tsc -b && vite build
npm run lint          # eslint .
```

## Stack

- **Vite + React + TypeScript** with `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- **SVG arc renderer** for the map (deck.gl deferred to v1.1)
- **Our Airports** dataset, filtered to `iata_code IS NOT NULL AND type IN ('large_airport', 'medium_airport')`
- **zod** for earning-rules JSON schema validation
- **Vitest + Testing Library + Playwright** for tests
- **Cloudflare Pages** for hosting
- **IBM Plex Sans + IBM Plex Mono** for typography

## Earning rules dataset

Each loyalty program lives in `data/programs/{carrier}/{version}.json` and is validated against the zod schema at build and runtime. Every rule entry carries a `confidence` field: `chart-verified` (transcribed from the airline's published partner chart) vs. `community-corrected` (verified against actual statement postings via FlyerTalk reports).

The published chart and actual statement postings frequently disagree. `confidence` makes the limitation honest. Contributing corrections via PR is the v1.1+ path; v1 ships `chart-verified` entries only.

## Contributing

PRs welcome for new loyalty programs once v1 ships. Each program is one JSON file. The schema lives at `src/lib/schemas/program.ts` and CI fails on schema violations.

## Background

This project was designed via the gstack `/office-hours`, `/plan-design-review`, and `/plan-eng-review` skills. The design doc captures the problem statement, premise challenges, cross-model adversarial review, and 13 locked design decisions. See `~/.gstack/projects/GreatCircleMapper/` for the full artifact set.

## License

MIT
