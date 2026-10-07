# Air India Express independent review

As of 2026-10-07. This is a read-only-derived evidence packet in task-40; it did not modify the canonical repository, runtime data, or source packet.

## Heading resolution

The fresh extraction reproduces task-34's 1,744 source rows and original `airport-heading-resolution.csv` hold set. Thirteen held heading labels cover 1,119 rows. Task-37's validated station mapping review provides a unique same-label cross-source counterpart for each heading. Every reviewed IATA code is present exactly once by code in the pinned task-17 airport catalog; the raw spelling/alternate label is retained in `airport-heading-resolution.csv`. Task-33's same-label mapping independently corroborates eight of these thirteen headings. No station is inferred from a route pattern. Parent-supplied Jalandhar, Pondicherry, and Purnia crosswalk notes are not headings in this 32-page PDF and were not applied. The retained `DGCA-AIX-2026-R...` source row ID prefix is the parser namespace; the source itself identifies flight prefix IX and Operator Code AXB.

## Classification and schedule meaning

A source arrival row or departure row is one directional-leg assertion. Exact reciprocal rows for the same designator, airport pair, aircraft, raw frequency and effective dates are consolidated into a schedule variant while keeping separate arrival/departure clocks and all row lineages. A single explicit row remains sufficient for a directed leg. Airport in/out rows are never chained into a nonstop.

As of 2026-10-07, the source has **1051 accepted current/future movement rows**, **0 held rows**, and **693 expired rows**. The exact counts by unique directional identity and schedule variant are in `summary.json`. Every source line is pinned to the PDF SHA-256 and a per-row hash over page, physical row ordinal, raw station section, printed row, and extracted row text.

The PDF contains no frequency legend and states no timezone. Raw frequency digits and HH:MM clock values stay unchanged; no weekday expansion, UTC conversion, or connection timing is produced. The AAI weekday convention is only corroborative if used later, not a DGCA legend. Approved schedule evidence does not verify actual operation.

## Runtime and carrier identity

The runtime comparison uses the task-17 hash-pinned snapshot `aa90283d52015b1b418c3840252cb34152f9ed577a3e0766291935b92b151537`. It checks airport-pair presence across any carrier and exact flight-designator/pair matches separately. Any-carrier pair overlap does not establish Air India Express service; AI remains separate from IX. No runtime records were changed. The task brief states that current main `edc4a14` has the same flight layers and no known IX baseline; this packet does not modify or rely on the dirty canonical checkout.

## Rights and attribution

See `rights-review.md` for DGCA's stated reproduction conditions and the full 32-page source notice/metadata review. The policy does not impose special noncommercial wording.

Suggested attribution: **Source: Directorate General of Civil Aviation (DGCA), “Airport Movement Report - Approved Summer Schedule Domestic,” Air India Express Limited, published 18 March 2026.**

## Files

- `airport-heading-resolution.csv`: all 43 headings, exact-match diagnosis, mapping evidence, registry record, row IDs/pages.
- `reviewed-station-aliases.csv`: the 13 reviewed alias resolutions and corroborating records.
- `schedule-rows.csv`: one row per physical source movement with original raw columns and row-level lineage hashes.
- `schedule-variants.csv`: deduplicated same-directed-leg schedule variants.
- `identity-ledger.csv`: directional IX designator/route identities with lineage references.
- `runtime-comparison.csv`: active identity keys compared with the pinned runtime.
- `overlapping-variant-review.csv`: overlapping raw variants with differing metadata; these are not labeled contradictory without weekday semantics.
- `summary.json`: compact counts, input pins, reproduction checks, runtime comparison, and rights results.
- `rights-review.md`: DGCA policy and complete 32-page notice/metadata review.
- `integration-candidate-snapshot.json`: compact evidence-only accepted current/future identity snapshot; expired and all row-level evidence remain in the ledgers.
- `checksums.sha256`: checksums of this packet's generated outputs.
