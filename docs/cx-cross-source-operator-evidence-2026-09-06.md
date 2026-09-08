# CX cross-source operator evidence — 2026-09-06

This record closes the saved TDX snapshot's TPE↔HKG Cathay-designator review. It remains a deliberately weaker cross-source tier and does **not** create a `CX* = Cathay-operated` rule.

Accepted exact Cathay-operated identities:

- TPE→HKG: `CX407`, `CX421`, `CX443`, `CX451`, `CX461`, `CX469`, `CX473`, `CX477`, `CX479`, `CX489`, `CX495`, `CX531`, `CX565`
- HKG→TPE: `CX400`, `CX402`, `CX408`, `CX420`, `CX422`, `CX450`, `CX464`, `CX466`, `CX472`, `CX488`, `CX494`, `CX530`, `CX564`

Known Cathay marketing codeshares that are explicitly **not** Cathay-operated in this window:

- `CX5111` TPE→HKG → HK Express `UO111`
- `CX5117` TPE→HKG → HK Express `UO117`
- `CX5110` HKG→TPE → HK Express `UO110`

The acceptance window is bounded to `2026-09-06..2026-09-14`, with a review deadline of `2026-09-19T23:45Z`.

Evidence basis:

1. Cathay's current TPE↔HKG destination page states that Cathay Pacific operates direct flights on the route.
2. Cathay's current Taiwan promotion terms restrict the offer to flights both marketed and operated by Cathay Pacific.
3. DirectFlights publishes the bounded 2026-09-07..09-13 Cathay schedule in both directions and enumerates every accepted designator above. Exact Flight.info, FlightStats, FlightMapper and Plane Finder records independently confirm the individual identities, including the through-flight TPE segments of CX530/531/564/565. These sources are used only for the exact designators and directions stated here.
4. The earlier free AeroDataBox calibration independently returned `IsOperator=CX` for CX407 and CX400 on the sampled date. It remains supporting evidence only and was not required to promote the newly added identities.
5. Flight.info's HK Express schedules explicitly map UO110↔CX5110, UO111↔CX5111 and UO117↔CX5117. FlightStats/Avionio independently agree on those marketing-code relationships. These three remain references and are never selectable as CX-operated flights.

Because the currently discovered Cathay pages do not provide a per-flight operator statement for these exact 2026 flight numbers, this tier is labeled **cross-source verified**, weaker than airline-official exact evidence.

TDX remains the source of dated occurrences. The resolver may promote only exact route + exact flight + bounded date while this evidence remains fresh. The three known HK Express codeshares remain visible as non-selectable references with the different operator identified. Any future/new CX designator outside this enumerated set remains unresolved until separately evidenced.

Isolated Edge QA has two explicitly separated modes. Historical cases are evaluated at `2026-09-05T19:31Z`, while the saved TDX rows are still inside their original four-hour application freshness window; they exercise CX473/CX408 as selectable exact flights. The later completion evidence was not reviewed until `23:45Z`, after the saved TDX snapshot had expired, so CX531/CX564 and CX5111/CX5110 are exercised only through a **synthetic-freshness operator/UI fixture** that reuses the exact saved public row content but assigns fixture freshness at the evidence-review time. The fixture proves resolver/UI selection, known-other-operator rendering and `fn=` share reload at 1440/1024/390 px; it is deliberately not represented as fresh supplier or historical TDX evidence. No live TDX or AeroDataBox request is made by either mode.

The completion regression reads the actual saved 1,111-row snapshot and enumerates every TPE↔HKG `CX` designator: **29 unique identities = 26 exact Cathay-operated + 3 exact UO-operated marketing codeshares + 0 unclassified** inside the bounded window. Final validation: **895 tests in 61 files**, TypeScript, ESLint, production build and `git diff --check` all pass. Historical replay and the synthetic-freshness operator fixture are both non-live evidence.
