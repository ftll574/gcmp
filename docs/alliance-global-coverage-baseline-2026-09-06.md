# Three-alliance global route coverage baseline — 2026-09-06

The user has set the long-term schedule/operator target to **all directional nonstop routes operated by current oneworld, Star Alliance and SkyTeam member airlines**. This baseline makes that target measurable without pretending the current curated route catalog is a complete global denominator.

FlightConnections is used as an external completeness/QA benchmark only. Its public alliance route-map pages currently report roughly 925 oneworld destinations, 1,197 Star Alliance destinations and 970 SkyTeam destinations in September 2026. Its Terms of Service prohibit automated scraping, data extraction and bulk downloading, so GCMP must not implement a FlightConnections scraper or bulk-ingestion job. Production route rows still require a source that GCMP is permitted to ingest; FlightConnections may be used to identify omissions and audit whether the resulting network looks plausible.

## Coverage semantics

`npm.cmd run coverage:alliances -- YYYY-MM-DD` reads only existing checked-in evidence:

- `public/data/alliances/current.json`
- `public/data/route-network/current.json`
- `public/data/schedules/current.json`
- `src/data/official-schedules.json`

No supplier request, TDX authentication, AeroDataBox request or inferred reverse route is made.

Three different measurements are intentionally separated:

1. **Global route coverage** — currently `unknown`, because `route-network/current.json` explicitly declares `curated-not-complete`. A percentage is forbidden until the full directional route denominator is established.
2. **Member-airline route-evidence coverage** — how many active alliance member airlines have at least one source-backed directional route in the route catalog, active chart-verified schedule catalog, or airline-owned official publication catalog.
3. **Known-route schedule coverage** — among the currently known directional routes, how many have active chart-verified or airline-publication date/weekday schedule evidence. This is useful for internal prioritization but must never be presented as global coverage.

`route-network/current.json` also records carrier-level universe readiness. `partial` means useful source-backed evidence exists but the carrier denominator is not established; only `complete` may later unlock a true carrier route-coverage denominator. There is deliberately no "near complete" state. A `complete` row now must carry `directionalRouteDenominator`, and schema validation rejects it unless that number exactly equals the active published directional rows represented for that carrier on the universe `asOf` date. `partial` rows are forbidden from claiming a denominator. Existing oneworld/Star work has closed carrier presence, while SkyTeam now enters the same ledger rather than being outside the target. **0 carriers are `complete`**; carrier-presence completeness must not be confused with complete carrier route universes.

### SkyTeam

- 18 active member airlines are now part of the same coverage target and per-carrier gap ledger.
- The initial three-alliance ledger is intentionally expected to show large SkyTeam gaps because route-network expansion previously targeted only oneworld + Star Alliance.
- SkyTeam route presence, exact-flight coverage and carrier-universe completeness use the same evidence rules as the other two alliances; membership itself never creates a route.

## Baseline at 2026-09-06

### oneworld

- 16 active member airlines.
- **16/16 have route evidence: 100.0% member-airline route-evidence coverage.**
- 12 active member carriers have explicit `partial` universe metadata; 0 have `complete` universe metadata. The remaining four already had route evidence before carrier-universe metadata was introduced; absence of a metadata row is not a `complete` claim.
- **271 known active directional routes.**
- 2 of those 271 have active exact airline-publication schedule evidence on 2026-09-06: JL HND→JFK and JFK→HND, backed by the JAL Summer-2026 North America timetable with exact JL flight identities.
- Known-route schedule coverage: **0.7% of the known partial universe**, not global coverage.
- Missing carrier route evidence: **none**.

### Star Alliance

- 26 active member airlines.
- **26/26 have route evidence: 100.0% member-airline route-evidence coverage.**
- 23 active member carriers have explicit `partial` universe metadata; 0 have `complete` universe metadata. BR/LH/UA include evidence predating the carrier-universe metadata rollout and remain non-complete unless explicitly promoted later.
- **452 known active directional routes** after the A3 / OZ, SQ / OU, LX, TG / TP and OS / LO route-first expansions, unioning route observations, active chart-verified schedules and the airline-owned official schedule catalog.
- 40 of 452 known routes have active exact schedule evidence: **8.8% of the known partial universe**, not global coverage. The lower percentage reflects useful route discovery advancing ahead of dated schedule evidence, not a regression in verified schedules.
- Missing carrier route evidence: **none**.

The NH increase fixes a prior data-silo omission: `src/data/official-schedules.json` already contained bounded ANA Summer/Winter 2026 exact route + flight-number publications, but the coverage command previously read only `public/data/schedules/current.json`. The ledger now unions both schedule catalogs. It also preserves ANA's explicit Summer-2026 suspension of NRT↔TPE instead of counting that pair as active. SQ now contributes a bounded source-backed SIN-origin nonstop subset plus the independently evidenced TPE→SIN direction; no flight-number or weekday schedule has been inferred from route/network text.

QR now contributes eight independently directional high-value hub routes: DOH↔HKG, DOH↔NRT, DOH↔LHR and DOH↔JFK. Each direction is backed by a current Qatar Airways-owned route page rather than inferred from its opposite. Qatar Airways also publishes a broad network map/schedule poster, but the reviewed April edition is explicitly valid only through 2026-06-15 while the later Summer-2026 announcement describes 150+ destinations through 2026-09-15 without exposing a complete operator-resolved airport denominator in the evidence currently checked into GCMP. QR therefore remains `partial`, not `complete`.

QF adds twelve directional nonstop routes from the current Qantas international network: SYD↔LAX, SYD↔SIN, SYD↔HND, SYD↔HKG, SYD↔SFO and SYD↔JNB. The source uses explicit bidirectional "Between" route wording and separately labels one-stop services with `via`; those one-stop relationships are not inserted as nonstop edges. In particular SYD→LHR is not added because the current page describes Sydney–London via Singapore. This source still does not establish the complete QF-operated domestic + international denominator, so QF remains `partial`.

IB adds the explicitly announced MAD↔EWR direct route and remains `partial`; the checked publication does not establish Iberia's complete directional network. TK adds separately evidenced TPE↔IST and IST↔JFK hub pairs. Turkish Airlines' broader city-to-city sitemap is intentionally not treated as a nonstop universe because it includes connecting itineraries.

AC adds selected Summer-2026 route evidence from an Air Canada-owned network announcement. Six seasonal services also enter the airline-publication schedule catalog with exact identity, weekdays, times and finite validity: AC932/933 YUL↔CTA, AC924/925 YUL↔PMI and AC942/943 YYZ↔BUD. The same source names additional year-round YYZ↔PVG and YVR↔BKK service, but GCMP keeps those as route evidence only because the publication does not supply a finite end date; no synthetic schedule horizon is invented.

MH adds 20 selected KUL outbound directions from Malaysia Airlines' current Chef-on-Call terms. The source explicitly says the listed sectors are selected **Malaysia Airlines-operated** flights and supplies IATA airport codes, so the catalog can safely retain high-value KUL spokes including TPE, HKG, NRT, ICN, LHR, CDG, DOH, AKL and major Australian/Asian points. The page is deliberately a selected meal-eligible subset, so reverse directions are not inferred and MH remains `partial`.

NZ now has 68 source-backed directional route rows after a route-first expansion using Air New Zealand's current regional network pages. Current Australia, Asia, Pacific and North America nonstop routes enter the planning catalog even when exact operating weekdays are not yet known; they remain `scheduleStatus=unknown` until dated evidence is layered on top. Explicit future routes retain `effectiveFrom` boundaries (for example AKL→WSI from November 2026 and CHC→PER/NRT from December 2026), while paused Chicago remains absent. Current airline-owned inbound/New York/Vancouver evidence also establishes selected reverse directions rather than inferring them. NZ remains `partial` because every domestic direction and recurring seasonal window is not yet represented.

AI adds 100 active directional route-only rows from Air India's official February-2026 international nonstop connectivity map plus later official DEL↔HAN and BOM↔HND additions. The map is treated as a broad route-universe snapshot, not a September dated timetable. A current Air India homepage advisory says all Air India flights to Middle East destinations are suspended; 26 directional Middle East pairs from the older map are therefore retained as explicit `suspended` rows and do not contribute to current route coverage or next-leg suggestions. AI remains `partial` because the source is not a complete current domestic + international denominator and route-only rows do not claim operating dates.

LX and OS now use current Lufthansa Group airline flightplan pages specifically because those pages expose exact operating rows and can surface partner-operated marketing rows. SWISS contributes the previously documented ZRH/GVA subset. Austrian now has **14 active known directional routes**: VIE↔NRT/BKK plus VIE↔BOS/ORD/IAD/JFK/EWR from explicit OS31/32, OS45/46, OS41/42, OS35/36 and OS37/38 flightplan rows. The Tokyo page separately labels HND marketing rows OS8563/8564 as NH-operated, so VIE↔HND remains deliberately absent. New York/Washington city labels are resolved only to the exact airports shown by the flightplans; no generic metro-airport expansion occurs. These live pair pages remain route/operator evidence rather than a complete denominator or recurring dated timetable.

The later SWISS continuation expands LX from 4 to **18 directional routes**: ZRH↔HKG/NRT/SIN/GVA/JFK/EWR/MIA/BOS plus GVA↔JFK. The same current flightplan surfaces explicitly label CX-, SQ- and UA-operated marketing rows, and the Zurich-Geneva page also exposes SBB rail-marketed LX rows; those partner/rail rows remain excluded. These pair pages still do not form a complete carrier-wide network index, so LX remains `partial` and no recurring dated schedule horizon is invented.

TG adds BKK↔AMS from Thai Airways' official Amsterdam route publication, which publishes TG936/TG937 and limits the offer to TG flights operated by THAI. BKK→TPE is added only by combining explicit nonstop/THAI-operated wording with a separate current route page that resolves BKK-TPE. A later current Early Escape 2026 publication is stronger for broad route-first use: it explicitly says the listed Bangkok services are non-stop and restricts eligibility to TG 3-digit operating flights only for travel 2026-09-01 through 2026-11-30. Intersecting that source with THAI's current exact-airport Bangkok route surface safely adds BKK→ICN/NRT/HND/KIX/PVG/HKG/SIN/LHR/CTS/PEK/CAN without city-level airport expansion. Reverse directions are still not inferred. TG is now **14** active known directional routes and remains `partial`.

TP expands from 5 to **12** active known directional routes using TAP's current page explicitly labeled **Direct Non-Stop Flights**. Only exact airport-coded directions visibly present on that surface are added, including GRU→LIS, FNC→LIS, GIG→LIS, NBJ→LIS, MAD→LIS, LIS→GIG and LIS→ORY. The surface is useful bounded route evidence but is not asserted to be an exhaustive carrier-wide denominator, so TP remains `partial`.

LO now has **18 active known directional routes**. Current airline-owned launch publications and LOT's current directional inaugural-flight surface establish WAW↔ALA, GDN↔BRU/OSL and KRK↔FCO/BCN/MAD in addition to the earlier Warsaw routes. SFO→WAW is now independently directional and the WAW↔SFO pair retains the published 2026-05-06 through 2026-10-22 validity window. LOT's interactive route map remains a negative control because it explicitly mixes LOT, codeshare/partner and up-to-two-stop options; it is not bulk-imported or used as a denominator. GDN↔BGO remains withheld in this tranche because exact destination-airport identity was not pinned to the same standard on the reviewed current route surface.

WY expands from **6 to 10 active known directional routes** with MCT↔TIF and MCT↔AER. Taif combines an Oman Air direct-route launch with the current schedule selector's exact TIF identity; Sochi combines an Oman Air direct/operator launch with separate current MCT→AER and AER→MCT airport-coded surfaces. Oman Air's current statement that the network reaches up to 49 destinations is not a directional route matrix and therefore does not establish a denominator. FJ remains at two DFW↔NAN directions because the reviewed broader Fiji Airways route-map evidence still does not fix currentness/version/topology/operator meaning strongly enough for a safe bulk import.

AS now has exact current positive operator evidence for SFO↔SEA from Alaska's own flight-status pages while retaining SEA↔NRT as a Hawaiian-operated negative control. HA independently has exact current HNL↔HND operator evidence from the same combined Alaska/Hawaiian status surface. UL, AT, WY, FJ and RJ likewise now have bounded route evidence, which closes oneworld carrier presence at 16/16 without claiming any of those networks complete.

Royal Jordanian is now much broader than the earlier AMM→VIE seed. The current Quick Reference Timetable No.473 is explicitly valid 01Sep-30Sep 2026 and expands RJ to **121 active known directional routes**, including exact AMM pairs plus explicit AQJ/ADJ-origin exceptions. Its legend marks one-stop services with `*` and RO/GF/WY-operated codeshare aircraft with `#`; the reviewed September flight rows contain no `#`, while Toronto is the only `*` city row and is therefore withheld rather than misclassified as AMM↔YYZ nonstop. Alexandria is represented as HBE only through 2026-09-15 because a current airline-trade notice independently resolves the HBE→ALY code transition on 2026-09-16. MRA is also withheld because it is not presently resolvable in GCMP's airport catalog. RJ remains `partial`: the quick-reference is strong current operator/directness evidence, but it is framed primarily FROM/TO AMMAN and does not by itself fully decompose the YYZ through service into a complete physical-segment denominator.

The final Star carrier-presence tranche adds current operator-safe evidence for AV, AZ, CM, MS, OU, OZ, SA, SN and ZH. Shenzhen Airlines is particularly useful for route-first planning: its current 2026 coupon terms require ZH marketing **and actual ZH operation**, explicitly exclude codeshares, and enumerate selected international route pairs including SZX↔TPE, SZX↔LHR, SZX↔SIN and SZX↔BCN. This closes Star Alliance carrier presence at 26/26 while dated schedule coverage remains deliberately separate.

The subsequent gap-visibility tranche expands **AEGEAN from 1 to 25 known directional routes** using the airline's current flight-status board, which labels `Aegean Airlines` and `OlympicAir` separately row-by-row. Only Aegean-labeled directions are retained; OA rows are negative operator controls and reverse directions are never manufactured. **Asiana expands from 8 to 32 known directional routes** using its current 2026 operating-schedule notice, but only where the source itself exposes exact airport IATA identities. The same Asiana notice explicitly says other routes exist, so it is strong broad partial evidence but cannot establish a denominator. Both A3 and OZ therefore remain `partial`.

The next gap tranche expands **Singapore Airlines from 2 to 36 known directional routes** using Singapore Airlines' current Singapore-origin page. Its FAQ individually names a useful subset of cities as direct/non-stop from SIN; GCMP retains only those named examples that also resolve to one exact airport IATA code. A sanity check against the airline's own Cape Town page found a critical boundary: SIN→CPT is explicitly one-stop via Johannesburg even though Cape Town appears elsewhere in the broader SQ destination surface. The broader destination labels are therefore **not** treated as a nonstop universe. Multi-airport city aggregates such as Beijing, Tokyo, London, Kuala Lumpur and Sydney are withheld, destinations outside the individually named nonstop examples are withheld, and no reverse direction or fifth-freedom sector is inferred. SQ remains `partial`.

**Croatia Airlines expands from 1 to 22 known directional routes** using its current 2026/27 route-specific timetables plus a separate operator control. The timetable pages explicitly distinguish `Direct flight` rows from services labeled `via Zagreb`, `via Dubrovnik` or `via Split/Dubrovnik`; only the direct rows enter the route catalog. The airline's current check-in page separately states that its listed workflow applies to scheduled flights operated by Croatia Airlines and exposes exact OU identities including OU380 SPU→FCO, OU384 DBV→FCO and OU300 DBV→ATH. This gives operator corroboration without turning an OU prefix into a heuristic. Direction-specific seasonal bounds remain independent where the airline publishes different windows (for example LGW→SPU through 2026-10-29 versus SPU→LGW through 2026-10-19). OU remains `partial` because the reviewed route pages are not an exhaustive carrier-wide denominator.

The coverage report now includes a per-carrier gap ledger showing each member's known directional routes, schedule-covered routes, universe scope and any future complete denominator. This visibility is derived inside the existing alliance-coverage pipeline; it does not create a second data subsystem. At this point the combined active known-route count is **723** (271 oneworld + 452 Star), while complete carrier universes remain **0** and global route coverage remains `unknown`. `public/data/route-network/current.json` contains 723 route rows, 152 source records and 35 carrier-universe rows.

## Why route-network and schedules are unioned

BR and NH are the key counterexamples. BR has substantial exact chart-verified schedule evidence but no rows in `route-network/current.json`; NH has airline-owned exact published schedules in the separate official catalog. Counting only route-network, or only the legacy schedule catalog, would understate coverage. An exact directional schedule is also route evidence, so the ledger unions the checked-in evidence sets by exact carrier + exact direction.

The reverse is also important: a route observation does not become a dated schedule. CX has many route observations but those rows do not invent weekdays or dates.

## Next expansion order

The global denominator should be established carrier-by-carrier from source-backed published networks. Priority is driven by RTW utility and current zero-coverage gaps, not by convenience:

1. **Carrier presence is complete (42/42).** Do not spend future rounds merely adding one route to a zero-coverage member; there are no zero-coverage current members left.
2. Expand the highest-value partial universes toward broad route usability, prioritizing official network maps/timetables that cleanly distinguish operating carrier, codeshares, via services and seasonal validity.
3. Establish the first trustworthy `complete` carrier denominator when a source actually supports the full directional operating universe; do not promote a carrier merely because many routes are present.
4. Layer dated schedule evidence and exact operating-flight identity after route coverage, preserving route-only rows as `unknown` / pending-date evidence in planning.

Codeshare marketing routes do not count as operator routes unless the operating carrier is independently established. Missing routes remain missing; no prefix, reverse-direction, alliance or timing heuristic may fill gaps.
