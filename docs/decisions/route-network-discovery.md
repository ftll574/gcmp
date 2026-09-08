# BR/CX route-network discovery

Decision date: 2026-09-05. The user authorized the next repair round after
`docs/takeover-repairs-2026-09-05.md`: source-backed partner continuation.

## Data contract

A published nonstop route is not a weekly schedule or an available award seat.
Use an optional static route-network catalog with explicitly directional
operating-carrier/airport pairs and primary sources. Do not invent weekdays.

Sources record when their content was inspected and, where known, when it was
published. Checking an old announcement today does not renew service validity.
Both dates must remain visible. Generic fare pages, marketing codeshares and
reversed airport pairs do not create evidence for a nonstop operating service.

Merge the new observations with existing schedules by carrier/from/to, and
filter using the selected product's eligible operators. Multiple operators of
one airport pair stay independently selectable. Explicit suspension and known
network gaps take precedence over an undated route observation.

## Interaction contract

Default to all eligible carriers and the current chain endpoint. Use TPE only
for a completely empty chain. An endpoint absent from the catalog stays selected
with an honest empty state rather than silently changing to another airport.
After adding an option, keep its operator on the leg and show the new endpoint.

Network-only routes leave calendars unconstrained. Missing or expired evidence
means that flight dates need checking, not that the route cannot be entered.
Loading failure falls back to existing schedules with a visible notice.

## Scope and acceptance

This is the bounded explorer follow-up recorded in the convergence contract,
not an automatic itinerary solver or a live booking service. No new dependency,
backend, URL version, deployment or award-seat claim is introduced.

Test directionality, duplicate evidence, multiple operators, missing sources,
airport integrity, empty eligibility and suspension precedence. Full-App tests
must build both a BR and CX route from an empty planner using actual catalog
rows. Keep existing integrity tests and all 24 calibration cases passing.
Actual-browser visual QA is a separate check.
