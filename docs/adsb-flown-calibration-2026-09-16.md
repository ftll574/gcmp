# ADS-B flown-observation calibration — 2026-09-16

## Context and research conclusion

User asked (2026-09-16) whether the open-source `gods-eye-view` project
(Live Flights sourced from OpenSky + adsb.lol) could be used to collect all
three alliances' routes and flight numbers as a basic data layer, then
auto-refreshed.

Research verdict — that path is not viable as proposed:

1. **OpenSky license**: `states/all` is non-commercial research/education;
   operational/automated REST use requires a prior written agreement even for
   non-profits (`docs/flight-data-source-strategy-2026-09-11.md` layer 4
   placement; gods-eye-view's own `DATA_SOURCES.md` documents the same).
2. **Quota**: one global `states/all` call costs 4 credits; anonymous is 400
   credits/day (~100 global calls), standard auth 4,000 (~1,000 calls). A
   long-running live app exhausts the daily budget in hours and hard-dies on
   429 (this is why gods-eye-view added a credit governor).
3. **No route semantics**: the 18-field state vector has no origin/destination
   airport; `origin_country` is inferred from the ICAO24 address prefix, not
   the departure airport. Routes are recovered only by looking up the callsign
   in a third-party flight-plan table (adsbdb), which is a static plan, not
   flown evidence.
4. **Project contract**: "collect all three alliances' routes/flight numbers
   as basic data" is a schedule-catalog expansion — a FROZEN backlog item under
   `docs/convergence-contract.md`, and `docs/flight-data-source-strategy-2026-09-11.md`
   explicitly places ADS-B as layer 4 (operational cross-check), never as the
   sole future-timetable source.

## What was actually done (bounded POC)

The viable path is the one the 09-11 strategy already authorizes: use ADS-B as
a **post-departure flown-observation layer** to corroborate routes that already
have independent operating-carrier evidence — never to invent schedules.

1. **Promotion gate** — `scripts/build-flight-number-layer.ts`
   `enrichAdsbIqDirectRoutes` now promotes pure ADS-B direct-route observations
   to **confirmed** route-level flight numbers (in addition to the existing
   candidate layer) only when all of:
   - carrier is BR (EVA) with a TPE endpoint (Taiwan-first bounded scope);
   - the route already carries independent operating-carrier evidence
     (`carrierIdentity !== 'provider-listed'`), matching the standing-row gate
     at `parseStandingRows`;
   - the snapshot parser already requires the designator on ≥2 distinct UTC
     dates (`parseAdsbIqDirectRouteSnapshot`).
   The decision is extracted as exported pure function
   `canPromoteFlownObservation(carrier, from, to, route)` for testability.

2. **Registry** — `public/data/route-network/adsb-flown-confirmed-br-20260916.json`
   records the BR TPE operator-evidence baseline (BR16 from
   `docs/tdx-bounded-operator-acceptance-2026-09-06.md`), the current ADS-B
   observation sources, and the official-schedules BR baseline.

3. **Drift report** — `scripts/report-schedule-vs-operated.ts` +
   `public/data/route-network/schedule-vs-operated-report-20260916.json`
   (P2 operational validation). Compares scheduled departure/arrival clocks for
   BR services against flown observations where available; missing
   observations are reported `no-observation`, never "no flight" or "on time".

## Honest data gap (verified 2026-09-16)

The checked-in ADS-B direct-route snapshot
(`adsbiq-recent-route-flight-number-candidates.json`, window 2026-07-01..09-09)
contains **no BR TPE-endpoint entries** (its carriers are GA/JL/KQ/LH/MS/OS/OZ/
QF/QR/SV/TK/TP/UA/WY). `official-schedules.json` BR services are TPE↔BKK ×5 +
TPE→NRT + BKK→TPE (BR67/211/205/61/75/198/202); the operator-evidence baseline
identities (TPE–HKG / TPE–SFO) live in `server/operator-evidence.ts`, not that
file.

Consequence: the promotion gate is wired and tested, but with the current
snapshot it promotes **0** BR TPE routes — mechanism present, data absent. The
drift report therefore marks all 7 BR schedule rows `no-observation`. This is
an honest result, not a fabricated one.

## Boundaries honored

- No future-date/weekday/time/award-seat claims from flown observations.
- No negative "no flight" assertions from missing observations.
- No provider-listed → operating-carrier promotion.
- No change to `PublicationSourceSchema.kind` (strict schema untouched).
- No new data subsystem beyond the existing route-network source layer.

## Verification / acceptance checklist

- [ ] `npm run typecheck` passes.
- [ ] `npm run test` passes (baseline 1185 tests / 106 files + new tests).
- [ ] New tests: `tests/scripts/build-flight-number-layer.test.ts` promotion
      gate; `tests/scripts/report-schedule-vs-operated.test.ts` drift report.
- [ ] `npm run coverage:schedule-vs-operated` produces the drift report.
- [ ] Zero new violations of the boundaries above.

## Next steps (only when a fresh BR TPE flown-observation snapshot exists)

- Re-run `npm run routes:build-flight-numbers` with a BR TPE ADS-B snapshot to
  populate `flownObservations` and promote qualifying routes.
- Refresh the drift report; observed rows then carry real drift minutes.
