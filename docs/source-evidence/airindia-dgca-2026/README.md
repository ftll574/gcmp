# Air India DGCA schedule packet: independent review

Read-only review snapshot as of 2026-10-07. The DGCA PDF is an approved summer schedule, not evidence that a flight actually operated. No GCMP runtime or application code was changed.

## Disposition

- 1,115 source schedule variants: 842 current, 23 future, 250 expired. The current/future slice has 865 variants grouped into 573 distinct AI + directed route + full designator keys across 138 directed routes. All 138 route directions exist in pinned baseline `f472092`.
- Among those 573 keys: 567 match already-confirmed baseline designators (857 variants), 2 match baseline candidates (2 variants), and 4 designators are absent from both flight-number arrays on existing routes (6 variants). No absent route topology. Preserve the 567 confirmations and append source support; do not double-count them.
- Exact candidate keys: **AI1734 DEL→GOX** and **AI1854 GOX→DEL**. Both are current schedule entries with raw frequency `1234567` (weekday mapping separately corroborated) and Delhi / GOA MOPA source rows. Their baseline route `carrierIdentity` is `provider-listed`; the DGCA source identifies Air India Ltd. / AIC as scheduled operator. This supports schedule identity, not actual operation.
- Four source-supported designators on existing routes: **AI532A AMD→DEL** (future, 2026-10-24 only), **AI4203 DEL→GAU** (2 current variants), **AI4204 GAU→DEL** (2 current variants), **AI828 SXR→DEL** (future, 2026-10-24 only). Their baseline route status is published and `carrierIdentity` is operating; the designators are absent from both number arrays.
- Seven current identities have aircraft conflicts (`A320`/`A321`). Keep the route/flight identity accepted and hold only the aircraft field.

## Parsing and lineage

The PDF hash and every file in the packet manifest verify. Re-running the parser from the read-only PDF reproduced all 1,537 source rows and all 1,537 movements; all 1,115 identity records reproduced except the later-added baseline match annotation. Each source row populated exactly one arrival or departure movement. The raw suffix in **AI 532A** is retained.

Printed serials repeat across station sections: 149 repeated page+serial groups (361 rows) were found, with no duplicate serial within the same page and station section. `movement-lineage.csv` resolves each movement using PDF hash + page + within-page physical row order + station-section ordinal/raw label + printed serial + movement side. All 1,537 addresses are unique.

The source identifies operator `Air India Ltd.` and code `AIC`; the explicit repository map `AI: AIC` resolves the IATA carrier. The mapping is not inferred from the flight-number prefix. Matching uses directed endpoints and full designators, removing whitespace only. The pinned baseline's Air India rows have no carrier entity key/name fields.

## Holds and rights

The PDF does not state a clock timezone: keep HH:MM raw, with no UTC/IST conversion or dated occurrences. The PDF does not define the frequency digits; keep raw values, with `1=Monday` through `7=Sunday` described only as separate AAI corroboration. Passenger/cargo class is not stated. A missing arrival/departure counterpart is not treated as contradiction; 693 identities have one side only.

DGCA's [website copyright policy](https://www.dgca.gov.in/digigov-portal/jsp/dgca/footerLink/WebsitePolicy.jsp) permits free reproduction when accurate and not misleading, with prominent attribution, except material identified as third-party copyright. The packet reports visual review of all 28 pages and no identified third-party content. Independent spot-check of pages 1, 14, and 15 found no third-party marks. The iText producer string is software metadata, not source content. No public-domain or Creative Commons claim is made.

## Minimal integration recommendation

Reuse the existing DGCA integration owner's shared schedule schema (`01a115a9-1adf-71ab-92f2-662dcb94e088`), not another adapter. Store raw/full designator, directed endpoints, frequency and corroboration status, effective window, raw clock with unknown basis, aircraft value/conflict, PDF hash, page/physical row/station/printed row/side lineage, and source status as approved schedule. Append support for the 567 already-confirmed identities, attach support to the two candidate keys without claiming operation, add the four unlisted designator references on existing topologies, and keep 250 expired variants separate.

## Files

- `schedule-identity-ledger.csv`: one row per schedule identity variant; disposition is `accepted`, `held_field_only`, or `expired`.
- `movement-lineage.csv`: one row per airport movement with a unique source-row address.
- `integration-snapshot.json`: exact keys, counts, field holds, provenance hashes, and minimal adapter recommendation.
- `SHA256SUMS`: hashes of the review deliverables.
