# CAA weekly schedule reference tier

The planner now ships a separate, read-only CAA schedule reference layer at `public/data/route-network/caa-weekly-schedule-tier-20261006.json`. It contains **488 source-listed carrier/designator/ordered-direction associations**, **483 distinct designators**, and **253 directed routes**, assessed from the complete original CAA domestic and international timetable CSVs as of 2026-10-06.

## Evidence meaning

- CAA's listed carrier code, full designator, ordered endpoints, recurring weekday pattern, validity window, source clock text, and CSV row lineage are retained.
- The listed carrier is not asserted to be the physical operating carrier. The field remains unknown in both schema and UI.
- Actual operation, cancellation state, nonstop service, time zone, bookability, and award eligibility are not established. A blank transit field is not a nonstop claim.
- The tier does not populate `flightNumbers`, the planner's selectable flight list, alliance eligibility, or `runtime-current.json`. It is rendered only in read-only route references and the CAA schedule directory.
- Users can enter a source-calendar date to check whether its date window and weekday are listed. That does not select or change a flight/date in the itinerary.

## Provenance and license

The data is derived from the original CAA CSV bytes. The source hashes match the official CAA hash pages:

| Dataset | Bytes | SHA-256 |
|---|---:|---|
| [6066 domestic timetable](https://data.gov.tw/dataset/6066) | 130,505 | `5690304d65a8a0a62df920d8cf16227654674b34fff2a44f064f79d587286ea2` |
| [9973 international/two-strait timetable](https://data.gov.tw/dataset/9973) | 133,668 | `ebfd2e8f207a46f250fe48c53b53770d10a1fec342a18a73e19f349574bb0f35` |

Display attribution is **Taiwan Civil Aviation Administration (交通部民用航空局)**. The source is licensed under [Taiwan Open Government Data License 1.0](https://data.gov.tw/license). The runtime asset contains both source URLs, hash-page URLs, hashes, retrieval timestamps, and source CSV line numbers. See [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

## Rebuild and verify

From the repository root:

```sh
python3 scripts/build-caa-weekly-schedule-tier.py
npx tsx scripts/build-data-manifest.ts
npx tsx scripts/verify-data-manifest.ts
npx vitest run tests/lib/schemas/caa-weekly-schedule-tier.test.ts tests/components/CaaWeeklyScheduleTier.test.tsx
```

The builder refuses to run if either original CAA source file, its download manifest, the baseline runtime hash, the derived 132,996-key candidate set, or the expected source intersections differ from their pinned values. It derives candidate associations directly from the runtime's candidate-number arrays, joins raw CAA rows by exact carrier/designator/ordered endpoints, applies the weekday-aware conflict hold, and rejects any association overlap with the 839 operator-confirmed entries. The asset records both the prior full candidate manifest hash and a canonical SHA-256 of the exact candidate association key set. It emits a deterministic compact JSON asset plus a local build report and does not modify the production runtime layer.

## Reproducible counts

| Layer | Association keys | Distinct designators | Directed routes |
|---|---:|---:|---:|
| Operator-confirmed baseline | 839 | 829 | 295 |
| CAA schedule-verified, operator unknown | 488 | 483 | 253 |
| Exact association overlap | 0 | — | 0 route overlap |
| Union (association / designator / route) | 1,327 | 1,311 | 548 |
| Candidate keys outside CAA schedule tier | 132,508 of 132,996 | — | — |

One designator is present in both tiers on a different route association. These counts do not make the CAA references bookable or operator-confirmed.
