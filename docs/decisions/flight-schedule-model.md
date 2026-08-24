# Decision: flight-schedule model & calendar (Phase 10)

Status: accepted (captain) · Date: 2026-08-24 · Supersedes: nothing · Related: `docs/process/chart-drift-checklist.md`, network-gaps precedent (`src/lib/schemas/network-gaps.ts`)

## Problem

gcmp validates route structure but has no concept of *when* flights operate.
The user-facing requirement: a flight that only operates Mon/Wed/Fri must never
offer Tue/Thu/Sat/Sun as pickable dates. Today `Leg` has no date field, no
schedule data exists anywhere in `public/data/**`, and trip start/end dates feed
only the `trip-duration` rule.

## Rulings

### S1 — Per-leg date model lands first

`Leg` gains `readonly departsOn?: string` (ISO `YYYY-MM-DD`). Absent = undated
(current behaviour unchanged). The URL schema grows a `d=` parameter mirroring
`op`'s shape: groups joined by `;`, legs joined by `,`; an empty segment means
"this leg is undated". When `d=` is present its segment count MUST equal the
flattened leg count (typed parse error otherwise); when absent, every leg is
undated. Partial dating inside a present `d=` is allowed (`d=2026-09-01,,`).

### S2 — Chronology is objective: engine FAIL

New pure rule `leg-chronology`: for consecutive legs where both `departsOn`
values exist, `legs[n+1].departsOn >= legs[n].departsOn` else a `fail` finding.
Pairs involving undated legs are skipped (same partial-information pattern as
`trip-duration`'s `unknown`). String comparison is sufficient — ISO dates sort
lexicographically. Runs product-independent.

Cross-check with trip dates: when trip `startDate`/`endDate` AND leg dates all
exist and disagree at the boundaries (first leg vs start, last leg vs end),
emit a `warning` (`trip-dates-mismatch`). Never silently reconcile them.

### S3 — Schedule data: curated catalog, evidence-graded

Single `public/data/schedules/current.json` (network-gaps precedent, not
per-carrier trees). Entries:

```
{ carrier, pair: [from, to] /* ORDERED — schedules are directional */,
  daysOfWeek /* ISO numbers, Monday=1 … Sunday=7, non-empty subset */,
  flightNumbers?, seasonStart?, seasonEnd?      /* MM-DD */
  effectiveFrom?, effectiveUntil?,              /* YYYY-MM-DD, until nullable */
  status: 'operating' | 'seasonal' | 'suspended',
  confidence: 'chart-verified' | 'community-corrected',
  sourceUrls min(1), notes? }
```

Catalog-level superRefine: duplicate `carrier|from|to|season-window` rejected;
`daysOfWeek ⊆ {1..7}` non-empty; `effectiveFrom ≤ effectiveUntil`.
Parser seam `parseScheduleCatalog()` styled after `parseNetworkGapCatalog()`.

Amendments (implementation, Phase 10):
- `notes` accepts a bare string and is normalized to a single-element array
  (`z.union([z.array(z.string()), z.string().transform(s => [s])]).optional()`)
  so §A10 appendix copies stay byte-verbatim into
  `public/data/schedules/current.json`; post-transform type remains `string[]`.
- Seed EXCLUDES the CX HKG→LHR April-2026 seasonal-extras row from §A10: it pins
  only EXTRA flights ({2,3,4,5,6}) over an UNPINNED near-daily base. Treating
  extras days as THE operating days would hard-disable Mon/Sun dates in the UI
  and warn on base-service legs — false certainty (S4's 寧缺毋濫). Final seed:
  10 entries (CI×6, BR×2, JX×2).

Coverage will be PARTIAL by design — free complete schedule data does not exist
(OAG is paid; OpenFlights routes carry no weekdays). Unverified pairs are
omitted, never guessed; negatives land in the research appendix.

### S4 — Engine warns; the calendar prevents

For each *flight* leg (surface skipped), look up `carrier + ordered pair`:

- Found, `departsOn` set, weekday ∉ `daysOfWeek` ⇒ `warning`
  (`schedule-day-mismatch`) naming the operating days. Never a `fail`: a
  schedule conflict makes a trip *unbookable*, not *illegal* (network-gaps
  rationale), and timetables drift.
- Found, leg undated ⇒ silence (no nagging).
- Suspended/expired-window entries ⇒ no day-level finding (network-gaps owns
  "route gone" semantics).
- No catalog ⇒ no findings (inputs stay optional, degrade-to-null in the
  loader like `networkGaps`).

The hard guarantee the user asked for lives in the UI: when the selected leg's
carrier+pair HAS a catalog entry, the date picker disables non-operating days
outright. With partial data, disabling days for *unverified* pairs would dress
ignorance up as fact — those pairs keep a free date input plus a
「班表未知」badge instead.

### S5 — UI: custom calendar popover for scheduled pairs

Native `<input type=date>` cannot disable individual days, so legs whose
carrier+pair resolve to a schedule entry get a custom month-grid popover
(Mon-first columns, disabled cells for non-operating days, keyboard-reachable,
DESIGN.md tokens, localized weekday headers 一二三四五六日). All other legs keep
the plain date input. Scheduled legs also show a persistent
「一・三・五」-style frequency chip even before any date is picked. Quick-fix
affordance: a conflicting hand-typed/URL-imported date offers
「跳到下一個可用日」.

### S6 — Loader & wiring ownership

`schedules` joins the loaded-data Promise.all via `fetchJsonOptional` +
schema-parse + console.warn degrade-to-null (identical shape to `networkGaps`).
Captain owns UI components/loader wiring/i18n/locale files; engineer owns
`src/lib/**`, schemas, engine tests, and the seed catalog application;
researcher owns the calibration-set appendix (append-only) and source
transcription; nobody commits but the captain.

## Consequences

- Iron Rule count may grow only if research surfaces a real community DP that
  pins specific operating days; otherwise structural tests cover the mechanism.
- README "Current Limits" must flip the "no per-leg/per-stopover date model"
  bullet to describe the new model and the honest coverage list of the seed
  catalog.
- Future: arrival times / minimum-connect validation need a duration source —
  out of scope here; `departsOn` ordering is the contract this phase commits to.
