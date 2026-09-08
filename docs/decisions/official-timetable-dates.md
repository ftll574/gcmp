# Official timetable dates and TDX

Date: 2026-09-05. User approved proceeding with TDX + valid official seasonal schedules before purchasing a global supplier.

This explicitly refines `dated-flight-search.md`: existing network observations and the legacy 138 weekly records remain references, but a **new, source-verified official timetable with explicit validity and exceptions** may produce a `published` date. It must not be represented as a live `scheduled` result.

## Evidence and display

Four states: dated provider result, official timetable occurrence, complete-provider no-match, unknown. Official/public timetable data is partial and can prove a listed flight's planned day, not that an entire route has no service. Missing times remain missing; no midnight placeholder, no arrival-day inference from local clock comparison. Date-only flights may be added as references and copied for customer-service enquiries. Connections cannot be certified without times/timezones.

Provenance includes source URL, publication date where known, actual check date, explicit review deadline, and service validity. Checking the static file is not checking the airline again. A source past its review deadline cannot assert a positive; forecast date and source-review date are different concepts. A fresh complete provider response takes precedence over partial seasonal data; otherwise primary TDX detail is not overwritten by date-only fallback records.

## Deployment boundaries

The bundled official fact catalog works on the existing static app without any key, backend or external request. TDX uses an optional server-only OIDC adapter and a route snapshot, not 31 daily requests. Default gateway provider is TDX; Cirium requires explicit `SCHEDULE_PROVIDER=cirium`, never silent paid failover. CORS is not authentication. Public service still needs TLS, shared quota storage for multiple replicas, and edge abuse controls.

No airline login, booking, paid subscription, award-inventory query, commit or deployment is authorized by this change. TDX account/coverage/operator/service-type validation remains required before public production activation.

## 2026-09-06 operator-evidence refinement

The real v2 report proves timetable access but supplies zero CodeShare entries across 1,111 parsed rows. An airline designator that survives alias elimination is not established operating identity. TDX candidates therefore remain typed unverified `references`, with dates/source retained, not `published` operating flights. They are visible for customer-service verification but cannot populate itinerary operators, fn/op share values, or BR/CX eligibility. The four-state calendar retains `unknown` for eligible operating availability while separately showing reference-date counts. Independently reviewed ANA publications keep their existing selection path. See `docs/tdx-operator-evidence-2026-09-06.md`; this does not authorize a new provider or expand coverage.
