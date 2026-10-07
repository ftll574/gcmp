# Air India Express DGCA evidence integration supplement v1

This supplement records integration provenance for the immutable reviewed packet in `../reviewed-output/`. The packet itself and captured PDF/source manifest are preserved byte-for-byte. Put any later supplement in a new versioned directory; do not edit `reviewed-output/`.

## Frozen inputs

- Reviewed snapshot: `../reviewed-output/integration-candidate-snapshot.json`, SHA-256 `247dff164caf81db93190487b3b05f2034edcc332b5f63c771de33e03a8bc926`.
- Reviewed checksum list: `../reviewed-output/checksums.sha256`, SHA-256 `899c52515f36adb8d96baade015b4e3b24b20bec27ebfea3ad82d1bf46c2319a`.
- Captured PDF: `../source/AirIndiaExpressLimited_SS_2026.pdf`, 1,155,068 bytes, SHA-256 `da2dd03095df387cf9b914f192b317d3eb530961d52e4fd7368ca9c56c3d6340`.
- Source provenance manifest: `../source/source-manifest.json`, SHA-256 `dbbf9990a615e65e90de315d911a2eb7ce8d047f240d1554751aa3ca76bb828d`.
- The builder and independent verifier check the exact reviewed outputs listed in `checksums.sha256`, the captured PDF, the source manifest, pinned current airport/runtime/flight-number layers, and the packet's record joins.

## Review reconciliation

The checksum list also pins historical inputs outside the reviewed output directory. Its `MAPPING_EVIDENCE:task-37/validation-summary.json` row expects SHA-256 `b45cbddeef33739579c6292420c7360108e8e4eff36fd1879ae2e6ad7250bbaa`. The accessible file at `task-37/review/validated/validation-summary.json` and its retained copies hash to `6e8193a68692a87036555d45fb5b7bfe222d695bdbb51734b267b4a26c15a32b`; the preserved `task-37/review/validated/manifest.sha256` also records `6e8193a...`. The expected historical preimage was not available in the current workspace. This external historical-pin discrepancy is recorded without altering the review packet. Reviewed output files, source PDF, source manifest, current airport catalog, and current flight-number layer match their recorded hashes. The release builder separately protects the exact current main runtime and independently rechecks current IX/designator matches.

## Catalog semantics

The source contributes 433 directional IX identities and 940 current/future schedule variants, yielding 3,364 identities and 5,730 variants in the combined catalog. Separately, it retains 1,051 accepted current/future movement rows, 693 expired rows, and 2,458 all-validity overlapping variant pairs. The 129 current/future pairs with equal raw frequency and differing raw clock fields remain timing flags, not identity conflicts.

Source prefix `IX` and operator code `AXB` remain distinct; no Air India identity, alliance membership, confirmed route, UTC occurrence, date availability, bookability, or actual-operation claim is added. Raw clocks, raw frequency, unknown timezone, variant dates/status, and physical page/row/station lineage are preserved. Each one-sided movement row supports only its directed leg.

DGCA attribution and its website policy link are visible in the directory. The policy allows accurate, non-misleading reproduction with prominent attribution subject to identified third-party material; review found none marked in the 32-page PDF. No Creative Commons or public-domain license is claimed.
