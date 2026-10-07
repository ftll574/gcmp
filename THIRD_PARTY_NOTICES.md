# Third-Party Notices & Data Provenance

更新時間:2026-10-07 · 用途:記錄 public/data/ 每個資料來源的授權與義務。
單一檔案內有自帶 source/license 欄位者,以該欄位為準。

## 資料來源清單

| 來源 | 用途 | 授權 | 義務 |
|---|---|---|---|
| OpenFlights (github.com/jpatokal/openflights, data/airlines.dat) | airlines.json 聯盟成員表碼位(45/45 交叉驗證,見 scripts/verify-airlines-provenance.ts) | ODbL 1.0 (data/LICENSE) | notice(4.3)+ share-alike(4.4)+ 機器可讀提供衍生庫(4.6) |
| OurAirports (ourairports.com/data) | 機場/跑道/導航台基礎資料 | Public Domain (Unlicense) | 無強制 attribution(禮貌性即可) |
| MrAirspace aircraft-flight-schedules (github.com/MrAirspace/aircraft-flight-schedules) | 航線/航班號候選 overlay | ODbL 1.0 | notice(4.3)+ share-alike(4.4)+ 機器可讀提供衍生庫(4.6) |
| ADSBiq (github.com/Sky-Power-Services/adsbiq-data) | 航線/航班號候選 overlay | ODbL 1.0 | 同上 |
| 交通部 TDX 運輸資料流通服務 (tdx.transportdata.tw) | 台灣班表 dated 管道 | 政府資料開放授權條款 第1版 (OGDL) | 顯名聲明(見下)+ 可再轉授權;無 share-alike |
| Taiwan Civil Aviation Administration (交通部民用航空局), datasets 6066 and 9973 | 488 筆 CAA 列示週班表班號／方向參考 | Taiwan Open Government Data License 1.0 (OGDL-Taiwan-1.0) | 顯名「Taiwan Civil Aviation Administration (交通部民用航空局)」+ 授權連結;來源 SHA-256、版本日期及原始列號隨資料提供 |
| Directorate General of Civil Aviation (DGCA), India | 2026 Summer SpiceJet approved-schedule identity references | DGCA website policy / site terms | 顯著標示來源標題、連結與 PDF SHA-256；僅準確、非誤導重製，不主張 CC 授權或公有領域；保留來源頁／列號 |
| Avinor XML Public | OSL 單次 144 小時快照中的來源列示營運航空公司 IATA、完整班號、方向與 UTC 日期，保留失效時間 | Avinor flight data service terms | 介面需在資料附近以可見連結顯示「Flight data from Avinor」，連結至 www.avinor.no；大量負載前先聯絡 Avinor |
| Avinor XML Public airport batch | 十個 144 小時機場快照中的精確營運航空公司／完整班號／方向與 UTC 班表列，逐份保存原始回應及 freshness cutoff | Avinor flight data service terms | 同上；人工查詢至少間隔三分鐘；不將來源班表當作固定服務或已實際運航 |
| Avinor XML Public remaining-airports release | 24 個來源機場的獨立審核批次；保留 143 個接受身份、517 筆逐列 UTC 班表 occurrence、原始 XML 及逐機場 freshness cutoff | Avinor flight data service terms | 同上；只供來源列示的日期班表身份，occurrence 到預定 UTC 時間即到期；不推定實際運航、固定服務、實體直飛、獎勵座位或可訂位 |
| ANAC Registro de Serviços Aéreos (SIROS) | 2026-10-07 擷取的登記班表；僅整合已審核的 14,997 筆既有航線資料列 | 聯邦政府開放資料重用依據；未聲稱特定 Creative Commons 版本 | 來源顯名與原始資料列封存連結；受資源特定條款限制。登記班表不證明實際運行、可訂位或直飛 |
| STARLUX 官方班表 API (ecapi.starlux-airlines.com) | JX 班表(78 筆 chart-verified) | 站方 API 條款 | 依 API 使用條款;harvest 腳本引用查詢 URL |
| AeroRoutes 官方公告 | BR 班表(28 筆) | 站方條款 | 新聞稿類資料,標註出處 |
| China Airlines 官方時刻表 PDF | CI 班表(32 筆) | 華航文件 | 標註版本與有效期 |
| Aviation Edge Airline Routes (付費 API) | 全球航線 bulk 採集(60 家聯盟航司) | 商業合約 | 依合約;raw 回應存 repo 外 |
| AeroDataBox (RapidAPI/官方) | 校準/交叉驗證 | 商業 ToU | 見下方特別警示 |
| OAG / Cirium (合約 feed) | 全球 dated schedule 主幹(未來) | 商業合約 | 依合約 |
| air-routes.com | 航線/頻率 discovery | 站方條款 | 僅 discovery,不提升為 production evidence |
| FlightConnections / FlightsFrom 等 | discovery-only | ToS 禁止抓取 | 僅人工參閱,禁止自動抓取 |
| Prince of Travel / Suitesmile | Cathay 規則轉錄 | 部落格內容 | 標註出處與日期 |
| FlyerTalk 討論串 | 校準測試(routing tests) | 討論區內容 | 標註討論串連結 |
| Jonty/airline-route-data | (不使用) | 無明確授權 | 依策略文件:永不入庫 |

## TDX 顯名聲明(OGDL 第1版 附件格式)

> 提供機關／單位 [年份] [開放資料釋出名稱與版本號]
> 此開放資料依政府資料開放授權條款 (Open Government Data License) 進行公眾釋出,使用者於遵守本條款各項規定之前提下,得利用之。
> 政府資料開放授權條款:https://data.gov.tw/license

TDX 實務要求:應用服務中揭露「資料介接『交通部TDX平臺』」並加入平臺標章。

## Taiwan CAA timetable notice

`public/data/route-network/caa-weekly-schedule-tier-20261006.json` is derived from the original CAA 2026 domestic (dataset 6066) and international/two-strait (dataset 9973) passenger timetable CSV files. Display attribution: **Taiwan Civil Aviation Administration (交通部民用航空局)**. License: [Taiwan Open Government Data License 1.0](https://data.gov.tw/license). The published data asset includes both source file SHA-256 values, official hash-page links, retrieval timestamps, and source CSV row numbers.

This reference tier describes only source-listed carrier/designator/direction recurring weekday schedules within the published validity windows. It does not establish the physical operating carrier, actual operation or cancellation, nonstop service, bookability, or award eligibility. It is not used as a selectable flight or to promote entries into the operator-confirmed flight-number layer.

## DGCA approved schedule identity evidence

`public/data/dgca-schedule-evidence-20261007.json` is a shared evidence-only directory containing 140 SpiceJet, 2,218 IndiGo, and 573 Air India designator/direction identities, with 196, 3,729, and 865 current source-window variants respectively. IndiGo has zero unresolved-station holds and 1,381 expired variants excluded; its 10 source-only PXN variants remain across six identities. The preserved source packets, exact packet checksums, raw fields, per-identity validity windows, conflict flags, and corrected page/physical-row/station/printed-row/hash lineage are under [`docs/source-evidence/spicejet-ss-2026/`](docs/source-evidence/spicejet-ss-2026/), [`docs/source-evidence/indigo-ss-2026/`](docs/source-evidence/indigo-ss-2026/), and [`docs/source-evidence/airindia-dgca-2026/`](docs/source-evidence/airindia-dgca-2026/).

The SpiceJet source is [DGCA approved Summer 2026 SpiceJet domestic schedule](https://public-prd-dgca.s3.ap-south-1.amazonaws.com/InventoryList/airOperation/certification/scheduled/domestic/SpiceJet_SS_2026.pdf), SHA-256 `135845cb7339e567e18b8e971d6aa5537882c3e1fd8d8101b024927e2b38124b`. The IndiGo source is [Airport Movement Report — Approved Summer Schedule Domestic, INTERGLOBE AVIATION LTD.](https://public-prd-dgca.s3.ap-south-1.amazonaws.com/InventoryList/airOperation/certification/scheduled/domestic/INTERGLOBE%20AVIATION%20LTD_2026.pdf), SHA-256 `49202673b590051beef3873127cecf171bea73c67ac1962d0031ccbb109bcd85`. The Air India source is [DGCA Approved Summer Schedule Domestic, Air India Ltd.](https://public-prd-dgca.s3.ap-south-1.amazonaws.com/InventoryList/airOperation/certification/scheduled/domestic/AirIndiaLtd_SS_2026.pdf), SHA-256 `107983dc72d381e6897a5a333556946adcc98daef82e954d52cec1fc402c3086`.

Display attribution: **Directorate General of Civil Aviation (DGCA), Government of India**, with the source title and original PDF linked in the directory. The [DGCA website policy](https://www.dgca.gov.in/digigov-portal/jsp/dgca/footerLink/WebsitePolicy.jsp) permits accurate, non-misleading reproduction with prominent attribution, except identified third-party material. The reviewed pages had no identified third-party rights notice. This is not a Creative Commons, public-domain, or open-data license claim.

These are non-selectable source identity references. SpiceJet's SG/SEJ source identity was independently mapped by IATA; IndiGo's printed `6E` flight designator and `IGO` operator code remain separate, with no carrier-role equivalence inferred. Air India's `AI`/`AIC` attribution uses the reviewed explicit code mapping, not the flight-number prefix. Frequencies remain raw and uninterpreted; timezones are unknown. Date matching checks only the inclusive source identity window. Do not derive weekday schedules, UTC occurrences, guaranteed date availability, connection timing, actual operation, or a no-flight conclusion. Expired identities are excluded from the user directory; Air India's seven aircraft disagreements are retained as field-level holds. A one-sided source row is retained without inventing a reverse leg.

## Avinor XML Public notice

`public/data/route-network/avinor-osl-public-20261006.xml` preserves the exact 849,172 response bytes (SHA-256 `78403435f3c31ae82d9b45249267cf5e843a7db76bf81bd1f39bb856a65adf7f`). Its companion JSON records the single request URL, retrieval time (`2026-10-06T19:47:47Z`), feed update time, six-day request window, accepted-association digest, and UTC validity cutoff (`2026-10-12T19:47:47Z`). The release includes 412 exact matches between candidate keys and Avinor's listed `OperatingAirlineIata`, full `FlightId`, and direction, each with at least one upcoming schedule row and no reported via-airport or cancellation field. A blank `via_airport` means this source reported no intermediate airport; it is not independent proof of physical nonstop service. A listed schedule does not prove that a flight actually operated. The independently reviewed source packet and raw XML remain available for audit; scheduled rows and their UTC times are retained in the user-facing directory.

Required visible nearby attribution: [Flight data from Avinor](https://www.avinor.no/). The [flight-data terms](https://partner.avinor.no/en/services/flight-data/) require that exact text to link to www.avinor.no and remain clearly visible near the data. This OSL capture is a short-lived snapshot, not recurring timetable evidence, proof of actual departure for every row, award inventory, or bookability. At the UTC cutoff, the UI marks these designators stale and removes them from current dated-schedule counts. The public endpoint is `https://asrv.avinor.no/XmlFeed/v1.0`; use only the one-shot, fixed-scope XML Public refresh command documented in [`docs/avinor-xml-public-refresh.md`](docs/avinor-xml-public-refresh.md). Reuse cached responses, leave at least three minutes between manual requests, do not retry automatically, and contact Avinor before heavy load. The contact-required `XmlFeedScheduled` endpoint is not part of this release.

## Avinor XML Public airport-batch notice

`public/data/route-network/avinor-public-airport-batch-20261006.json` retains the accepted 179-key and 22-key input-packet hashes, the exact 201 accepted keys and supporting rows, each source airport's retrieval timestamp and +144-hour freshness cutoff, and the original XML path, byte count and SHA-256. The ten successful snapshots are BGO, TRD, SVG, TOS, BOO, KRS, AES, MOL, EVE and BDU. The original XML bytes are shipped as `avinor-xml-public-{airport}-20261006.xml`; the companion JSON identifies each full hash and response size.

These associations preserve the prior runtime candidate effective dates, including the unknown window, separately from the Avinor snapshot scope. A date beyond a candidate's existing window is displayed as a conflict; it does not extend that window. The original batch entries were display-only. Where a source row was independently accepted in the follow-on ledger, route detail now retains that exact occurrence and may offer a date-specific Planner action for a source-listed departure; arrivals remain references. Each source snapshot expires independently at its recorded UTC cutoff. The directory shows the status by airport, exact linked attribution and original XML links. The ten requests were bounded XML Public queries with `TimeFrom=1`, `TimeTo=144`, `codeshare=Y`, both directions, and were spaced at least three minutes apart. No credentials, access-restricted XML Scheduled endpoint, unattended refresh, award-seat, bookability, recurring-service, or universal actual-departure claim is included.

## Avinor follow-on release notice

`public/data/route-network/avinor-follow-on-evidence-20261006.jsonl` retains 1,373 accepted identity groups and all 5,421 source occurrences from the 11 reviewed snapshots, including source row and unique ID, raw operating-carrier IATA, direction, status, via value, scheduled UTC time, exact occurrence expiry, display-name mapping status, and prior candidate-window history. The accepted ledger spans 498 directed airport pairs and 650 carrier-directed routes. It is disjoint from the first 412 OSL identities. Of these 1,373 groups, 201 identities (179 + 22 previously reviewed candidates) and their 726 occurrences were already promoted by the preceding release. This runtime adds the remaining 1,172 identities and 4,695 occurrences; the earlier 201 are not counted twice. The reviewed packet retains 600 old-candidate-window conflict occurrences, including their historical windows. Eight separate groups (28 occurrences; source codes EZY, LTR, and VAA) remain held for mapping review and are not published as accepted routes.

The original XML bytes are the same SHA-256-pinned assets already published for the OSL release and ten-airport batch, so the follow-on links reuse those assets under `/gcmp/data/route-network/`. The release metadata and validation report retain the packet hashes; no source refresh was performed. Every schedule row expires at its exact scheduled UTC time, and each source has its own six-day cutoff. Current date eligibility is recomputed from both deadlines; expired rows remain available as historical evidence. `OperatingAirlineIata` supports a source-listed scheduled operator identity only. Blank `via_airport` means no intermediate airport was reported, not proof of physical nonstop service or actual operation. These rows do not establish recurring service, award seats, or bookability. The route catalog covers the documented endpoints present in the reviewed packet, not global Avinor airport coverage. Keep the required visible nearby [Flight data from Avinor](https://www.avinor.no/) link separate from the [flight-data terms](https://partner.avinor.no/en/services/flight-data/).

## Avinor remaining-airports release notice

`public/data/route-network/avinor-remaining-airports-release-20261007.json` pins the independently reviewed combined-packet hashes, the 143 accepted exact identities, all 517 accepted dated occurrences, the original per-airport XML response hashes and sizes, and each snapshot's 144-hour freshness deadline. The exact accepted ledger is `avinor-remaining-airports-accepted-20261007.jsonl`; 24 original XML responses are bundled as `avinor-remaining-xml-public-{airport}-20261007.xml`, including KSU only from the successful 2026-10-07 supplement response. This release adds 143 identity keys disjoint from the 2,624 confirmed keys in its pinned prior runtime (839 baseline and 1,785 previously dated Avinor identities). It covers 76 carrier-directed routes: 45 new route records and 31 additions to existing records. The runtime retains each source occurrence's scheduled UTC expiry, row and unique ID, raw carrier, direction, source hash, snapshot retrieval time and cutoff, and the reviewed candidate-window conflict fields.

At the independent review time, 513 occurrences were future-dated and four had expired; each of the 143 identities then had at least one future occurrence. The UI recalculates eligibility against the current clock and the individual source cutoff. Four LTR identities on BOO→VRY and VRY→BOO remain held outside the accepted release. The review rejected 415 source rows across overlapping historical, via-airport and cancelled categories. Do not infer a carrier display name or airline/alliance mapping for unresolved WF; source schedule code and identity do not prove actual departure, recurring service, physical nonstop operation, award availability or bookability. A blank via field means no intermediate airport was reported.

The route directory exposes these source-listed identities and date-specific occurrences in the app and offers a Planner action only for an unexpired, fresh, future source-listed departure from the route origin. The nearby [Flight data from Avinor](https://www.avinor.no/) attribution remains separate from the [Avinor flight-data terms](https://partner.avinor.no/en/services/flight-data/). Raw snapshots are linked below `/gcmp/data/route-network/`; this is a bounded 24-airport release, not global Avinor coverage or a recurring data refresh.

## ANAC SIROS registered-schedule notice

The exact SIROS capture was retrieved at `2026-10-07T07:14:26.504894Z` from [ANAC Registro de Serviços Aéreos](https://siros.anac.gov.br/siros/registros/registros/registros.csv). The captured CSV body is 27,270,017 bytes with SHA-256 `24e500b6ca5c2af6d843c7b12dd9fecad4104667de6bcdfdac894d79e6b3cbf4`. The release manifest is `public/data/route-network/siros-registered-plan-release-20261007.json`; it pins the independently reviewed proposal, the accepted raw source-row archive, the prior review summary/report hashes, and the exact runtime commit/hash used for identity comparison.

The runtime adapter adds only `registeredPlans` schedule evidence to 386 existing route entries. It preserves registration ID, exact raw flight number (including leading zeroes), source ICAO/operator identity, qualified carrier entity where required, stage, weekdays, validity dates, UTC clocks, raw codeshare text, conflict state, and each accepted row's exact bytes and SHA-256. Of 14,997 accepted regular-passenger rows, 57 exact designator identities match existing candidates and 1,390 identities exist on already-present routes but are absent from candidate and confirmed flight layers. The source overlaps zero of the pinned 2,767 confirmed flight associations. The independent review found 2,592 rows sharing a registered-plan identity and 2,575 sharing the same registration/profile; those records retain their source-row lineage on one plan profile instead of multiplying plan facts.

Held and expired rows, 316 Z-prefixed schema-incompatible rows, and 108 new-route admission cases are outside this release. No SIROS entry is promoted into `flightNumbers` or `timeBoundFlightNumbers`; the route map, date-specific Avinor expiry, CAA's separate 488-association reference tier, and existing eligible actions remain independent. SIROS schedule rows are not proof of actual operation, bookability, physical nonstop service, or RTW award eligibility. The source supplies UTC weekdays and clocks but no arrival-day offset. Codeshare marketing identities stay raw and separate from operator identity.

The independently checked reuse basis is [ANAC's SIROS catalog/API terms](https://sas.anac.gov.br/sas/siros_api) and [Decree 8.777/2016](https://www.gov.br/governodigital/pt-br/legislacao/resolucaocginda22432017pdf.pdf), with visible source attribution and subject to resource-specific terms. No Creative Commons variant is asserted, and no unverified 2026–27 PDA claim is used. The original 27 MB capture is not shipped as an app asset; the accepted exact source rows are preserved in `siros-registered-plan-raw-rows-20261007.jsonl.gz` with per-row hashes, while the full captured source-body hash remains pinned in the release manifest.

## ODbL notice 範例(§4.3(a) 建議文字)

> Contains information from MrAirspace aircraft-flight-schedules,
> which is made available here under the Open Database License (ODbL).

## ⚠️ AeroDataBox 特別警示(2026-09 條款更新)

官方公告(scam-alert + 2026-09 terms update)要點:
- 免費/trial/Basic 方案:公開發布任何建構於其資料之上的成品,須可見標示 AeroDataBox + 連結(§5.4)
- 緩存/資料保留預設上限 7 天(§5.5);derived works 例外需審查(§5.6)
- 任何方案都禁止轉賣 API 本身或回傳的原始資料
- B2B 加工轉售情境需 Mega plan 以上的 Commercial Derived Work sublicensing(§5.7)

對 gcmp 的含義:AeroDataBox 用於「校準/交叉驗證」——若發布的結果含其回傳的原始資料,或讓下游可再加工轉售,需檢視現行 ToU(正式 ToU 全文無法從公開頁面取得,建議直接向 AeroDataBox 索取)並確認校準輸出屬於 permitted derived work。
