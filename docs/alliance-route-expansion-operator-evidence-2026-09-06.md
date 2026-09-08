# Alliance route expansion + denominator evidence — 2026-09-06

This tranche advances GCMP from carrier-presence coverage toward carrier-level route denominators without weakening the operating-carrier standard.

## Result

Checked into `public/data/route-network/current.json`:

- **MH:** 20 selected KUL outbound directional routes.
- **NZ:** 13 directional routes, including one explicit current-season validity window.
- **LX:** 4 directional routes.
- **OS:** 4 directional routes.
- **TG:** 3 directional routes.
- **AS:** no positive route row; one airline-owned known-other-operator negative source is retained.

The route catalog moves from **86 to 130 rows** and from **43 to 60 primary-source records**.

### Route-first continuation

The later route-first continuation expands the same catalog to **328 route rows / 81 primary-source records** while preserving the same evidence boundary: a route may be selectable for planning before its operating dates are known, but its schedule remains `unknown` until separate dated evidence exists.

Additional carriers moved out of zero coverage:

- **AI:** broad official international map snapshot plus later 2026 route additions; current Middle East routes are explicitly held `suspended` where the airline's current advisory says all Air India Middle East flights are suspended.
- **LO:** WAW→SFO plus WAW↔OPO and WAW↔BLQ from current/direct LOT publications; no blanket reverse-direction inference from the generic Warsaw page.
- **ET:** ADD↔MRU and ADD↔ATL from 2026 Ethiopian direct-service releases.
- **TP:** selected current LIS→GRU/FNC/MAD/BCN/LHR route-only evidence from TAP's Lisbon-origin page; reverse directions remain unresolved.
- **CA:** SZX→FRA from Air China's current operator-specific check-in guidance; Beijing/Shanghai city-level examples remain excluded because multiple airports make them ambiguous.
- **A3:** ATH→LHR from current AEGEAN Pass inventory cross-checked against AEGEAN's own Heathrow operating publication; the route map itself is not bulk-imported because it mixes AEGEAN, Olympic Air and codeshare options.
- **RJ:** AMM→VIE from Royal Jordanian's June-2026 direct-route launch.

After this continuation, alliance coverage at `2026-09-06` is **oneworld 10/16 carriers / 79 active known directional routes** and **Star Alliance 17/26 carriers / 249 active known directional routes**. Global route coverage remains `unknown`, and complete carrier universes remain **0**.

Coverage at `2026-09-06` becomes:

- oneworld: 9/16 carriers with route evidence, 78 known directional routes, 2 with exact dated schedule evidence.
- Star Alliance: 11/26 carriers with route evidence, 82 known directional routes, 40 with exact dated schedule evidence.
- global route coverage: still `unknown`.
- complete carrier universes: **0**.

## Denominator guard

`CarrierRouteUniverseSchema` now makes a `complete` claim mechanically auditable:

- `scope: "complete"` requires `directionalRouteDenominator`.
- that denominator must equal the carrier's active `published` directional rows on the universe `asOf` date.
- `scope: "partial"` is forbidden from carrying a denominator.

This does not prove source completeness by itself. It prevents a source-review mistake from becoming a numerically inconsistent complete claim after the human/source completeness decision has been made.

The alliance coverage report also exposes:

- `memberCarriersWithPartialRouteUniverse`
- `memberCarriersWithCompleteRouteUniverse`
- `carriersWithCompleteRouteUniverse`

Global percentage remains hard-coded unknown until an alliance-wide denominator exists.

## MH — useful large partial, not a denominator

Primary source:

- <https://www.malaysiaairlines.com/uk/en/experience/in-flight-offerings/dining-experience.html>

Malaysia Airlines' Chef-on-Call terms explicitly say the listed sectors are **selected Malaysia Airlines-operated flights** and list outbound Kuala Lumpur destinations with IATA airport codes. GCMP retains a high-value subset including:

- KUL→AKL/ADL/MEL/PER/SYD/BNE
- KUL→KIX/NRT/ICN
- KUL→LHR/CDG/DOH
- KUL→BKK/DPS/SGN
- KUL→BOM/DEL
- KUL→PVG/TPE/HKG

The source calls the list selected, so it is not a complete MH network. Reverse directions are not inferred.

The separate Malaysia Airlines Flight Schedule page describes itself as a schedule of flights operated by Malaysia Airlines:

- <https://www.malaysiaairlines.com/my/en/plan-trip/flight-schedule.html>

However, the reviewed public page does not expose a checked-in complete structured route enumeration in this tranche. That wording alone is not enough to manufacture a denominator. MH therefore remains `partial`.

## NZ — exact selected directions + bounded seasonal evidence

Primary sources:

- <https://www.airnewzealand.com/en-nz/destination-sydney>
- <https://www.airnewzealand.com/en-nz/destination-perth>
- <https://www.airnewzealand.com/en-nz/destination-taipei>
- <https://www.airnewzealand.com/en-nz/destination-tokyo>
- <https://www.airnewzealand.com/destination-cairns>
- <https://www.airnewzealand.com/en-nz/destination-auckland>

Retained evidence includes:

- AKL/WLG/CHC/ZQN→SYD, with SYD explicitly named as Sydney Kingsford Smith.
- AKL→PER.
- AKL→TPE; the source identifies arrival at Taoyuan Airport rather than relying on a generic Taipei city expansion.
- AKL→NRT; the source explicitly says Narita.
- AKL→CNS with published current-season bounds `2026-03-29..2026-10-13`.
- WLG/CHC/ZQN/DUD/IVC→AKL from the independently published Auckland inbound table.

Future Christchurch→Perth/Tokyo/Singapore services are not counted on 2026-09-06. Air New Zealand also publishes broad destination/network pages, but the complete operator-resolved directional domestic + international matrix and all seasonal validity windows have not yet been established in GCMP, so NZ remains `partial`.

## LX — partner-operated rows are explicit negative controls

Primary sources:

- <https://www.swiss.com/lhg/ch/en/o-d/cy-cy/zurich-hong-kong>
- <https://www.swiss.com/lhg/ch/en/o-d/cy-cy/zurich-tokyo>

Retained routes:

- ZRH→HKG, LX138.
- HKG→ZRH, LX139.
- ZRH→NRT, LX160.
- NRT→ZRH, LX161.

The Hong Kong flightplan separately labels LX9514/LX9515 as **operated by CX**. Those marketing identities therefore do not change the LX operating route evidence. The source also warns that flight schedules change regularly; GCMP does not invent a finite official-schedule validity window from this page.

## OS — HND codeshare is deliberately excluded

Primary sources:

- <https://www.austrian.com/lhg/at/en/o-d/cy-cy/vienna-tokyo>
- <https://www.austrian.com/lhg/at/en/o-d/cy-cy/vienna-bangkok>

Retained routes:

- VIE→NRT, OS25.
- NRT→VIE, OS26.
- VIE→BKK, OS7.
- BKK→VIE, OS8.

The Tokyo flightplan also shows HND marketing rows OS8563/OS8564 and explicitly labels them **operated by NH**. `OS:VIE-HND` and `OS:HND-VIE` therefore remain absent.

## TG — exact route identity only where operator + airport evidence meet

Primary sources:

- <https://www.thaiairways.com/en-tw/content/offers-Promotions/special-offers/Introduction-ams/>
- <https://www.thaiairways.com/en-th/content/offers-Promotions/special-offers/getaway-for-less/>
- <https://www.thaiairways.com/flights/en-th/flights-from-bangkok-to-taipei>

Retained routes:

- BKK→AMS, TG936.
- AMS→BKK, TG937.
- BKK→TPE, using the Bangkok-origin non-stop/THAI-operated publication plus the separate exact BKK/TPE airport page.

The reverse TPE→BKK fare page is not promoted to operating-route evidence without an equally strong directional operator statement. Generic THAI fare/destination pages can include connecting itineraries, so they are not a denominator.

## AS — current negative evidence prevents a false Alaska route

Primary source:

- <https://news.alaskaair.com/destinations/alaska-airlines-launches-new-era-of-widebody-international-flying-in-seattle/>
- <https://www.alaskaair.com/status/823/2026-09-05>
- <https://www.alaskaair.com/status/0824/2026-09-06>

The Alaska Air Group publication explicitly states that Seattle↔Tokyo Narita is operated by Hawaiian Airlines and identifies HA823/HA824. GCMP therefore keeps `AS:SEA-NRT` absent even though Alaska-branded/group pages market the global gateway.

That older structural statement is now corroborated by current airline-owned exact-date controls: Alaska's September 5 flight 823 status identifies SEA→NRT as operated by Hawaiian Airlines, and its September 6 flight 824 status identifies NRT→SEA as operated by Hawaiian Airlines. These controls are intentionally source evidence only; they do not create HA route rows in the AS research tranche.

Current Alaska destination pages can enumerate many branded nonstop markets, but in the combined Alaska/Hawaiian/Horizon environment they do not consistently provide an operator field per row. Those pages are not sufficient for an AS operating-carrier denominator under the current contract.

## Why no first `complete` carrier was declared

This tranche found substantially better operator evidence, but none of the reviewed candidates met the full standard for a current carrier denominator:

- **MH:** selected operated-flight list is explicitly non-exhaustive; full dynamic schedule enumeration was not established.
- **NZ:** current network material is broad, but the complete directional matrix plus seasonal validity/operator resolution is not yet represented as checked evidence.
- **LX / OS:** pair flightplan pages have excellent operator distinctions but are not complete carrier network indexes.
- **TG:** route/promotional pages are useful for bounded route evidence, while generic destination/fare surfaces can include connections.
- **AS:** group branding now spans Alaska, Hawaiian and Horizon; a route list without per-row operator resolution would violate the operator contract.

The correct state remains `partial`, not guessed `complete`.

## Route-first expansion follow-up — NZ + AI

The user explicitly prioritized planning coverage over schedule completeness: a source-backed nonstop route may enter the route catalog before its exact operating weekdays/dates are known. This does **not** relax the schedule evidence boundary. `buildNextLegIndex()` already represents a network-only route with `scheduleStatus = unknown`; it remains discoverable for itinerary planning while the date layer says unknown/needs update rather than inventing a timetable.

### Air New Zealand broad current network

Air New Zealand's current `Where we fly` and regional destination pages distinguish current, seasonal, future and paused service. The route catalog now expands NZ from 13 to **68 directional rows** across Australia, Asia, the Pacific and North America, while retaining explicit future `effectiveFrom` boundaries where the airline publishes them.

Newly represented examples include:

- Australia: AKL→MEL/BNE/OOL/ADL/MCY/HBA, WLG→BNE/MEL, CHC→BNE/MEL/OOL/ADL and ZQN→MEL/BNE.
- Future Australia: AKL→WSI from November 2026 and CHC→PER from December 2026. These are present for future planning but are outside the 2026-09-06 active coverage denominator.
- Asia: AKL→DPS/HKG/PVG/SIN plus the previously established AKL→TPE/NRT; future CHC→SIN/NRT keeps its announced future start rather than becoming current.
- Pacific: AKL↔RAR/NAN/IUE/APW/TBU/NOU/PPT and CHC→RAR.
- North America: AKL↔LAX/SFO/HNL/IAH/JFK/YVR where the reverse direction is separately supported by airline-owned inbound/New York/Vancouver material.

Chicago remains absent because the airline labels it paused. No route-only row is promoted into a dated schedule.

Primary sources:

- <https://www.airnewzealand.com/en-nz/travel-info/destinations-we-fly-to>
- <https://www.airnewzealand.com/en-nz/destination-australia>
- <https://www.airnewzealand.com/en-nz/destination-asia>
- <https://www.airnewzealand.com/en-nz/destination-the-islands>
- <https://www.airnewzealand.com/en-nz/destination-usa>
- <https://www.airnewzealand.com/en-nz/destination-vancouver>
- <https://www.airnewzealand.com/new-york-to-new-zealand>
- <https://www.airnewzealand.com/en-nz/destination-auckland>

NZ remains `partial`: broad current coverage is now useful for planning, but GCMP has not yet represented every domestic direction and every recurring seasonal validity window.

### Air India broad international snapshot

Air India's official February-2026 international connectivity map states that Air India flies nonstop to 41 international destinations and visually identifies the Indian airport(s) connected to each overseas point. GCMP uses that as a **route-universe snapshot**, not a September dated timetable.

The catalog adds **100 published directional rows** from that official map plus later official 2026 additions, including DEL↔HAN and BOM↔HND. Examples now available to the planner include DEL↔LHR/JFK/SFO/HND/PVG/HKG/SIN/SYD and BOM↔LHR/EWR/JFK/FRA/SIN/CMB/MRU.

The airline's current homepage simultaneously states that all Air India flights to Middle East destinations are suspended. Therefore **26 directional Middle East rows** from the older map are retained as explicit `suspended` evidence rather than current positive planning edges. They do not count toward active Star Alliance route coverage and are filtered from next-leg suggestions while the suspension is active.

Primary sources:

- <https://www.airindia.com/content/dam/air-india/newsroom/press-kits/pdfs/Air-India-International-Route-Map-March-2026.pdf>
- <https://www.airindia.com/en-in/book-flights/international-flights>
- <https://www.airindia.com/in/en/newsroom/press-release/Air-India-expands-Asia-footprint-with-new-routes-to-Vietnam-and-Japan.html>
- <https://www.airindia.com/>

AI remains `partial`: the international map is a broad dated snapshot, not a complete current domestic + international operator denominator, and route-only rows intentionally remain date-unknown until schedule evidence is layered on top.

### Follow-up coverage result

After this route-first tranche, `public/data/route-network/current.json` contains **311 rows from 70 source records**. Airport validation reports zero unknown airport codes and the catalog contains zero duplicate carrier+direction keys.

At `2026-09-06`:

- oneworld remains 9/16 carriers with route evidence and 78 active known directional routes.
- Star Alliance increases from 11/26 to **12/26** carriers with route evidence and from 82 to **233 active known directional routes**.
- Star exact dated schedule evidence remains 40 routes; known-route schedule coverage therefore falls to 17.2%, which is expected when route discovery is deliberately expanded ahead of schedules.
- complete carrier universes remain **0** and global route coverage remains `unknown`.

## Carrier-presence completion tranche

The route-first expansion continued until every current alliance member had at least one source-backed operating/nonstop directional route. This is a **carrier-presence milestone**, not a global route denominator.

### oneworld zero-coverage closure

- **AT / Royal Air Maroc:** a large CMN outbound set is retained only where the passenger-network page says the destination is served from Casablanca **and** the airline-owned direct-flight IATA list independently places the airport in the direct network. Reverse directions are not inferred.
- **WY / Oman Air:** 2026 airline releases establish MCT↔SIN, MCT↔TAS and MCT↔AUH with explicit route start dates. The first draft accidentally used `MUS` for Muscat; airport-integrity regression rejected it and the production rows were corrected to `MCT` before acceptance.
- **AS / Alaska Airlines:** exact 2026 Alaska status pages establish SFO↔SEA as Alaska-operated. Existing SEA↔NRT evidence remains a Hawaiian-operated negative control, so there is still no Alaska-prefix heuristic.
- **HA / Hawaiian Airlines:** exact current Alaska/Hawaiian status pages establish HNL↔HND as Hawaiian-operated.
- **UL / SriLankan Airlines:** current Colombo-London inventory plus an airline-owned statement distinguishing SriLankan's nonstop London-Colombo service establishes CMB↔LHR route-only evidence.
- **FJ / Fiji Airways:** Fiji Airways' airline-owned DFW-NAN direct-service announcement is corroborated by the current DFW Airport board, which still lists Fiji Airways FJ890/FJ891 between Nadi and Dallas. This closes the final oneworld zero-coverage carrier without relying on the inaccessible route-map PDF.

### Star Alliance zero-coverage closure

- **CM / Copa Airlines:** current Copa material explicitly establishes PTY↔DAV direct service.
- **SN / Brussels Airlines:** current flightplan establishes SN501/SN502 BRU↔JFK while separately labeling EWR marketing rows as UA-operated; EWR is excluded from SN route evidence.
- **OU / Croatia Airlines:** the current 2026/27 London timetable identifies LHR→ZAG as year-round direct service and separately marks Dubrovnik as via Zagreb.
- **AZ / ITA Airways:** current flightplan establishes AZ-operated FCO↔JFK nonstop service.
- **AV / Avianca:** the 2026 summer publication establishes direct MAD→SAL service; the reverse direction is not inferred from that directional statement.
- **OZ / Asiana:** current operational-route notice establishes selected ICN↔JFK/LAX/SFO/SEA services with exact OZ identities.
- **SA / South African Airways:** current airline network statement plus September-2026 fare inventory establishes JNB→ACC route-only evidence.
- **MS / EGYPTAIR:** a current Cairo-route publication plus the airline-owned exact CAI-IAD nonstop identity establishes CAI↔IAD without reusing the historical weekly frequency.
- **ZH / Shenzhen Airlines:** current 2026 coupon terms require ZH sale **and actual ZH operation**, explicitly exclude codeshares, and enumerate selected international route pairs. This safely adds selected bidirectional SZX routes including TPE, LHR, BCN, SIN, KUL, BKK, MNL, SGN, PEN, ICN and CJU, plus WUX↔ICN. Coupon validity is not promoted into a recurring dated schedule.

### Final carrier-presence ledger

At `2026-09-06`, the evidence-only ledger now reports:

- **oneworld: 16/16 current members with route evidence (100.0%), 147 active known directional routes.**
- **Star Alliance: 26/26 current members with route evidence (100.0%), 294 active known directional routes.**
- Missing route-evidence carriers: **none**.
- Exact dated schedule evidence remains 2 oneworld routes and 40 Star routes, so route-only planning coverage has intentionally advanced far ahead of schedule coverage.
- Complete carrier route universes: **0**.
- Global route coverage: still **`unknown`** because 42/42 carrier presence is not the same as a complete directional route denominator.

This changes the next bottleneck. Future expansion should no longer optimize for making a carrier disappear from the zero-coverage list; that list is empty. The highest-value work is now to broaden each `partial` carrier toward useful network coverage and, where an authoritative complete operating network can genuinely be established, promote the first carrier to `complete` with an auditable directional denominator.

## Per-carrier gap visibility + A3 / OZ expansion continuation

The next route-first tranche deliberately did **not** force a first `complete` carrier. Two current airline-owned sources materially improve route coverage, but neither proves an exhaustive carrier denominator:

- **AEGEAN (A3):** the airline's current flight-status board exposes exact airport pairs and labels the operating brand row-by-row as either `Aegean Airlines` or `OlympicAir`. GCMP retains only directions explicitly shown as Aegean Airlines on the reviewed board and does not infer a reverse direction from the outbound row. This expands A3 from 1 to **25 known directional routes** while preserving the OA operator boundary. A dated flight-status board is an operational snapshot, not a complete A3 network denominator, so A3 remains `partial`.
- **Asiana (OZ):** Asiana's current 2026 operating-schedule notice publishes exact OZ flight-number pairs across a broad North America / Europe / Asia set. GCMP adds only rows whose airport IATA identity is explicit in the notice, including ICN↔MXP, ICN↔NRT/HND/KIX/CTS/PVG/TFU/TPE, GMP↔HND/KIX/SHA and ICN↔KTI. City-only rows are not expanded to guessed airports. The notice explicitly points readers to schedule search for **other routes**, so it cannot establish an exhaustive denominator; OZ remains `partial`. OZ grows from 8 to **32 known directional routes**.

The alliance coverage ledger now also emits one row per active member carrier, sorted from least to most known routes, with:

- `routeUniverseScope` (`untracked` / `partial` / `complete`)
- `directionalRouteDenominator` only when a future `complete` universe actually exists
- `knownDirectionalRoutes`
- `knownDirectionalRoutesWithScheduleEvidence`
- `knownRouteScheduleCoveragePercent`

This is intentionally part of the existing `src/lib/rtw/alliance-coverage.ts` pipeline rather than a second coverage subsystem. It makes the next gaps visible immediately: a developer can distinguish a one-route carrier from a 25-, 32-, 64- or 100-route carrier without confusing carrier presence with global completeness.

After this continuation at `2026-09-06`:

- oneworld remains **147** active known directional routes, 2 schedule-covered.
- Star Alliance increases from 294 to **342** active known directional routes, with 40 schedule-covered.
- total active known directional routes increase from 441 to **489**.
- `public/data/route-network/current.json` contains **489 route rows / 107 source records / 35 carrier-universe rows**.
- complete carrier universes remain **0**.
- global route coverage remains **`unknown`**. The 42/42 carrier-presence milestone still must not be reported as global route completeness.

## SQ / OU broad route-first continuation

The next carrier-gap tranche again attempted to find a trustworthy first `complete` carrier denominator before falling back to broad route-first expansion. No candidate was promoted merely to hit that milestone. Fiji Airways' route-map surface has promising operator legends but the reviewed PDF could not be pinned to a sufficiently current complete topology in this tranche, while Oman Air's current public statement of a network of up to 49 destinations is a destination count rather than a directional route matrix. Both therefore remain `partial`.

### Singapore Airlines — explicit non-stop examples, exact-airport subset only

Primary source:

- <https://www.singaporeair.com/sg/en/plan-travel/destinations/>

Singapore Airlines' current Singapore-origin page individually names selected cities as direct/non-stop from SIN and exposes airport identities on the same destination surface. A separate airline-owned SIN-CPT route page is an important negative control: Cape Town appears in the broader SQ destination surface, but Singapore Airlines explicitly says SIN-CPT is one-stop via Johannesburg. The broad destination labels therefore cannot be treated as a blanket nonstop universe.

GCMP therefore expands SQ from **2 to 36 known directional routes**. The new rows are SIN-origin only and are limited to the FAQ's individually named non-stop examples that resolve to one exact airport, including SIN→HKG/KIX/ICN/TPE, SIN→BKK/CGK/MNL/SGN, SIN→CDG/FRA/MXP, SIN→DEL/BOM/JNB and SIN→MEL/PER.

The extraction remains deliberately bounded:

- only cities individually named by the current Singapore-origin FAQ as direct/non-stop are eligible;
- a city aggregate is excluded when the source exposes more than one possible airport code, including Beijing, Tokyo, London, New York, Kuala Lumpur and Sydney;
- broader SQ-branded destinations not individually named in that explicit non-stop subset are withheld in this tranche;
- SIN→CPT is explicitly excluded because the airline's current route page says it is one-stop via Johannesburg;
- reverse directions are not inferred from SIN-origin rows;
- fifth-freedom or other non-SIN SQ sectors are not assumed to be exhaustively represented;
- no flight number, weekday or recurring dated schedule is invented from the route page.

Those exclusions are pinned in regression tests with CPT (explicit one-stop), LAX (not individually named in the bounded FAQ subset), KHH/PQC (not accepted from broader destination inventory), PEK/PKX (withheld Beijing aggregate) and MXP→SIN (no reverse inference) remaining absent. SQ therefore remains `partial`; 36 known routes are not a complete SQ directional denominator.

### Croatia Airlines — direct/via separation plus exact OU operator controls

Primary sources include:

- <https://www.croatiaairlines.com/check-in>
- <https://www.croatiaairlines.com/offers/Flights-from-Athens>
- <https://www.croatiaairlines.com/hr/Prodaja-aviokarte/Ponude-letova/Povoljni-letovi-za-Atenu>
- <https://www.croatiaairlines.com/offers/Flights-from-Copenhagen>
- <https://www.croatiaairlines.com/hr/ponude/Povoljni-letovi-za-Kopenhagen>
- <https://www.croatiaairlines.com/offers/Flights-from-London>
- <https://www.croatiaairlines.com/hr/ponude/Povoljni-letovi-za-London>
- <https://www.croatiaairlines.com/offers/Flights-from-Dublin>
- <https://www.croatiaairlines.com/hr/ponude/Povoljni-letovi-za-Dublin>
- <https://www.croatiaairlines.com/it/offerte/Voli-da-Roma>
- <https://www.croatiaairlines.com/hr/ponude/Povoljni-letovi-za-Rim>

Croatia Airlines' current 2026/27 route-specific timetables visibly distinguish direct rows from `via` services. GCMP adds only the directions explicitly labeled direct, expanding OU from **1 to 22 known directional routes**. The new set includes ATH↔DBV/SPU, CPH↔ZAG/SPU, DUB↔SPU, selected direct London pairs and FCO↔SPU/DBV.

The current check-in page supplies an independent operator boundary: it says its listed workflow applies to scheduled flights **operated by Croatia Airlines** and exposes exact OU identities including OU380 SPU→FCO, OU384 DBV→FCO and OU300 DBV→ATH. These exact identities corroborate selected directions, but they are not generalized into an OU-prefix rule.

Explicit via relationships remain negative controls: ATH→ZAG via Dubrovnik, CPH→DBV via Zagreb, ZAG→FCO via Split/Dubrovnik and LHR→DBV via Zagreb do not enter the nonstop route catalog. Direction-specific seasonal bounds are also kept exactly as published rather than mirrored; for example the reviewed London-origin timetable keeps LGW→SPU through 2026-10-29 while the Croatia-origin page keeps SPU→LGW through 2026-10-19. That is recorded as source-specific directional evidence, not normalized into a guessed symmetric window.

OU remains `partial`. The reviewed route pages provide a useful broad directional subset with unusually clean direct/via controls, but they are not a complete carrier-wide current denominator.

### Coverage after SQ / OU continuation

At `2026-09-06`:

- oneworld remains **147** active known directional routes, 2 schedule-covered, known-route schedule coverage **1.4%**;
- Star Alliance increases from 342 to **397** active known directional routes, with the same 40 schedule-covered routes, so known-route schedule coverage is **10.1%**;
- combined active known directional routes increase from 489 to **544**;
- SQ is now **36** known directional routes and OU is **22**;
- `public/data/route-network/current.json` contains **544 route rows / 119 source records / 35 carrier-universe rows**;
- all 42 current alliance carriers still have route evidence;
- complete carrier universes remain **0**;
- global route coverage remains **`unknown`** because no complete global directional denominator exists.

## RJ / LX denominator attempt and route-first continuation

The next tranche again tried to establish the first trustworthy `complete` carrier before falling back to route-first expansion. Royal Jordanian produced the strongest denominator candidate found so far, but it was deliberately **not** promoted merely to hit the milestone.

### Royal Jordanian — current September quick-reference, broad partial only

Primary current sources:

- <https://www.rj.com/en/plan-and-book/track-flights/rjs-timetable>
- <https://www.rj.com/-/media/RJ---September-Timetable.pdf?rev=21dc1d037cc94a4f87adab7b52e9381a&hash=FC3BED6114909F0531D7A95EF07196FE>
- <https://www.aegeanhub.com/en/>

Royal Jordanian's live timetable page links the current September download. Quick Reference Timetable No.473 is explicitly valid **01Sep-30Sep 2026** and publishes directional flight identities, exact airport codes, days/times and special `From/To AQJ` / `From/To ADJ` rows. Its footer also provides unusually useful classification controls:

- `*` means **One Stop**;
- `#` means **Operated by RO or GF or WY "Code Share Aircraft"**;
- `ADJ` is explicitly Marka Airport / Amman City Center Airport.

The reviewed September flight rows contain **no `#` marker**, so none of the accepted rows depend on an RJ-prefix operator heuristic. Toronto is the only city row carrying `*`, so `RJ:AMM-YYZ` is deliberately absent rather than treating the through service as a physical nonstop. GCMP also does not infer `YUL↔YYZ` from the timing/through-flight pattern; an exact source for the physical intermediate sector would be required.

The timetable prints Alexandria as `ALY`, but a current airline-trade notice independently states that Alexandria uses **HBE through 2026-09-15** and changes to **ALY from 2026-09-16**, with the same flight times/numbers. Because the coverage date is 2026-09-06 and GCMP already knows HBE, the RJ515/516 pair is represented as AMM↔HBE only through 2026-09-15. No silent airport alias is invented.

Misurata `MRA` appears explicitly in the RJ source but is not present in GCMP's airport catalog, so that pair remains withheld rather than bypassing the airport-integrity gate. Likewise future September changes such as AQJ↔AUH from 2026-09-18, AQJ↔RUH from 2026-09-19 and ADJ↔SHJ from 2026-09-16 are not counted as active at the 2026-09-06 coverage instant.

Accepted current evidence expands RJ from **1 to 121 active known directional routes**. Besides the broad AMM-origin/return matrix, the catalog keeps only separately explicit non-AMM physical pairs such as AQJ↔CAI, ADJ↔SSH, ADJ↔TZX and the direction-specific ADJ→IST row. It does not manufacture the missing reverse `IST→ADJ` or AMM↔SSH/TZX edges.

RJ remains `partial`. The quick-reference is excellent monthly operator/directness evidence, but it is framed primarily as **FROM AMMAN / TO AMMAN** rather than an explicit exhaustive carrier-wide physical-segment index, and the YYZ through service still needs a trustworthy exact physical-leg decomposition. Those ambiguities are enough to block a `complete` claim.

### SWISS — operator-safe pair expansion with partner and rail negatives

Current SWISS/Lufthansa Group flightplan pages expand LX from **4 to 18 active known directional routes**:

- ZRH↔SIN — LX176/LX177; the same page separately labels LX9000 as operated by SQ.
- ZRH↔GVA — multiple unmarked LX-operated air services; SBB rail-marketed LX rows remain excluded.
- ZRH↔JFK and ZRH↔EWR — exact LX14/15/16/17 and LX18/19 rows; LX3218/3219 are separately labeled UA-operated and excluded.
- ZRH↔MIA — LX64/LX65.
- ZRH↔BOS — LX52/LX54 and LX53/LX55.
- GVA↔JFK — LX22/LX23; GVA↔EWR marketing rows are separately labeled UA-operated and excluded.

Existing ZRH↔HKG and ZRH↔NRT evidence remains. These current pair pages provide strong operator negatives but still do not form an exhaustive carrier-wide LX network index, so LX remains `partial` and no dated recurring schedule horizon is invented.

### Coverage after RJ / LX continuation

At `2026-09-06`:

- oneworld increases from 147 to **267** active known directional routes, with 2 schedule-covered, known-route schedule coverage **0.7%**;
- Star Alliance increases from 397 to **411** active known directional routes, with 40 schedule-covered, known-route schedule coverage **9.7%**;
- combined active known directional routes increase from 544 to **678**;
- RJ is now **121** known directional routes and LX is **18**;
- `public/data/route-network/current.json` contains **678 route rows / 128 source records / 35 carrier-universe rows**;
- all 42 current alliance carriers still have route evidence;
- complete carrier universes remain **0**;
- global route coverage remains **`unknown`** because no trustworthy complete global directional denominator exists.

## RJ denominator closure attempt + TG / TP route-first fallback

The next denominator attempt did not lower the `complete` threshold. Current Toronto Pearson flight pages independently expose RJ271 as Royal Jordanian arriving from Amman **via Montreal** and RJ272 departing to Amman **via Montreal**. This materially strengthens the physical interpretation of the YYZ through service, but it still does not turn the September Quick Reference into an explicit exhaustive carrier-wide physical-segment index. RJ therefore remains `partial`; no denominator is claimed from a source that is primarily framed FROM/TO AMMAN.

Per the fallback rule, this tranche then broadened two thin carriers rather than continuing to drill the same ambiguity.

### Thai Airways — operated/nonstop promotion + exact airport resolver

THAI's current Early Escape 2026 publication states that the listed Bangkok services are **non-stop** and limits eligibility to **TG 3-digit operating flights only** for travel 2026-09-01 through 2026-11-30. The separate current Bangkok-origin route surface resolves exact airport codes. Only the intersection of those two sources is retained, avoiding city-level airport expansion and generic fare/operator inference.

Added BKK-origin directions include ICN, NRT, HND, KIX, PVG, HKG, SIN, LHR, CTS, PEK and CAN. Reverse directions remain absent unless separately evidenced. TG therefore expands from 3 to 14 active known directional routes and remains `partial`.

### TAP Air Portugal — current exact directional non-stop surface

TAP's current page is explicitly a **Direct Non-Stop Flights** surface and exposes exact airport-coded directions. GCMP adds only directions visible on that surface, including GRU→LIS, FNC→LIS, GIG→LIS, NBJ→LIS, MAD→LIS, LIS→GIG and LIS→ORY. This is stronger than generic destination inventory but is still not asserted to be a complete carrier-wide denominator.

TP expands from 5 to 12 active known directional routes and remains `partial`.

## OS / LO / WY broad route-first continuation — 2026-09-07

This continuation deliberately moves away from the already-exhausted RJ September Quick Reference and broadens three thinner carriers without relaxing the operator, direction or exact-airport contract. Fiji Airways was researched but not expanded because the reviewed route-map material still did not pin currentness/version/topology/operator meaning strongly enough for a broad import.

### Austrian Airlines (OS) — current Lufthansa Group pair flightplans

Current Austrian pair flightplans add exact OS-operated bidirectional pairs for VIE↔BOS (OS31/32), VIE↔ORD (OS45/46), VIE↔IAD (OS41/42), VIE↔JFK (OS35/36) and VIE↔EWR (OS37/38). The New York and Washington pages are accepted only at the exact airport rows shown in the flightplan; GCMP does not create generic `NYC`/Washington metro edges. The earlier Tokyo page remains an explicit negative operator control because its HND marketing rows are labeled operated by NH.

OS expands from **4 to 14 active known directional routes** and remains `partial`. Pair flightplans are strong operator evidence but are not a carrier-wide denominator and do not justify a synthetic recurring schedule horizon.

### LOT Polish Airlines (LO) — direct launches + directional inaugural flights + airport resolvers

LOT's current first-flight surface explicitly describes inaugural **LOT Polish Airlines** services and publishes directional flight identities. Combined with current airline-owned direct-route / airport-resolution pages and current launch releases, GCMP adds:

- WAW↔ALA, with the year-round current WAW/ALA route identity;
- SFO→WAW, with the existing WAW→SFO row also bounded to the published 2026-05-06 through 2026-10-22 summer window;
- GDN↔BRU and GDN↔OSL from the current direct regional launch plus exact BRU/OSL route pages;
- KRK↔FCO, KRK↔BCN and KRK↔MAD from the current year-round Krakow launch, explicit return flight identities, and exact destination-airport pages.

Two boundaries remain deliberate. LOT's interactive route map explicitly mixes LOT, partner-airline codeshare and up-to-two-stop options, so it is retained only as a negative control and is not bulk-imported. GDN↔BGO is also withheld in this tranche because the reviewed current route surface did not expose the destination IATA identity as cleanly as the accepted BRU/OSL surfaces. Likewise the announced WAW↔BKK service does not enter the 2026-09-06 active ledger before its October start.

LO expands from **5 to 18 active known directional routes** and remains `partial`.

### Oman Air (WY) — current direct launches + exact-airport directional surfaces

Oman Air's direct Muscat-Taif publication establishes service starting 2026-01-31; the current Oman Air schedule selector independently resolves Taif as **TIF**, so MCT↔TIF is retained without city-level guessing. The carrier's Sochi launch identifies direct Muscat-Sochi service starting 2026-07-02 and Oman Air operation; separate current route surfaces independently resolve MCT→AER and AER→MCT, so both directions are represented without reverse-direction inference.

The current network-expansion release also describes a network of up to **49 destinations**. That marketing count is explicitly not a directional route matrix and is not promoted to a denominator.

WY expands from **6 to 10 active known directional routes** and remains `partial`.

### Coverage after OS / LO / WY continuation

At `2026-09-06`:

- oneworld: **271** active known directional routes, 2 schedule-covered, known-route schedule coverage **0.7%**;
- Star Alliance: **452** active known directional routes, 40 schedule-covered, known-route schedule coverage **8.8%**;
- combined active known directional routes: **723**;
- OS **4→14**, LO **5→18**, WY **6→10**, FJ remains **2**;
- `public/data/route-network/current.json`: **723 route rows / 152 source records / 35 carrier-universe rows**;
- all 42 current alliance carriers still have route evidence;
- complete carrier universes remain **0**;
- global route coverage remains **`unknown`** because no complete directional denominator has been established.
