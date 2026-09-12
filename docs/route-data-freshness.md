# Route data freshness audit

Checked: 2026-09-12

This document records the bounded route-network freshness audit introduced for the 60 alliance-member carriers already represented by GCMP. It does **not** establish a complete global route denominator. Global coverage therefore remains `unknown`.

## Evidence boundary

- `carrierIdentity: operating` is required before a route can count as current operating evidence.
- `provider-listed` stays `unknown` even when the provider row was checked recently. Alliance membership, a carrier-prefixed marketing flight number, historical operation, or an empty fare search never upgrades operating identity.
- Route sources carry `checkedOn` (and optionally `publishedOn`); route rows carry `effectiveFrom` / `effectiveUntil` when a bounded service window is known.
- The route schema has no per-row `reviewDue` field. The freshness report therefore computes review state from a configurable window (30 days by default) rather than inventing a review date.
- `current` = confirmed operating identity plus at least one referenced route source checked within the freshness window.
- `stale` = confirmed operating identity with no referenced route source checked within the freshness window.
- `unknown` = provider-listed / attribution-only evidence, including rows that may be codeshare or marketing-only.
- Duplicate directional rows are measurable in the merged runtime. Cross-layer conflicts are not reconstructable from the flattened runtime after merge precedence has resolved them, so that metric is explicitly `unknown-after-merge`.

## Repeatable refresh and audit

Use an explicit build date when producing reviewable artifacts:

```bash
npm run routes:build-runtime -- 2026-09-12
npm run coverage:route-freshness -- 2026-09-12 30
```

The first command rebuilds the existing runtime catalog and origin shards; it does not introduce a second route subsystem. The second command reports all 60 represented carriers, active directional routes, current/stale/unknown evidence, source age, Taiwan endpoints, bounded alliance-hub benchmarks, per-hub gaps, and priority unknown rows.

The hub benchmarks reuse airports already shipped by the landing-page alliance showcases:

- oneworld: HKG, LHR, JFK, LAX, NRT
- Star Alliance: NRT, LAX, SFO, EWR, FRA, IST, SIN
- SkyTeam: ICN, LAX, ATL, CDG, HAN

They are a bounded product benchmark, not a claim that these airports are the complete hub set for any alliance.

## 2026-09-12 audit finding

Before the evidence repair, every referenced route source in the active runtime was within 7 days of `asOf`, so the audit found **0 stale** routes. The dominant quality gap was operating identity: 12,369 active rows were still provider-listed/unknown. That distinction is why source recency alone must not be described as route completeness.

| Metric | Before | After |
| --- | ---: | ---: |
| represented carriers | 60 | 60 |
| active directional routes | 30,109 | 30,103 |
| current evidence | 17,740 | 17,740 |
| stale evidence | 0 | 0 |
| unknown evidence | 12,369 | 12,363 |
| duplicate active directional rows | 0 | 0 |
| Taiwan active directional routes | 414 | 408 |
| Taiwan current evidence | 332 | 332 |
| Taiwan unknown evidence | 82 | 76 |
| oneworld showcase-hub current / unknown | 1,731 / 950 | 1,731 / 948 |
| Star showcase-hub current / unknown | 2,462 / 1,069 | 2,462 / 1,069 |
| SkyTeam showcase-hub current / unknown | 1,838 / 869 | 1,838 / 869 |
| global coverage | unknown | unknown |

The six-route drop is intentional. Two are JAL KIX↔TPE seasonal services that do not begin until 2026-09-18. The other four are the incorrect EVA TPE↔AMS/LHR endpoint-skipping edges described below; the same-number through flights operate via Bangkok and therefore cannot be represented as one nonstop route edge.

## Evidence-backed repairs

### EVA Air BR — Europe through flights via BKK

Source: EVA Air, `2026 Euro Summer`, published 2026-07-14 and checked 2026-09-12:

`https://www.evaair.com/zh-tw/plan-and-book/special-offers/promotions/flight/26EURSUM.html`

The promotional table presents BR75/BR76 as TPE↔AMS and BR67/BR68 as TPE↔LHR origin/destination through services. That must not be interpreted as physical nonstop service. EVA's official flight-status/timetable evidence shows Bangkok (BKK) is the intermediate operating stop: BR75 and BR67 operate TPE→BKK before continuing to Europe, while the reverse services operate Europe→BKK→TPE.

GCMP's route-network edge represents one physical nonstop sector. The four endpoint-skipping TPE↔AMS/LHR edges are therefore explicitly suspended rather than published. Existing physical nonstop rows already cover TPE↔BKK and BKK↔AMS/LHR, so no duplicate route rows are added. This preserves the Bangkok sector for segment counting, distance calculation, and map geometry.

### Japan Airlines JL — KIX↔TPE seasonal window

Source: JAL, `Flights Information on the East Asia routes for Departure between March 29 and October 24, 2026`, checked 2026-09-12:

`https://www.jal.co.jp/jp/en/info/2026/inter/east-asia/`

JAL explicitly says the page lists operating flights only. JL8667 KIX→TPE and JL8668 TPE→KIX operate on Sep 18, 20-22, 24, 25, 27, 28 and Oct 9, 11, 12. The route rows now use the bounded envelope `2026-09-18` through `2026-10-12`; they are not counted active on the audit date.

## Remaining gaps

- Global directional-route completeness remains unknown because no trustworthy complete global denominator is present.
- 12,363 active directional rows remain `unknown`; they are deliberately not promoted from marketing/codeshare/provider evidence.
- Taiwan still has 76 unknown active rows. The largest suspicious examples include rows whose brand attribution could be a codeshare or provider mapping; those require operator-level proof before correction.
- Only KHH, RMQ, TPE, and TSA appear as Taiwan endpoints in the active alliance runtime. The absence of other Taiwan airports is **not** treated as a coverage failure without evidence that a represented alliance carrier operates there.
- Bounded hub unknown counts remain substantial: LAX 291, FRA 277, LHR 244, ICN 197, JFK 186, CDG 171, ATL/SFO 153 each, HKG 141, EWR 116, NRT 104, SIN 77, HAN 69, IST 63.
- Cross-layer conflicts remain `unknown-after-merge`; the runtime catalog is intentionally a merged planning artifact, not a provenance-preserving conflict ledger.
- Exact weekly/daily operation is a separate schedule concern. The route layer records existence/effective envelopes and must not be interpreted as a seat or every-day timetable guarantee.
