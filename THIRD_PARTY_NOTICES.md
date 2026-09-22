# Third-Party Notices & Data Provenance

更新時間:2026-09-20 · 用途:記錄 public/data/ 每個資料來源的授權與義務。
單一檔案內有自帶 source/license 欄位者,以該欄位為準。

## 資料來源清單

| 來源 | 用途 | 授權 | 義務 |
|---|---|---|---|
| OpenFlights (github.com/jpatokal/openflights, data/airlines.dat) | airlines.json 聯盟成員表碼位(45/45 交叉驗證,見 scripts/verify-airlines-provenance.ts) | ODbL 1.0 (data/LICENSE) | notice(4.3)+ share-alike(4.4)+ 機器可讀提供衍生庫(4.6) |
| OurAirports (ourairports.com/data) | 機場/跑道/導航台基礎資料 | Public Domain (Unlicense) | 無強制 attribution(禮貌性即可) |
| MrAirspace aircraft-flight-schedules (github.com/MrAirspace/aircraft-flight-schedules) | 航線/航班號候選 overlay | ODbL 1.0 | notice(4.3)+ share-alike(4.4)+ 機器可讀提供衍生庫(4.6) |
| ADSBiq (github.com/Sky-Power-Services/adsbiq-data) | 航線/航班號候選 overlay | ODbL 1.0 | 同上 |
| 交通部 TDX 運輸資料流通服務 (tdx.transportdata.tw) | 台灣班表 dated 管道 | 政府資料開放授權條款 第1版 (OGDL) | 顯名聲明(見下)+ 可再轉授權;無 share-alike |
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
