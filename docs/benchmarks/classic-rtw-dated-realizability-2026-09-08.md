# Classic RTW dated realizability — EVA official example, November 2026

This extends the structural benchmark in
`docs/benchmarks/classic-rtw-itineraries-2026-09-08.md` by asking a stricter
question: can a current RTW example be assigned future dates and exact
operating flight numbers all the way around the world without leaving GCMP's
confirmed route universe?

It still does **not** claim award-seat inventory. "Realizable" here means a
source-backed scheduled operating flight exists on the chosen date, the
carrier/pair is confirmed-operating in GCMP's route graph, the date sequence is
connectable at calendar-day level, and the full itinerary remains valid under
the RTW product rules.

## Selected current itinerary

The airport chain is EVA Infinity MileageLands' own Star Alliance World Travel
Award example:

`TPE → NRT → LAX → EWR → LHR → FRA → SIN → BKK → TPE`

The dated November 2026 realization is:

| Date | Operating flight | Sector | Local schedule used |
| --- | --- | --- | --- |
| 2026-11-02 | BR198 | TPE → NRT | 08:50 → 12:55 |
| 2026-11-04 | NH6 | NRT → LAX | 17:00 → 09:50 |
| 2026-11-06 | UA2743 | LAX → EWR | 07:10 → 15:29 |
| 2026-11-08 | UA14 | EWR → LHR | 20:00 → 08:25 (+1) |
| 2026-11-10 | LH901 | LHR → FRA | 09:30 → 12:05 |
| 2026-11-12 | LH780 | FRA → SIN | 21:40 → 17:05 (+1) |
| 2026-11-15 | TG404 | SIN → BKK | 12:25 → 13:45 |
| 2026-11-18 | BR202 | BKK → TPE | 14:40 → 19:15 |

Every stop has at least one full day before the next departure, so the fixture
does not depend on unmodeled minimum-connection-time assumptions.

## Evidence policy

The fixture is `tests/fixtures/classic-rtw-dated-eva-2026-11.json`. Airline
publications are preferred for route/designator evidence and are cross-checked
with an industry timetable when a seasonal effective window or exact local
clock is needed.

Primary airline references include:

- EVA's TPE-NRT published timetable page.
- ANA's Winter 2026/27 international route table, which lists NRT-LAX NH6 daily.
- Lufthansa's LHR-FRA and FRA-SIN flightplan pages, which list LH901 and LH780.
- EVA's BKK-TPE booking surface for the selected travel period.

Seasonal exact schedules for BR198, NH6, UA2743, UA14, LH780, TG404 and BR202
are cross-checked against `flight.info` route/flight schedule pages. This is
schedule evidence, not an award-availability source.

## GCMP result

`tests/benchmarks/classic-rtw-dated-realizability.test.ts` requires all of the
following to remain true:

1. all eight dated exact flight identities are present and source-backed;
2. every next departure is on or after the prior arrival calendar date;
3. every carrier + directional pair exists as **confirmed operating** in
   `runtime-current.json` (provider-listed does not pass this benchmark);
4. the resulting dated `Leg[]` passes the EVA World Travel Award validator;
5. the validator still sees 8 flight sectors, 7 stopovers, a 17-day trip,
   eastbound travel, and both Atlantic/Pacific crossings.

This moves the product benchmark from "the classic route is structurally
possible" to "there is at least one concrete future scheduled-flight
realization of that route." The remaining step toward a booking workflow is
award inventory: GCMP still must not infer that these exact flights have
redeemable seats merely because they are scheduled.
