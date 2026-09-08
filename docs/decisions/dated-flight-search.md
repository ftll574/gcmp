# Date-specific scheduled flights — 2026-09-05

User direction: show which departure dates have scheduled flights; leave award-seat availability to airline customer service. This promotes the date-specific schedule layer beyond the previous route-network observations.

## Contract

- A route observation, weekly historical sample, ticket price or empty booking search is NOT a confirmed date-specific schedule.
- Query passenger nonstop schedules by ordered airport pair and departure-airport LOCAL calendar date. Display operating flight number and both airports' local departure/arrival dates and times; never subtract naive local timestamps to calculate duration.
- `scheduled` means at least one explicitly identified operating flight in a fresh successful schedule response. `none` means a fresh, complete route/date response has no matching operating flights. Every error, missing credential, partial/unresolved response, stale result or uncovered date is `unknown`, not `none`.
- Selecting a flight saves the operator, departure date and operating flight number. The share URL preserves these facts, NOT an assertion that the schedule is still verified when reopened. Changing operator/date clears the old flight reference.
- No award inventory, booking, payment, speculative schedules or inferred codeshare operators.

## Data integration and deployment boundary

Keep static hosting working. Add an OPTIONAL Node schedule gateway, with a replaceable provider boundary. First adapter follows the documented Cirium FlightStats Schedules route-departure API; it is NOT a purchase or authorization to incur vendor charges. Credentials stay server-side; no VITE_ credential, browser token or public JSON secret. Queries are explicit, bounded, cached and globally budgeted. No auto-fetch per destination/card.

Official references checked 2026-09-05:

- https://developer.cirium.com/apis/flightstats-apis/schedules — route/date API, credentials and Contract-plan licensing for route queries.
- https://developer.flightstats.com/api-docs/scheduledFlights/v1/scheduledFlightResponse — local times, operating identities, codeshare and stops fields.
- https://www.cathaypacific.com/cx/en_KH/book-a-trip/timetable.html — warns that full flights are omitted; booking-search emptiness cannot prove no service.

The inspected runtime has no CIRIUM_APP_ID, CIRIUM_APP_KEY or VITE_SCHEDULE_API_BASE configured. This implementation must not be reported as a connected global live schedule service until licensed credentials and a deployed gateway pass live acceptance. Existing 138 weekly rows and 42 route observations are retained, but never promoted to live positives/negatives. Public airline endpoints are not bypassed or reverse-engineered around access controls.

## Acceptance

Month calendar, per-day status, explicit refresh, operator/date/flight selection, share reload, stale/error/partial handling, no inventory claims, no secret leakage, bounded upstream calls, tests for midnight/dateline travel and codeshare duplicates. Fixture integration tests are labeled synthetic; they prove software behavior, not current airline service.
