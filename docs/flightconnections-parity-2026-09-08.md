# FlightConnections three-alliance parity gate — 2026-09-08

GCMP's route-universe target is now all current oneworld, Star Alliance and SkyTeam directional nonstop operating routes.

FlightConnections is used only as an external completeness benchmark. Its Terms of Service prohibit automated access, scraping, bulk extraction and bulk downloading, so GCMP does **not** ship a FlightConnections crawler. Benchmark snapshots are manually reviewed and stored under `docs/benchmarks/`.

## Acceptance levels

GCMP now has two separate coverage gates. They must not be conflated:

1. **Runtime current-route coverage** — route discovery is live and origin-scoped. When the user reaches an airport, GCMP requests that origin's current scheduled-passenger destinations through the local `/api/schedules/routes` gateway, filters provider-listed airlines to the selected product's active alliance members, and merges the result with the static/official evidence catalog. A route can therefore appear even when the curated catalog has never seen it. Provider-listed carrier identity is explicitly unconfirmed until the dated schedule layer verifies an operating flight; a live-only carrier can never be persisted directly as an operating carrier.
2. **Static alliance airport universe** — the curated evidence catalog's known airport set is compared with FlightConnections' alliance-wide destination count. This remains useful for offline fallback quality, but it is no longer the runtime route denominator.
3. **Static carrier airport universe** — carrier-level served-airport counts are compared; BR and CI also have a manually transcribed exact airport set so individual missing static airports are visible.
4. **FlightConnections exact directional route-pair QA** — remains manual because FlightConnections prohibits automated/bulk extraction. It is `pending` until a carrier's full directional pair list has been manually reviewed and `routePairsComplete=true`. A destination-count match can never turn this gate green, and this manual benchmark state must not be reported as a runtime route outage.

Run the local, network-free report with:

```text
npm.cmd run coverage:flightconnections -- 2026-09-08
```

The report deliberately exposes source disagreements. For example, the 2026-09-07 FlightConnections oneworld page lists JTA/NU among its 16 carriers while GCMP's official alliance membership catalog contains Hawaiian/HA. This is recorded as a benchmark-vs-membership mismatch rather than silently changing either source.

Runtime route-discovery evidence is additive and deliberately weaker than an operating-flight claim. Current-route listing makes a destination discoverable; existing airline/alliance/official timetable/network publications and the dated schedule gateway remain the authority for operating identity and flight number. Static FlightConnections parity remains a QA/fallback-quality gate, not the product's only source of route availability.
