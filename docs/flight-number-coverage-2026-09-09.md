# Flight-number coverage — 2026-09-09

GCMP previously stored a large global route graph but only exposed flight
designators when a route also appeared in the small weekly/official schedule
catalogs. That made most valid route cards display "flight number not cataloged"
even though the research inputs already contained useful callsign and marketing
identities.

## Evidence tiers

The route-network schema now keeps two distinct number layers. They deliberately
have different product behavior.

1. **Confirmed route-level flight numbers** (`flightNumbers`)
   - Exact recent ADSBiq callsign observation from 2026-08-01..2026-09-06.
   - Joined to the exact VRS standing-data callsign route and a valid commercial
     number suffix (`1`–`4` digits plus optional trailing letter).
   - Promoted to a selectable route-level designator only when the route already
     has independent operating-carrier evidence.
   - This proves a recently observed route/designator identity, not a weekday,
     departure time, future date, or award seat.

2. **Candidate flight numbers** (`flightNumberCandidates`)
   - VRS standing-data flight-number references.
   - U.S. DOT BTS June 2026 marketing-carrier flight numbers for AA/AS/DL/UA.
   - FlightConnections public route-schedule designators used only for bounded
     gaps where a cached page was successfully captured.
   - Flightinformation.com current direct-route timetable designators used only
     after the local VRS/BTS/affiliate layers still have no number for that
     exact directional carrier-route.
   - A 2026-09-09 Chrome audit of FlightsFrom direct-route pages contributed
     150 same-brand candidate routes. The same audit now contributes 829
     confirmed designator routes only where GCMP already had independent
     operating-carrier evidence; FlightsFrom never promotes a provider-listed
     route by itself.
   - Candidates are displayed for research but are not persisted as a confirmed
     itinerary flight until date/operator evidence is stronger. This prevents a
     marketing codeshare or stale standing row from becoming fake operator proof.

Invalid ATC-style suffixes such as `1BS` are rejected instead of being coerced
into commercial flight numbers.

## Build pipeline

Checked-in artifact:

`public/data/route-network/flight-numbers-current.json`

Auditable bounded web snapshot:

`public/data/route-network/flightsfrom-flight-numbers-20260909.json`

Current route corrections (historic/non-nonstop/operator-mismatch cases):

`public/data/route-network/current-corrections.json`

Offline rebuild from the existing local research corpus:

```text
npm.cmd run routes:build-flight-numbers
```

Bounded refresh of only the still-missing directional pairs from public
FlightConnections route pages:

```text
npm.cmd run routes:build-flight-numbers -- --fetch-flightconnections
```

The normal app build does **not** perform live web requests. It only consumes the
checked-in number layer and overlays it onto the existing current route graph via
`mergeRouteNumberEvidence`. Number-only evidence is forbidden from resurrecting
a route that is no longer present in the current graph. Runtime construction also
applies the checked-in current-corrections layer and demotes any provider-listed
relationship with no flight identity to `identity-unresolved`.

The runtime builder has a hard invariant: if any route still marked `published`
has neither a confirmed nor candidate designator, the build fails.

## Coverage accounting

Before this work package, only a small schedule subset had any exposed flight
number (roughly 2% of the 29,796 sourced directional carrier-route
relationships).

After the bounded 2026-09-09 refresh and identity audit:

- sourced directional carrier-route relationships: **29,796**
- current plannable routes: **29,494**
- current plannable routes with at least one confirmed or candidate designator:
  **29,494 / 29,494 = 100%**
- routes with route-level confirmed-number evidence: **14,977**
- routes with candidate-number evidence: **24,152** (some also have confirmed
  evidence, so these two counts intentionally overlap)
- relationships retained as `identity-unresolved`: **272**
- relationships retained as `suspended`: **58**
- unresolved current-plannable number gaps: **0**

The `identity-unresolved` and `suspended` relationships are not deleted. They
remain in the runtime evidence graph for research and provenance, but are
excluded from current route discovery. Examples found during the audit include
an airline-brand route whose present nonstop is operated under another carrier,
a previously direct service that is now 1-stop, and a route whose final service
date has already passed.

Coverage means "there is at least one confirmed or candidate designator
available for every route GCMP currently presents as plannable." It does **not**
mean every number is selectable or that every candidate operates on every date.

### Fixed-route priority confirmation pass

After the initial 100% identity-coverage pass, a second bounded Chrome audit
targeted 77 candidate-only routes where GCMP already had independent operating
evidence for five high-priority alliance carriers: BR, JL, KE, NH and SQ. Current
FlightsFrom direct-route timetable pages exposed same-carrier designators for 69
of those routes, so only those 69 were promoted to confirmed route-level flight
numbers:

- EVA Air (BR): **15** routes
- Japan Airlines (JL): **10** routes
- Korean Air (KE): **37** routes
- ANA (NH): **5** routes
- Singapore Airlines (SQ): **2** routes

Eight routes deliberately remain candidate-only because the current direct-route
page did not expose a same-carrier designator during the audit: `JL NRT-DFW`,
`JL NRT-KIX`, `KE ICN-RMQ`, `KE RMQ-ICN`, `NH CTS-KIX`, `NH ISG-KIX`,
`NH KIX-ISG`, and `NH OKA-KIX`. Their older standing references are preserved
for research instead of being promoted without current timetable corroboration.

### High-frequency alliance carrier confirmation pass

A follow-up Chrome audit then targeted every remaining operating +
candidate-only route for ten high-frequency RTW carriers: LH, TK, AC, AF, UA,
AA, DL, BA, QF and QR. All **744 / 744** current direct-route pages returned
successfully. Same-carrier timetable designators were present on **602** routes,
which were promoted to confirmed route-level flight numbers. The remaining 142
were deliberately left unpromoted for a deeper operator-identity pass rather
than being guessed from stale standing references.

Promotions by carrier:

- Lufthansa (LH): **147 / 182** checked
- Turkish Airlines (TK): **165 / 192** checked
- Air Canada (AC): **95 / 134** checked
- Air France (AF): **103 / 110** checked
- United (UA): **20 / 23** checked
- American (AA): **18 / 21** checked
- Delta (DL): **8 / 25** checked
- British Airways (BA): **17 / 20** checked
- Qantas (QF): **24 / 28** checked
- Qatar Airways (QR): **5 / 9** checked

After this pass, confirmed-number coverage among routes where GCMP already has
independent operating-carrier evidence is: LH **525 / 560 (93.8%)**, TK
**636 / 663 (95.9%)**, AC **444 / 483 (91.9%)**, AF **374 / 381 (98.2%)**,
UA **1329 / 1332 (99.8%)**, AA **1268 / 1271 (99.8%)**, DL
**1270 / 1287 (98.7%)**, BA **310 / 313 (99.0%)**, QF **198 / 202 (98.0%)**,
and QR **368 / 372 (98.9%)**.

### Deep operator-identity pass for AC / LH / TK / DL

The next pass revisited the **118** candidate-only routes still concentrated in
Air Canada, Lufthansa, Turkish Airlines and Delta. Instead of treating every
row as a missing-number problem, the audit parsed the current direct-route page
for its actual listed airline operators and then extracted same-prefix
commercial designators only when the exact member airline was present.

Results:

- **42 routes** exposed the exact member airline plus a current commercial
  designator and were promoted to confirmed numbers. Examples include
  `AC1893 CTG-YUL`, `LH1005/1007/1009/1011/1015/1017 BRU-FRA`,
  `DL64 AKL-LAX` and `TK882 IST-TBZ`.
- **52 routes** are retained as `identity-unresolved` because the present
  nonstop is listed under other operators. Examples include `AC CLT-IAD`
  (American / United), `DL BDL-BNA` (Southwest) and `TK SAW-ADB`
  (Pegasus / AJet).
- **22 routes** are retained as `suspended` because the current direct-route
  page no longer lists an operating airline for that directional pair, such as
  `LH FRA-BOD`.
- **2 routes** deliberately remain candidate-only because the exact airline is
  present but the current page did not expose a safe same-prefix designator:
  `AC YZF-YYZ` and `DL BOS-PUJ`.

After removing the misattributed/stale rows from the current planner, confirmed
flight-number coverage among remaining independently confirmed operating routes
is now Lufthansa **532 / 532 (100%)**, Turkish Airlines **637 / 637 (100%)**,
Air Canada **470 / 471 (99.8%)** and Delta **1278 / 1279 (99.9%)**. The runtime
still preserves all corrected relationships and their 2026-09-09 FlightsFrom
provenance for audit instead of deleting historical/provider evidence.

Any remaining rows must stay explicit. A current public route page that only
shows another airline's designator (for example a provider-listed alliance brand
whose present nonstop service is operated/marketed by somebody else) is not
silently rewritten with the wrong carrier prefix merely to reach 100%.
