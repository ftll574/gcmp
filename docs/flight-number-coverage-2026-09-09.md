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
     150 same-brand candidate routes. The same audit contributed 116 confirmed
     designator routes only where GCMP already had independent operating-carrier
     evidence; FlightsFrom never promotes a provider-listed route by itself.
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
- current plannable routes: **29,568**
- current plannable routes with at least one confirmed or candidate designator:
  **29,568 / 29,568 = 100%**
- routes with route-level confirmed-number evidence: **14,264**
- routes with candidate-number evidence: **24,357** (some also have confirmed
  evidence, so these two counts intentionally overlap)
- relationships retained as `identity-unresolved`: **220**
- relationships retained as `suspended`: **36**
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

Any remaining rows must stay explicit. A current public route page that only
shows another airline's designator (for example a provider-listed alliance brand
whose present nonstop service is operated/marketed by somebody else) is not
silently rewritten with the wrong carrier prefix merely to reach 100%.
