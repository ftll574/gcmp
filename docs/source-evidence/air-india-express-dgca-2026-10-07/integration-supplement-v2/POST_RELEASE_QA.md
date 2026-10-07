# Post-release QA follow-up — integration supplement v2

Date: 2026-10-08

This note supplements the frozen release record in `integration-supplement-v1/`; it does not edit or replace that record or any reviewed source snapshot.

## Release binding

- Reviewed release commit: `08dedaa1cd9576fd751c0ddb8ab311e4feff5490`.
- Frozen v1 record SHA-256: `73281692b2579026986a46e12d341b066233ad809b72dfc57327647af92d8b74`.
- The independent reviewer passed the pinned data/source checks and desktop DGCA directory, IX detail, and date-caveat checks.

## Planner-route smoke observation

The independent reviewer additionally reported that, in their isolated local built preview, navigating to `?view=planner` rendered a blank page. Their accessibility tree contained only the `AXWebArea`; page-bundle requests returned HTTP 200, and they observed no data fetches. The reviewer did not attribute this observation to the Air India Express data-only update and made no edits to the implementation checkout.

The frozen release diff changes the DGCA evidence builder, verifier, schema, directory, manifest, and related tests; it does not change planner-route source modules. This does not establish the cause of the blank-page observation.

## Mainflow status

- DGCA evidence directory and IX detail/date-caveat desktop flow: **passed** in the independent review.
- Planner route: **unresolved**. One independent local-preview smoke check reported a blank page; it was not reproduced against the live site in this follow-up.
- Overall planner/mainflow status: **not fully verified**. The previously successful live HTML, production-asset, manifest, catalog, and runtime hash checks verify deployed bytes, not client-side planner hydration or interaction.
- A real-browser induced network failure/Retry check and mobile viewport check remain unverified; the mocked Retry regression test passed in v1.

An interactive live planner recheck was unavailable in this follow-up: the current browser-control endpoint reported as retired, and the web-view tool could not access this host. The byte-level live checks do not close that gap.

No source data, v1 release artifact, or frozen commit was changed for this follow-up. No causal claim or code fix is made here.
