# Flight-number coverage audit — 2026-09-12

This is the first evidence-backed tranche for phase 2 task `t_c08244ba`.

## Scope and denominator

The repeatable audit is:

```bash
npm run coverage:flight-numbers -- 2026-09-12 --summary
```

Without `--summary`, the command also emits the route-level ledger. Every active
published directional route for the 60 current oneworld, Star Alliance and
SkyTeam members is classified as:

- `confirmed`: route has route-level confirmed `flightNumbers` evidence;
- `candidate-only`: only `flightNumberCandidates` are available;
- `missing`: no number evidence is available;
- and separately `operating` or `provider-listed` according to runtime carrier
  identity evidence.

The denominator is **only the active published GCMP runtime alliance catalog**.
Global coverage remains `unknown`: GCMP does not have a complete,
operator-resolved global directional-route denominator for all 60 active
alliance members. The audit therefore never presents the runtime percentage as
global completeness.

Taiwan is derived from airports whose catalog country is `TW`. The bounded hub
slices deliberately reuse the existing route-freshness benchmark instead of
inventing a larger denominator:

- oneworld: HKG, LHR, JFK, LAX, NRT
- Star Alliance: NRT, LAX, SFO, EWR, FRA, IST, SIN
- SkyTeam: ICN, LAX, ATL, CDG, HAN

The JSON report includes the same metrics for each of the 60 carriers, so the
remaining gap is directly sortable without relying on airline prefix,
codeshares, marketing designators, historical services or empty searches.

## Before / after

As of 2026-09-12:

| Slice | Before confirmed | After confirmed | Before candidate-only | After candidate-only | Missing |
| --- | ---: | ---: | ---: | ---: | ---: |
| All active runtime alliance routes | 14,974 | 14,976 | 15,129 | 15,127 | 0 |
| Taiwan origin/destination | 297 | 299 | 111 | 109 | 0 |
| China Airlines (CI) | 139 | 141 | 119 | 117 | 0 |
| oneworld bounded hubs | 801 | 801 | 332 | 332 | 0 |
| Star bounded hubs | 1,740 | 1,740 | 723 | 723 | 0 |
| SkyTeam bounded hubs | 1,147 | 1,147 | 403 | 403 | 0 |

The all-route denominator is 30,103 active routes on the audit date. Taiwan is
408. This tranche converts two existing **operating candidate-only** routes to
confirmed; it does not change the route denominator or provider-listed count.

## Confirmed tranche

Source: China Airlines official 2026 summer timetable/travel-fair page
`https://2026ste.china-airlines.com/`, checked 2026-09-12.

| Carrier | Direction | Confirmed number | Effective window represented in GCMP |
| --- | --- | --- | --- |
| CI | TPE → AMS | CI73 | 2026-09-01 through 2026-10-23 |
| CI | AMS → TPE | CI74 | 2026-09-02 through 2026-10-24 |

The operator-owned page identifies the exact carrier, direction, endpoints,
flight number and dated operating window. The correction is therefore not an
airline-prefix inference. The page also lists date-specific extra flights
CI2073/CI2074; they are **not** promoted across the whole route window because
the current route-level model cannot attach a separate effective-date set to
each flight number. CI2074 remains candidate evidence rather than being
overstated.

## Remaining unknown / candidate ledger

After this tranche, 15,127 active runtime routes remain candidate-only. Of
those, 2,764 are currently operating-identity routes and 12,363 are
provider-listed. Taiwan retains 109 candidate-only routes: 33 operating and 76
provider-listed. These rows remain explicitly in the audit ledger until
route-level operating identity and flight-number evidence are strong enough to
promote them.

The largest remaining candidate-only carrier gaps include MU (1,090), AA
(1,087), UA (903), CA (763), LH (638), DL (603), AC (525), IB (473), TK (463)
and ZH (387). These are runtime-catalog gaps, **not** claims about global airline
completeness.

Through-flight modeling remains governed by physical nonstop sectors. This
work does not recreate the removed EVA TPE–Europe endpoint-skipping edges;
existing BR75/76 and BR67/68 regression coverage continues to require the BKK
intermediate stop.
