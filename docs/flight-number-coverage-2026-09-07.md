# Flight-number coverage expansion — 2026-09-07

## Purpose

Make `flight number later` an escape hatch rather than the normal RTW planning
path. Exact flight designators remain evidence-scoped: a number may be known
without a complete timetable, and route/catalog silence never means a flight is
unavailable.

## Evidence tiers

1. `public/data/schedules/current.json`: directional carrier schedule records
   with exact flight designators (JX / BR / CI).
2. `OfficialService`: airline-publication evidence with exact designator plus
   effective window / operating weekdays.
3. `FlightNumberReference`: airline-publication evidence with exact designator
   but no invented weekday/date claim. These are selectable and later rechecked
   by the date/time workflow.

All three tiers require the exact operating carrier and ordered airport pair.
Reverse direction, marketing codeshare and alliance membership are not flight-
number evidence.

## Coverage snapshot

- Legacy schedule designators: **223**
- Official-service designators: **53**
- Official-reference designators: **579**
- Unique official designators: **632**
- Combined selectable designators: **855**

Official-layer carrier counts at this snapshot:

| Carrier | Exact designators |
| --- | ---: |
| SQ | 84 |
| RJ | 62 |
| OZ | 60 |
| CX | 48 |
| AY | 38 |
| AI | 38 |
| MH | 37 |
| LX | 36 |
| NZ | 33 |
| TG | 32 |
| JL | 26 |
| NH | 19 |
| LH | 18 |
| QR | 17 |
| OS | 14 |
| QF | 12 |
| TP | 12 |
| BA | 10 |
| AC | 10 |
| AA | 7 |
| TK | 4 |
| LO | 4 |
| OU | 3 |
| UA | 2 |
| SN | 2 |
| AS | 2 |
| FJ | 2 |

Notable planning improvements include TPE→SIN SQ877, the JAL North America
gateway schedule, Lufthansa FRA/MUC long-haul designators, Cathay HKG↔SEA,
Finnair HKG↔HEL / HEL↔LHR, Thai BKK↔AMS, Qatar HND↔DOH, and the current Asiana
schedule. The Royal Jordanian September timetable now contributes **52**
directional flight-number reference rows / **62** exact designators across
high-value AMM links including LHR, JFK, ORD, DFW, DTW, IAD, FRA, CDG, VIE,
ZRH, BKK and DOH. Special-date/ADJ rows and the timetable's marked codeshare
cases are not generalized. All 32 OZ directional routes currently represented
in the sourced route-network catalog now have exact flight-number references.

Air India's current non-stop USA/UK page adds **18 directional rows / 22 exact
designators**: DEL↔SFO/JFK/EWR/LHR, BOM↔SFO/JFK/EWR/LHR, and BLR↔SFO. Four of
those directions (BOM↔SFO and BLR↔SFO) are newer than the static AI route
catalog but remain selectable because exact fresh flight-number references are
first-class next-leg evidence; they still carry `scheduleStatus = unknown`
until the date workflow confirms operation.

The later evidence-wiring tranche closes several catalog integration gaps
without inventing new routes: SN501/SN502 now cover both sourced Brussels-JFK
directions, AS68/AS680 cover both sourced Alaska SFO-SEA directions, and
FJ890/FJ891 cover both sourced Fiji Airways NAN-DFW directions. LOT's current
2026 San Francisco publication contributes LO35/LO37 outbound and LO36/LO38
return, while Croatia Airlines' operated-flight list contributes OU380,
OU384 and OU300 only on the exact directions independently represented by the
route catalog. No carrier-prefix rule is introduced.

Hawaiian is intentionally different: the current Alaska status evidence shows
AS831/AS832 marketing designators operated by Hawaiian. The present leg model
cannot preserve a marketing designator separately from the operating carrier,
so GCMP deliberately does **not** manufacture HA831/HA832 just to raise the
coverage count.

## Remaining gaps

Against the current curated route catalog, the largest exact-flight-number
gaps are now AI (72 uncovered directions), RJ (71), AT (54), NZ (44), ZH (26),
A3 (25), OU (19), LO (16) and WY (10). This is **not** a global denominator:
the route catalog itself remains curated-not-complete. Additional numbers
should be filled only when a current source supports the exact operating
designator; old timetables, reverse inference and marketing-only codeshares are
not accepted merely to increase the count.
