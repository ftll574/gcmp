# Independent IndiGo DGCA Packet Validation

As of **2026-10-07**. This is a review-only evidence snapshot; no source packet, GCMP repository, runtime data, account, or remote was modified.

## Source and reproduction

- Captured DGCA PDF: INTERGLOBE AVIATION LTD_2026.pdf, 4,386,991 bytes, 116 pages, SHA-256 49202673b590051beef3873127cecf171bea73c67ac1962d0031ccbb109bcd85. No fresh download was made.
- The pinned comparison runtime is commit f472092b0324df7b2d744596709c69f27cbbad55, SHA-256 aa90283d52015b1b418c3840252cb34152f9ed577a3e0766291935b92b151537. The captured parser was rerun in this workspace; all 13 CSV outputs match byte-for-byte and the extraction summary matches semantically after normalizing only its input-path field. All 34 packet manifest entries verified without mismatch. A separate audit then rebuilt row identities, physical lineages, route-pair comparisons, and overlap conflicts.
- All 6,600 parsed row strings match the separately extracted PDF layout text exactly; reconstructed column values match all 6,600 lines. A separate TSV heading pass found all 98 station-section labels, including page continuations, and assigned 0 rows to the wrong section.
- The source has 3,337 arrival-only and 3,263 departure-only rows. There are no rows with both or neither movement endpoint. The 6E prefix and IGO operator code remain separate source fields; flight digits were not integer-normalized. No leading-zero designators occurred in this file.

## Classification and runtime match

| Result | Count |
|---|---:|
| Original table rows | 6,600 |
| Directed schedule variants after counterpart deduplication | 5,110 |
| Accepted identity-only variants, current/future | 3,729 |
| Held variants for unresolved station codes | 0 |
| Expired variants | 1,381 |
| Complete flight-number/direction keys across all validity | 2,297 |
| Exact runtime flight-number/direction matches | 0 |
| Accepted current/future new identity keys | 2,218 |
| Accepted new keys with route-pair context overlap | 996 |

The route-pair overlaps are context only. 1,039 keys across all validity windows overlap an ordered pair in the runtime; the additional 43 overlaps are expired-only. They do not confirm a flight designator, carrier/operator, schedule, or actual operation.

The packet-only map had 2 unresolved labels (Jalandhar and Pondicherry) and held 6 current/future variants. The separate source review maps Jalandhar to Adampur/Jalandhar City Airport, IATA AIP, using IndiGo's directory; AAI eAIP independently confirms ICAO VIAX and the existing catalog has the matching Adampur entry. It maps Pondicherry/Puducherry to the existing catalog entry PNY/VOPC, supported by AAI airport/tender evidence. All 6 source rows have exact page/physical-row lineage and layout text; final station holds are 0. Purnia's existing PXN mapping from 8 DGCA counterpart rows is corroborated by IndiGo's Purnea page and AAI eAIP lists VEPU. PXN is absent from the reusable catalog, so it remains a source-only endpoint across 10 final variants. No airport coordinates were inferred; an AAI airspace-circle center is not used as an airport reference point.


## Airport-source supplement

The additional airport pages were reviewed as limited factual identity corroboration; no page prose or imagery was copied into the evidence ledger and no bulk airline-page scrape was performed. IndiGo's directory gives Purnea/PXN and locates it at Chunapur; AAI eAIP GEN 2.4 lists PURNEA/VEPU; PIB reports the civil terminal inauguration and first commercial flight on 15 September 2025. This corroborates the PDF-counterpart PXN mapping without changing schedule classification. PXN is absent from the pinned airport catalog, so it remains a source-only endpoint; do not create a runtime airport point. Coordinates remain unknown, and an AAI airspace-circle center is not treated as the airport reference point.

IndiGo's Adampur page says “Adampur – AIP, Jalandhar City Airport”; AAI eAIP GEN 2.4 lists ADAMPUR/VIAX. The pinned catalog has AIP / Adampur Airport / VIAX. This maps the DGCA “Jalandhar” station label to the existing catalog airport for two identity-only variants. No coordinates are imported or asserted as primary-source verified. PIB's 31 January 2026 page announces that the PM would unveil a new Adampur name on 1 February; that advance notice alone does not establish the unveiling occurred, so no rename is applied.

AAI's airport page identifies Puducherry Airport; the user-supplied AAI tender explicitly crosswalks Pondicherry/Puducherry to PNY/VOPC. The existing catalog has one matching Pondicherry Airport entry with the city alias “Puducherry (Pondicherry),” IATA PNY, ICAO VOPC. The four exact-lineage DGCA rows resolve to this existing airport alias; no new airport identity is introduced. Catalog coordinates remain catalog values, not independently sourced airport reference coordinates.

These six airport-resolved source movements do not add distinct flight-number/direction keys: all six keys already appear from other DGCA station sections. Two Puducherry rows exactly match Hyderabad counterpart variants and are merged with their source lineages, leaving a net increase of four accepted directed schedule variants. The 2,297 complete keys, 2,218 accepted new keys, 0 exact matches, and 996 accepted route-pair context overlaps remain unchanged.

## Lineage correction and schedule variants

The source packet's legacy pN:rowM reference is not globally unique: 399 references recur across station sections, creating 546 duplicate excess rows; the largest collision group has six rows. Seventy-four flagged physical rows therefore have ambiguous legacy references. This does not change identity counts, but those references alone cannot locate a unique source line.

The review ledger repairs lineage with page, physical row ordinal, station section, printed row number, and a stable source-row SHA-256. After external station mapping, 2 exact Puducherry/Hyderabad counterpart variants are merged, leaving 5,110 final variants from 6,600 source movements. Every source row is represented exactly once, with no row-count, route-key, or source-side mismatch. The packet-only baseline was 5,112 variants. No variant lost a source row or was incorrectly marked one-sided. All 562 packet-baseline flagged rows matched their PDF layout lines exactly. After the six airport alias mappings, six rows are cleared from the final hold/conflict set; the final 556 flagged rows still match their PDF layout lines exactly. The original 562-row set is preserved as packet-baseline-flagged-source-rows.csv.

The conflict check independently recomputed all 365 overlap pairs with no pair or field mismatch: 364 aircraft-type differences and 1 arrival-clock difference. The overlap dates use the separate AAI weekday convention only for local-calendar triage; the DGCA PDF gives no frequency legend or timezone. Variants remain preserved. The 6E499 VNS-to-BLR arrival clocks 23:45 and 00:10 are both retained and flagged; its identity remains accepted while its time field is held. All other clocks are still raw-only with timezone unverified; no UTC inference or connection timing follows.

## Rights and visible PDF review

The captured DGCA Website Policy permits free reproduction if accurate and not derogatory or misleading, with prominent source acknowledgement, excluding material identified as third-party copyright. The captured policy contains no non-commercial-only restriction. The packet makes no open-data license claim. Text notice scanning found no rights terms on all 116 pages; pdfimages reported no embedded raster images; rendered pages 1, 2, 8, 23, 61, 74, and 116 show the schedule table and station headings without a third-party content mark.

The PDF Producer metadata does name iText 7.1.4 and says ©2000-2018 iText Group NV, with DGCA licensed-version wording. That is PDF-generation-software provenance, not a marking that identifies the schedule table or another reproduced content item as third-party copyrighted. The captured policy and the PDF metadata are preserved in the packet.

## Integration assessment

The accepted GCMP OfficialServiceSchema is not an honest direct fit. It requires a two-character carrier, digits-only flightNumber, and decoded daysOfWeek; DGCA prints 6E 123 in a separate Flight No. column and the three-character code IGO in Operator Code, and gives no weekday legend. Mapping IGO to carrier fails the schema, while mapping 6E to carrier would assert a carrier role not established by this source. Dated-flight/reference schemas require dated occurrences, which this source cannot establish without timezone/date semantics. The CAA published-timetable shard demonstrates non-selectable evidence fields with unresolved carrier role, but it is tied to Taiwan CAA dataset IDs, date-pattern rules, and the OGDL Taiwan license, so it cannot be reused for DGCA.

The minimal path is a DGCA-specific evidence-only adapter (or a generic evidence-schema extension) that preserves the raw designator, operator name/code, directional airport pair, raw frequency and clocks, effective dates, station-mapping basis, PDF URL/hash, corrected source lineages, and conflict IDs. The CAA shard can inform the non-selectable state shape but should not be used as-is. Keep carrier role unresolved, timezone null, actual operation unverified, and selectable false. After the cited airport-code supplement and exact counterpart deduplication, the review snapshot has 3,729 accepted identity-only variants, no unresolved-station holds, and 1,381 expired variants (5,110 final variants). The packet-only baseline remains 3,725 / 6 / 1,381 over 5,112 variants. The six newly resolved source movements include two exact counterpart rows that are merged into existing variants; these airport mappings do not establish actual operation. Preserve expired variants for audit. This review adds no code or runtime records.

## Deliverables

- identity-ledger.csv: all 5,110 final accepted, held, and expired variants with stable record hashes and repaired source lineages.
- flagged-source-rows.csv: final 556 conflict source rows with exact raw PDF lines. packet-baseline-flagged-source-rows.csv preserves the packet-only 562-row set before the external mapping supplement.
- integration-candidate-snapshot.json: complete evidence-only candidate snapshot with the exact runtime counts and limitations.
- station-mapping-review.csv, airport-mapping-supplement.csv, and validation-summary.json: mapping and reconciliation checks, including provenance and unknown ICAO/coordinate fields.
- manifest.sha256: hashes for these deliverables.
- Reproduce from the workspace root using only the already captured PDFs, then run the review steps:

```sh
python3 /Users/zhenyu/Documents/Codex/2026-10-07/task-28/scripts/parse_dgca_indigo.py \
  --pdf '/Users/zhenyu/Documents/Codex/2026-10-07/task-28/evidence/source/INTERGLOBE AVIATION LTD_2026.pdf' \
  --runtime /Users/zhenyu/Documents/Codex/2026-10-07/task-17/gcmp/public/data/route-network/runtime-current.json \
  --airport-catalog /Users/zhenyu/Documents/Codex/2026-10-07/task-17/gcmp/public/data/airports.json \
  --frequency-legend-pdf /Users/zhenyu/Documents/Codex/2026-10-07/task-28/evidence/source/aai-varanasi-schedule.pdf \
  --as-of 2026-10-07 \
  --expected-runtime-sha256 aa90283d52015b1b418c3840252cb34152f9ed577a3e0766291935b92b151537 \
  --expected-commit f472092b0324df7b2d744596709c69f27cbbad55 \
  --out review/independent-reproduction
python3 review/reproduce_review.py --reproduction review/independent-reproduction --out review/validated
python3 review/apply_airport_mapping_supplement.py
```
