# Flight data source strategy — 2026-09-11

## Problem found

GCMP's route-discovery layer and its dated-flight layer have very different coverage. The runtime route catalog contains tens of thousands of current published directional carrier routes, but the bundled weekly/official dated evidence covers only a small fraction of those route keys. Route count and candidate flight-number count therefore must not be used as proxies for dated-flight completeness.

The default live dated gateway is TDX. Its international GeneralSchedule adapter is intentionally Taiwan-scoped: at least one endpoint must be a Taiwan airport. That makes it useful corroboration for Taiwan itineraries, but it cannot serve as the global dated-schedule backbone.

`npm run coverage:flight-data -- YYYY-MM-DD` is now the repeatable audit for this gap. It reports route identity, route-level flight-number evidence, active dated coverage, source freshness and carrier-level priority gaps as separate layers.

## Evidence hierarchy

1. **Global dated schedule backbone — OAG or Cirium contract feed.** Require exact local date/time, route, flight designator, explicit operating-vs-marketing identity, pagination/completeness metadata and freshness. A successful complete empty result is the only supplier response that may support a negative "no scheduled flight" claim.
2. **Official/government corroboration — airline publications and TDX.** Promote a marketed/reference flight to an operating flight only when the publication itself establishes the operator or independent operator evidence agrees.
3. **Current route/frequency discovery — air-routes.com.** Use for high-recall current destinations, weekly operating-day signals and local departure-clock hints. Treat listed airlines as provider-listed because marketing/codeshare identity can differ from the operator.
4. **Operational cross-check — filed/flown/ADS-B sources.** Use near departure or historically to validate what actually operated, not as the sole future timetable source.
5. **Discovery-only sources — FlightConnections, FlightsFrom, Flightinformation and similar pages.** Useful for finding gaps and candidate designators; never promote a carrier/date/operator claim solely from these layers.

## Immediate implementation in this work package

- Preserve air-routes.com weekly `day + times[]` data instead of discarding the departure clocks already returned by the provider.
- Keep that weekly signal explicitly below dated/operator proof; it cannot upgrade `scheduleStatus` or populate an itinerary.
- Add the repeatable `coverage:flight-data` audit so future collection work is measured against active dated coverage and freshness rather than raw route volume.
- Centralize the default schedule-provider constant so diagnostics and runtime cannot silently disagree about which provider is the default.

## Automatic API mode

The gateway now supports an explicit `SCHEDULE_PROVIDER=auto` mode. It is
route-aware rather than a runtime failover chain:

- if a query touches a Taiwan airport and TDX credentials are configured, use TDX;
- otherwise, if Cirium credentials are configured, use Cirium as the global dated provider;
- otherwise use bundled official publications only;
- after a provider is chosen for a query, an upstream error never triggers a second paid-provider request.

This keeps Taiwan queries on the government source when available, spends the
global supplier only where it is needed, and removes the need to change provider
configuration route-by-route. The default remains `tdx` for backwards
compatibility; production must opt into `auto` explicitly.

## Route collection now precedes flight-number collection

The route graph is a separate first-stage denominator. Flight-number enrichment
must never be responsible for discovering whether a route exists. The preferred
bulk collection path is Aviation Edge Airline Routes: one provider dataset is
normalized into `aviation-edge-global-current.json` as provider-listed active
directional nonstop routes for the 60 target alliance carriers. Existing curated,
ADS-B, standing, BTS and official layers retain higher evidentiary value and can
override/corroborate the provider layer.

`npm run routes:collect-global:bulk` reads `AVIATION_EDGE_API_KEY` only from the
server-side local environment and saves the raw response outside the repository
with its original capture timestamp. Offline rebuilds must use that timestamp;
an old snapshot is never restamped as newly checked. If the bulk source is not
configured, the slower air-routes.com airport scan remains a resumable research
fallback, but incomplete scans cannot write the production current artifact by
default.

### Static candidate validation

`npm run routes:research-static` can use the independently maintained
Jonty/airline-route-data snapshot as a local research-only gap detector. The
source repository has no explicit license, so its dataset is never copied into
the GCMP repository or promoted directly to production evidence. A 2026-09-11
research pass found 3,455 target-carrier relationships missing from the current
published runtime graph.

`npm run routes:validate-static -- --fetch` then queries only the unique origins
behind those gaps and caches current air-routes.com responses outside the repo.
This avoids rescanning all 5,097 known airports. Validation distinguishes exact
current carrier-route matches, route pairs where that carrier is not listed,
routes absent from the current provider response, and unresolved origins. Exact
matches can be exported as a separate provider-listed route catalog, but they do
not establish the physical operating carrier or a flight number.

After the full targeted validation pass completes, the independently confirmed
carrier-route matches may be materialized as
`public/data/route-network/validated-static-current.json`. That catalog is a
route-discovery input to both the runtime builder and the flight-number builder.
Provider-listed rows without source-backed flight identity remain unresolved in
the runtime; flight-number enrichment runs only after this route graph exists.

For unresolved route identities, GCMP also uses a small attributed candidate
overlay derived from MrAirspace's ODbL-1.0 quarterly aircraft-flight-schedules
dataset. The research pass range-queries the large Parquet releases outside the
repository and joins only already-current GCMP routes by airline ICAO and exact
validated ICAO airport pair. The tracked overlay keeps only routes with at least
two observations, chooses flight numbers from the most recent matching quarter,
and never promotes operating-carrier identity or future schedule status.

For higher-freshness recovery, GCMP can also derive a tiny candidate overlay
from ADSBiq's ODbL-1.0 daily Parquet releases. The research pass reads only
`flight`, `route_origin`, and `route_dest`, joins both IATA and ICAO airport
codes to already-current unresolved routes, and keeps a designator only when
that exact carrier-route pair is observed on at least two distinct UTC dates.
The tracked snapshot records the observation window and any missing day so a
partial daily archive cannot silently look complete. These rows remain flight-
number candidates and do not establish a future schedule or physical operator.

## Next collection steps

### P0 — establish the global dated backbone

Prefer a contracted OAG or Cirium schedule feed. OAG's documented schedule model separates marketing and operating flights. Cirium likewise documents codeshare/operator relationships. Before adding a new OAG normalizer, capture a real response from the actual subscription because OAG's examples explicitly require mapping to the fields enabled by the customer's API contract.

Candidate references:

- https://knowledge.oag.com/docs/schedules-response-layout
- https://knowledge.oag.com/docs/schedules-api-response-layout-descriptions
- https://knowledge.oag.com/docs/flight-info-alerts-event-samples-schedules-field-definitions
- https://developer.cirium.com/apis/flightstats-apis/schedules
- https://developer.cirium.com/apis/data/codeshare-and-wet-lease-relationships
- https://air-routes.com/developers

### P1 — make collection freshness provenance-safe

The flight-number enrichment job still contains capture-date assumptions tied to snapshot/cache runs. Replace run-wide hard-coded verification dates with source-specific capture metadata before routinely refreshing the layer; an old cached observation must never receive a new `checkedOn` merely because the build was rerun.

### P1 — add cross-source disagreement reporting

For each route/date/designator, record whether global schedule, official publication, TDX and operational observations agree on the operating carrier and clock. Conflicts must downgrade confidence and stay visible to QA instead of being resolved by source order.

### P1 — represent wet leases without inventing a designator

Cirium explicitly exposes a wet-lease operator code while noting that a wet-lease operator flight number is not supported in the schedules request/response model. GCMP's current dated flight shape has only one `carrier + flightNumber` pair, so assigning the primary marketing number to the wet-lease operator would create a false designator. Keep these rows unresolved until the domain model can preserve marketing designator and physical operator separately.

### P2 — operational validation

Add a bounded post-departure validation sample (for example FlightAware/ADS-B data where licensed) to measure schedule-vs-operated drift and codeshare/wet-lease edge cases. This is a quality benchmark, not a replacement for the future schedule feed.

## Trust rules that remain unchanged

- Never infer the reverse direction of a route or schedule.
- Never infer weekdays from a route-only listing.
- Never turn provider errors, truncation, stale data or unresolved rows into "no flights".
- Never treat a marketing/listed carrier as the operating carrier without explicit evidence.
- Never expose supplier credentials to the browser, logs, generated data files or error responses.
