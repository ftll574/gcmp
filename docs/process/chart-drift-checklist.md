# Award-chart drift review checklist (quarterly)

Award charts are living documents: airlines revise mileage tables, retire cabins,
redesign pages, and let old URLs rot. gcmp's catalog entries carry era-pinned
numbers transcribed from specific captures, and every shared URL pins a rules
version (`rv=YYYY.Q`). This checklist is the standing workflow for re-checking
those numbers each quarter (and whenever a drift signal arrives), so the catalog
stays honest instead of quietly rotting.

Distilled from the Phase 2–9 research passes recorded in
`docs/calibration-set.md` (§A5(d), §A6, §A7, §A8, §A9). When this doc and a
research appendix disagree, the appendix wins — it carries the verbatim evidence;
this doc carries the method.

## Cadence and triggers

- **Quarterly**: at each `rv` quarter bump, re-walk every priced chart in
  `public/data/award-pricing/current.json` against its sources.
- **Event-driven**, even off-schedule:
  - a community data point that matches no known-era cell (the CX 230k@19,442 mi
    puzzle of §A5(d) → §A9 is the canonical example);
  - an airline page redesign or slug change observed during any research pass;
  - a product status change (discontinuation, suspension note — e.g. CI's MU/FM
    one-way suspension, ANA's 2025-06-23 stop-sale);
  - a CONFLICT entry left unresolved from a previous quarter.

## Two confidence vocabularies — keep them separate

There are deliberately **two ladders**, used in different places. Never mix them:

| Ladder | Values | Lives in | Meaning |
| --- | --- | --- | --- |
| Product pricing (`src/lib/schemas/award-pricing.ts`) | `official-fixed` \| `published-chart` \| `reference-recheck` | award-pricing catalog entries | How trustworthy the *price table* is as a transcription of a published chart |
| Research evidence (`docs/calibration-set.md`, fee schedules) | `chart-verified` \| `community-corrected` (+ explicit LOW grade when weaker) | calibration-set case labels, network-gap entries, fee `confidence` | How well-evidenced a *claim* is by independent sources |

Why two: merging them would ripple into UI confidence-pill class mappings and
schema enum tests, and the two answer different questions — a chart can be a
faithful transcription (`published-chart`) of a source that is itself only one
community post, while a fee schedule recovered from PTT stays honest under
`community-corrected`. The QF Classic Flight Reward entry documents exactly this
split in its notes: product-level enum has no `chart-verified` grade, so the
entry carries `reference-recheck` while the underlying calibration-set case keeps
its `chart-verified` research label.

Rules:

1. A new catalog entry picks from the product ladder only; say which era it
   transcribes (`asOfEra`) and cite capture-dated source URLs.
2. Research claims pick from the evidence ladder only; grade down (LOW) when a
   quote cannot be reconciled to a specific cell/zone.
3. Fee schedules inside the catalog intentionally use the *evidence* ladder —
   fees come from community data points, not published fee charts.
4. If a future change proposes unifying the ladders, that is a schema decision:
   it must touch the zod enums, the UI pill classes, and their tests together,
   with a decision record — never a silent merge.

## Workflow

### Step 1 — Scope the quarter

List the products to check: everything in `public/data/rtw-products/current.json`
with an award/multi-carrier kind, plus every entry in
`public/data/award-pricing/current.json`. Note each one's current era pin
(`asOfEra`, capture timestamps in `sourceUrls`, notes).

### Step 2 — Probe the official live page first

- Prefer a **real-browser render**. Plain HTTP clients are routinely bot-blocked
  (CI returned HTTP 403 to Invoke-WebRequest in §A8 while the same URL rendered
  in a browser).
- Record DNS failures as findings, not as skips: the CX official chart page being
  unreachable (DNS) on the working network is part of the current honest-gaps
  list, not a reason to invent numbers.
- Watch for cookie-consent overlays that persist across clicks and keep the DOM
  unreadable (§A8 call #8). A screenshot that fails is a negative result — log it.
- A live page that renders "Page not found" for the old slug is **negative
  evidence** that the era ended; find the new canonical path before concluding.

### Step 3 — Wayback CDX archaeology

- Query the CDX API with a **domain/path prefix, no `filter=` parameter**:
  `http://web.archive.org/cdx/search/cdx?url=<domain>/<path-prefix>*&matchType=prefix&collapse=urlkey`.
  The `filter=` parameter soft-fails — queries return empty 200s regardless of
  content (defect observed across multiple phases). If a filtered query comes
  back empty, run one no-filter control before believing "no captures exist";
  §A7's four empty-200s were all filter-defect artifacts.
- Replay captures via raw `id_` URLs
  (`https://web.archive.org/web/<TIMESTAMP>id_/<original-url>`) to get the
  original bytes without Wayback toolbar injection.
- Save every fetched artifact under a stable cache location
  (`%TEMP%\gcmp-research\` is the convention) with size-recorded filenames, so a
  later reviewer can re-verify quotes byte-for-byte.
- Respect fetch budgets; disclose overages explicitly in the ledger (§A7/§A8
  style: numbered call list, failed calls included as error-only entries).

### Step 4 — Tell content shells from real pages

Size heuristics are era-dependent. Two distinct shell signatures exist:

- **Legacy JS shell**: ~13–15 KB, title-only HTML, no tabular content. Treat as
  "page exists but content loads client-side" — the archived copy will never
  yield numbers.
- **Next.js / RSC shell**: large (a 356 KB NEXT_NOT_FOUND RSC shell was replayed
  in §A8), often carrying flightable text inside `self.__next_f.push` payloads.
  Size alone misleads here. Extract SSR text with the RSC regex
  (`self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\]` + unescape) and check
  whether numeric tables are present at all. The CI redesigned page's RSC
  payload carried full rules text but ZERO mileage numerals — that absence,
  verified, is what licenses writing "current-era numbers not archive-recoverable".

### Step 5 — Transcribe with era discipline

- Transcribe matrices verbatim into the research appendix first; only then apply
  to the catalog. Keep the upper-triangle convention for zone charts ('·' = blank
  mirror cell) and state column order.
- Pin unit annotations to the capture that shows them: the CI Era-1 page carried
  no unit annotation anywhere; thousands-scale rests on the 2019 annotation plus
  magnitude continuity. Record that reasoning instead of assuming.
- Era windows need both ends where possible: last old-era capture and earliest
  new-era evidence. When the exact switch date can't be pinned, publish the open
  bracket honestly — e.g. CX fourth era `(2023-02-26, 2025-01-25]` remains
  unclosed in §A9(d), and Apr-2025 documentation moments count as publication
  dates, not effect dates.
- Superseded eras are kept as history (Era-1 vs Era-2 semantics flips like CI's
  one-way = round-trip → half-of-round-trip), because shared URLs still resolve
  against old `rv` snapshots.

### Step 6 — Cross-check, grade, and record conflicts

- A cell is pinned when ≥2 independent data points agree (FT Jan-2025 + Prince of
  Travel Jul-2025 pinning CX Zone 10 Business = 230,000). A single-source grid is
  a transcription, marked reference-only until independently checked (§A9(b)'s
  Suitesmile rows outside Zone 10).
- Conflicts get a **CONFLICT #N** number in `docs/calibration-set.md`, both
  readings side by side, and an explicit verdict or an explicit "open". Never
  resolve silently, and never delete the losing reading. Classify the kind:
  rule disagreement vs rules-version drift (CONFLICT #2's Reddit 365,800 total
  was the post-2025-08-05 QF revision — drift, never merged).
- Open tensions stay visible with usage guards: §A9(d)'s zone-11 verbal quote
  vs zone-10 flown-distance fit is recorded AND forbidden from settling the
  open-jaw-counting question either way.

### Step 7 — Record negatives with a grade

Negative results are results. Log them so nobody re-digs the same dead end:

- empty CDX results (after the no-filter control),
- NEXT_NOT_FOUND / soft-404 archived shells,
- HTTP 403 bot-blocks and failed screenshots,
- live pages that render but publish no numeric table,
- searches that surfaced nothing (e.g. no dated mid-2024 multi-carrier increase
  thread found in §A9(d) — that absence is why the bracket stays open).

Each negative gets: what was probed, how, the artifact (or error-only note), and
an evidence grade.

### Step 8 — Apply, test, sync docs

Apply to the catalog only what the schemas accept; partial charts stay partial —
unpriced cabins/cells are omitted keys, never guessed fillers. Then:

1. Activate or extend `calib.*` Iron-Rule tests pinning the new cells/mechanisms
   (`tests/calibration/flyertalk-routings.test.ts`). Failing any active test
   blocks ship.
2. Bump/verify the `rv` quarterly snapshot mechanics (past 4 quarters bundled;
   drift banner fires on mismatch).
3. Sync `CHANGELOG.md` ([Unreleased]), README "Current Limits", and CLAUDE.md
   Testing counts. Run the gate yourself: `npm.cmd run test`,
   `npx tsc -b --noEmit`, `npx eslint .`.

## Definition of done (per chart reviewed)

- [ ] Official live page attempted via browser render; failures logged as negatives
- [ ] CDX prefix query (no `filter=`); captures replayed raw and cached
- [ ] Shell-vs-content discrimination documented (legacy vs RSC signature)
- [ ] Matrix transcribed verbatim; units pinned or their absence recorded
- [ ] Era bracket stated; open brackets flagged as open
- [ ] Confidence graded per the correct ladder; no vocabulary mixing
- [ ] ≥2 independent sources per applied cell, or single-source marked reference-only
- [ ] Conflicts numbered with both readings preserved; open tensions carry usage guards
- [ ] Negatives logged with grades
- [ ] calib.* tests activated/pinned; full gate green
- [ ] CHANGELOG / README Current Limits / CLAUDE.md numbers synced

## Flight-schedule refresh (Phase-11 addition)

The schedule catalog (`public/data/schedules/current.json`) joins this
quarterly cadence alongside the pricing charts:

- [ ] JX: re-run `node scripts/harvest-jx-schedules.mjs --merge public/data/schedules/current.json`
      (resume-from-valid-cache means only drifted pairs hit the wire; the API
      throttles with HTTP-200 body `{"success":false,"code":"99210"}` after
      ~100 fast calls — the harvester backs off adaptively). Superseded rows
      are expected; the merge refuses zero-entry runs.
- [ ] BR: sweep aeroroutes sitemap for new NS/W-season EVA filings; day grids
      transcribed verbatim, confidence `chart-verified`.
- [ ] CI: check Wayback for a captured edition newer than Issue 2
      (timetable-20260101-20260328 exists but was NEVER captured; live page is
      a 403 bot-wall). Until one surfaces, the 2025-Q1 window rows stay
      self-silencing — do not refresh their windows without a real source.
- [ ] Same-pair flight-group rows collapse into ONE entry (uniqueness key
      carrier|pair|seasonStart|seasonEnd); sequential windows either map onto
      MM-DD season fields or fold into notes. Nulls never replace absent
      optional fields (zod treats them as present-and-invalid).
- [ ] Catalog count + composition asserted in
      tests/lib/schemas/flight-schedules.test.ts; full gate green.
