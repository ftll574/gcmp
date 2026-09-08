# Alliance mileage ticketing rules — 2026-09-07

This is the evidence ledger for the pre-console ticketing selector. It covers
every **current full member** in the repository's oneworld, Star Alliance and
SkyTeam catalogs. The machine-readable source of truth is
`public/data/rtw-products/current.json` → `ticketingPrograms`; every record
carries bilingual key rules, a review date and one or more official source URLs.

## Coverage contract

| Alliance | Current full members | Covered airlines | Ticketing-program records |
| --- | ---: | ---: | ---: |
| oneworld | 16 | 16 | 14 |
| Star Alliance | 26 | 26 | 19 |
| SkyTeam | 18 | 18 | 16 |
| **Total** | **60** | **60** | **49** |

Shared loyalty programs are intentionally one record rather than duplicated per
airline: Atmos Rewards covers AS/HA; AAdvantage covers AA/FJ; Miles & More covers
OS/SN/OU/AZ/LO/LH/LX; PhoenixMiles covers CA/ZH; Flying Blue covers AF/KL/RO.

Coverage means **we have an official mileage-ticketing / partner-award rule
reference**. It does **not** mean every airline publishes a mileage RTW product.
Alliance membership, partner redemption and a true RTW award are separate facts.
This 60-airline completion scope is the current three-alliance membership in the
repository, not every commercial airline worldwide. Alliance-level **cash** RTW
fares (oneworld Explorer and Star Alliance Round the World Fare) remain separate
existing products and are not duplicated as airline mileage-program references.

## oneworld

| Airlines | Program | Classification | Planner |
| --- | --- | --- | --- |
| AS / HA | Atmos Rewards | alliance award | reference |
| AA / FJ | AAdvantage | alliance award | reference |
| BA | British Airways Club | multi-carrier award | reference |
| CX | Cathay Asia Miles | multi-carrier award | supported |
| AY | Finnair Plus | partner award; cannot combine two different partner airlines | reference |
| IB | Iberia Club | multi-carrier oneworld award; same origin/final point; max 8 coupons | **supported (new)** |
| JL | JAL Mileage Bank | oneworld Award Ticket; max 8 flights / 7 stopovers / 1 surface; official distance chart | **supported (new)** |
| MH | Enrich | partner award | reference |
| WY | Sindbad | oneworld partner award; partner-marketed-and-operated redemption rules | reference |
| QF | Qantas Frequent Flyer | oneworld Classic Flight Reward | supported |
| QR | Privilege Club | partner award | reference |
| AT | Safar Flyer | oneworld award; two-airline multi-leg ticket prohibited | reference |
| RJ | Royal Club | oneworld partner award | reference |
| UL | FlySmiLes | oneworld partner award | reference |

## Star Alliance

| Airlines | Program | Classification | Planner |
| --- | --- | --- | --- |
| OS / SN / OU / AZ / LO / LH / LX | Miles & More | current World Award Flight | **supported (new)** |
| CA / ZH | PhoenixMiles | Star Alliance award | reference |
| A3 | Miles+Bonus | Star Alliance award | reference |
| AC | Aeroplan | partner award, multi-city/open-jaw capable | reference |
| AI | Maharaja Club | Star partner award; partner awards are single-sector | reference |
| NZ | Airpoints | Star/partner award priced by sector | reference |
| NH | ANA Mileage Club | Star RTW award stopped 2025-06-23 | historical planner product |
| OZ | Asiana Club | Star RTW award during 2026 exit transition | **supported (new, transition)** |
| AV | LifeMiles | Star partner award | reference |
| CM | ConnectMiles | Star partner award | reference |
| MS | EGYPTAIR Plus | Star / mileage award reference | reference |
| ET | ShebaMiles | one-or-more Star member award | reference |
| BR | Infinity MileageLands | Star Alliance World Travel Award | supported |
| SQ | KrisFlyer | Star RTW award discontinued since 2024-05-01; regular Star awards remain | historical reference |
| SA | Voyager | multi-Star award with routing constraints | reference |
| TP | Miles&Go | Star award; max 6 round-trip / 3 one-way segments | reference |
| TG | Royal Orchid Plus | current Star RTW award | **supported (new; network-required backtracking warns for review)** |
| TK | Miles&Smiles | Star partner award | reference |
| UA | MileagePlus | Star partner / multi-city award | reference |

Current Miles & More evidence also reflects the 2026 change: Volare ended and
Miles & More became ITA Airways' official loyalty program from **2026-04-01**.

## SkyTeam

| Airlines | Program | Classification | Planner |
| --- | --- | --- | --- |
| AR | Aerolíneas Plus | SkyTeam award, segment-by-segment pricing | reference |
| AM | Aeromexico Rewards | SkyTeam Classic Award Ticket | reference |
| UX | Air Europa SUMA | SkyTeam partner award | reference |
| AF / KL / RO | Flying Blue | SkyTeam / partner award | reference |
| CI | Dynasty Flyer | SkyTeam Partner Award; cannot cross both Pacific + Atlantic | supported, explicitly **not a true RTW** |
| MU | Eastern Miles | partner award | reference |
| DL | SkyMiles | SkyTeam / partner award | reference |
| GA | GarudaMiles | partner award; connections priced by sector when needed | reference |
| KQ | Asante Rewards | selected SkyTeam SkyAward partners | reference |
| KE | SKYPASS | SkyTeam award with direct-routing / same-country constraints | reference |
| ME | Cedar Miles | SkyTeam round-trip reward | reference |
| SK | EuroBonus | SkyTeam partner award; no >24h stopovers | reference |
| SV | AlFursan | SkyTeam reward tickets | reference |
| VN | Lotusmiles | SkyTeam / partner award, segment pricing | reference |
| VS | Flying Club | partner award with operating-carrier restrictions | reference |
| MF | Egret Club | SkyTeam partner award | reference |

## Planner-support boundary

The UI may show a rule without allowing the product into the validator. A
`plannerProductId` exists only when the structured rules can be represented by
the current engine without inventing missing semantics.

New planner-safe products in this round:

- **Iberia Club oneworld Multi-carrier Award** — max 8 coupons, same start/end,
  and the two-airline combination rule are directly representable.
- **Miles & More Star Alliance World Award Flight** — same-country return,
  one global direction, Atlantic + Pacific, max 10 flights / 7 stopovers,
  10 days–12 months are directly representable.
- **JAL Mileage Bank oneworld Award Ticket** — max 8 flights / 7 stopovers,
  one surface sector, per-city visit/stopover limits, Japan-origin no-stopover,
  origin-city/origin-country return restrictions and the two-airline minimum
  are now explicit validator primitives. Surface sectors always consume one
  stopover and are excluded from priced distance. JAL's official 10-band
  1–50,000-mile Economy/Business/First chart is wired into automatic pricing;
  mixed cabin prices at the higher booked cabin per JAL's published rule.
- **Thai Royal Orchid Plus Star Alliance RTW** — 3–10 stopovers, one open jaw,
  per-city/per-country caps, no origin-country stopover, same-country return and
  duration limits are automated. A geometrically mixed direction is a WARNING,
  not an automatic pass/fail, because Thai permits backtracking only when the
  Star Alliance network actually requires it and route geometry cannot prove
  that necessity.
- **Asiana Club Star Alliance RTW** — direction now uses IATA Traffic Areas:
  reversals inside one Area are ignored while a reversal between Areas fails.
  Same-country return, Pacific + Atlantic crossings, 7-stopover / 2-per-country
  limits and the 10-day minimum are automated. Departures after 2026-12-16 fail
  the published transition travel-date window.

Miles & More also publishes current fixed World Award mileage of 195,000 in
Economy, 400,000 in Business and 540,000 in First. Those values remain visible
in the ticketing reference but are deliberately **not** wired into automatic
mixed-cabin pricing yet: the public rule page does not state how a World Award
containing different travel classes should be priced, while the planner's
current mixed-cabin pricing engine uses a highest-cabin rule.

Remaining manual-review boundaries after promotion:

- **JAL:** the official page says some surface-sector arrangements can still be
  rejected and gives an example rather than a complete routing algorithm; GCMP
  does not infer additional surface geometry rules from that example.
- **Thai:** whether a particular reversal is genuinely required by the Star
  Alliance network remains a manual check; the validator surfaces a warning.
- **Asiana:** the transition notice has carrier-specific ticketing deadlines and
  also requires travel completion before integration. GCMP has departure dates,
  not arrival timestamps or a ticket-issue date, so it enforces no departures
  after 2026-12-16 and keeps final completion / ticketing timing as a recheck.

The permanent regression is
`tests/lib/rtw/ticketing-program-coverage.test.ts`: missing a current member,
crossing an airline into the wrong alliance, duplicating coverage, or pointing a
reference at a nonexistent planner product fails the test suite.
