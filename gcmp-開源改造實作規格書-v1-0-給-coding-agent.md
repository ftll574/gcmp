# gcmp 開源改造實作規格書(v1.0)

> 給 Coding Agent 的自包含實作文件。本文件包含全部必要背景、查證事實、決策依據與可執行交付物,無需參照任何外部對話。
>
> 目標 repo:https://github.com/ftll574/gcmp(分支 `main`,TypeScript / React / Vite)
> 文件日期:2026-09-15 · 版本:v1.0

---

## 目錄

1. [背景與目標](#1-背景與目標)
2. [已查證事實(不可更改的決策依據)](#2-已查證事實)
3. [總體架構與執行順序](#3-總體架構與執行順序)
4. [交付物 A:資料授權分層](#4-交付物-a資料授權分層)
5. [交付物 B:航線層整合(MrAirspace + ADSBiq)](#5-交付物-b航線層整合)
6. [交付物 C:月更管道(GitHub Actions)](#6-交付物-c月更管道)
7. [交付物 D:repo 門面](#7-交付物-drepo-門面)
8. [驗收標準與測試](#8-驗收標準與測試)
9. [已知限制與風險](#9-已知限制與風險)
10. [附錄:資料來源一覽](#10-附錄資料來源一覽)

---

## 1. 背景與目標

### 1.1 產品現況

gcmp 是一個「Taiwan-first round-the-world award route planner」:輸入多腿行程 → 標記 stopover / surface sector → 對照 RTW 與多航司里程兌換規則驗證 → 分享 URL。線上版 https://ftll574.github.io/gcmp/。

技術棧:TypeScript(strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)、React 19、Vite 8、zod(資料驗證)、d3-geo(SVG 地圖)、maplibre-gl、Vitest(861+ tests,61+ files)。**無 Playwright / 無 E2E**。

關鍵檔案角色:
- `src/lib/rtw/validate.ts` — 規則引擎核心,單一入口 `validateRtwRoute(ruleSet, legs, inputs, request?)`,28 條規則,純函式(engine purity,由 ESLint 強制不得 import React)
- `public/data/rtw-products/current.json` — 產品規則(12 個 products + 49 個 ticketingPrograms,version 2026.2)
- `CLAUDE.md` — 專案憲章:binding scope(convergence-contract 驗收前不得開新子系統)、Iron Rule(`tests/calibration/flyertalk-routings.test.ts` 24 個校準測試任一失敗即阻擋 ship)
- `docs/flight-data-source-strategy-2026-09-11.md` — 證據層級設計(見 5.1)

### 1.2 本次改造的目標

執行四個交付物(照順序):
- **A. 資料授權分層** — 建立 `DATA_LICENSE` + `THIRD_PARTY_NOTICES.md`,為資料檔補來源/授權標註
- **B. 航線層整合** — 把現有 MrAirspace / ADSBiq ODbL 候選資料升級為自動化、可驗證的生成管道
- **C. 月更管道** — GitHub Actions 定時重建資料 + 發布 release + checksum 驗證
- **D. repo 門面** — 描述 / badge / License 段落同步

### 1.3 核心設計原則(來自先前研究,全部有查證依據)

1. **授權先行**:程式碼 MIT、資料 ODbL 1.0——因為 repo 已含兩個 ODbL 來源,ODbL §4.4 share-alike 要求衍生資料庫以 ODbL 發布,這是唯一相容路徑
2. **資料與程式碼分層**:資料檔自帶 source/license 欄位,主資料檔(airlines/airports)必須補上
3. **自動化優先**:資料型開源專案死因前三名——單一上游依賴、人工更新、無自動化(OpenFlights 即死於此)
4. **月更節奏**:IATA 一年兩次換季(3 月最後一個週日 / 10 月最後一個週日起),月更(12 次/年)已 4–6 倍於換季頻率
5. **不引入不相容授權**:CC BY-SA 與 ODbL 不相容(OSM Foundation 明文),Wikipedia 等 CC BY-SA 來源不得進資料層

---

## 2. 已查證事實(不可更改的決策依據)

> 以下全部於 2026-09-15 查證。標註來源。**不要重新推導,直接採用。**

### 2.1 上游資料源授權

| 來源 | 授權 | 義務 | 來源 |
|---|---|---|---|
| OurAirports | Public Domain (Unlicense) | 無強制 attribution(「you're not required to」) | ourairports.com/data |
| MrAirspace aircraft-flight-schedules | **ODbL 1.0**(檔名 `LICENSE-ODbL.txt`) | notice(§4.3)+ share-alike(§4.4)+ 機器可讀提供衍生庫(§4.6) | github.com/MrAirspace/aircraft-flight-schedules |
| ADSBiq (Sky-Power-Services/adsbiq-data) | ODbL 1.0 | 同上 | github.com/Sky-Power-Services/adsbiq-data |
| 交通部 TDX | 政府資料開放授權條款 第1版(OGDL) | **顯名聲明**(見 4.3);可再轉授權;無 share-alike;與 CC BY 4.0 相容 | data.gov.tw/license |
| AeroDataBox | 商業 ToU(2026-09 更新) | **免費方案強制 attribution;緩存上限 7 天;任何方案禁止轉賣原始資料;B2B 加工轉售需 Mega plan+** | aerodatabox.com/scam-alert、/2026-09-terms-update |
| Jonty/airline-route-data | **無明確授權** | 依專案策略文件:永不入庫 | docs/flight-data-source-strategy-2026-09-11.md |
| FlightConnections 等 discovery 站 | ToS 禁止抓取 | 僅人工參閱,禁止自動抓取 | flightconnections.com/terms-of-service |

### 2.2 MrAirspace 資料格式(實抓 GitHub API 驗證)

- 發布方式:**僅 GitHub Releases,無 API**;每季一個 parquet 檔
- 最新 release:`aircraft_flight_schedules_2026_quarter2`,asset `2026_Q2_detailed_github.parquet`(911,949,077 bytes ≈ 870MB),發布 2026-07-11
- 拉取用 `GET /repos/MrAirspace/aircraft-flight-schedules/releases/latest`(**注意:README 的 Releases 連結指向錯誤的 `aircraft-flight-logs` repo,勿用**)
- 18 個欄位(完整清單):
  `ICAO_Hex`, `Reg`, `AC_Type`, `AC_Type_Description`, `AC_Type_Detailed`(2026 Q1 起), `Airline`(ICAO 碼), `Callsign`, `Track_Origin_Lat/Lon/FL_Ft/DateTime_UTC/ApplicableAirports`, `Track_Destination_Lat/Lon/FL_Ft/DateTime_UTC/ApplicableAirports`, `Route_Validation_Based_on_Callsign`
- 語意重點:
  - 覆蓋不足時起訖欄位為 `-`;機場指定為起訖點 9km 範圍內的商用機場(可能列出 2 個)
  - 時間為近似跑道時間 UTC(離場=最後 ground 紀錄,到場=第一 ground 紀錄)
  - **跨季檔案有重疊,禁用 `drop_duplicates()`**,以 `Track_Origin_DateTime_UTC` 落在該季月份內判定
  - 2026 Q2 含 2026-05-05~07 資料缺口(adsb.lol 歸檔問題)——完整性檢查要容忍並記錄
  - 2025 Q2 起 enroute 加入 callsign 比對,FRA–DXB 重複航班 95%+ 準確

### 2.3 gcmp 現況(實抓驗證)

- `LICENSE` = MIT,Copyright (c) 2026 ftll574,**僅涵蓋 Software,未涵蓋資料**
- `public/data/airlines.json`(45 筆)與 `airports.json`(數千筆):**純陣列,無 source/license/attribution 欄位**
- `public/data/route-network/mrairspace-flight-number-candidates.json` 與 `adsbiq-recent-route-flight-number-candidates.json`:**已有** `source` + `license: "ODbL-1.0"` 標註(好榜樣)
- `public/data/route-network/runtime-current.meta.json`:有 `builtOn`/input hashes/`routes: 30712`,**無 license/source 欄位**
- repo 根目錄與 public/ 均**無** DATA_LICENSE / THIRD_PARTY / NOTICE 檔案
- README badge 硬編碼 `861 tests passing`(已過期,CLAUDE.md 基準 895);repo 描述仍為舊的 mileage calculator 定位
- 已有腳本:`scripts/harvest-jx-schedules.mjs`(STARLUX API,每季)、`schedules:verify` / `schedules:replay`(TDX 快照)、`server/hybrid-schedules.ts`、`server/operator-evidence.ts`、`scripts/build-runtime-route-network.ts`

### 2.4 環球票/聯盟現況(2026-09 查證)

- 星空聯盟:26 家;ITA Airways 2026-04-01 加入(2025-02 退出天合);SAS 2024-09-01 轉天合;Avianca 仍在星空;Asiana 2026-12-16 退出星空(併大韓)
- 寰宇一家:Oman Air 2025-06-30 加入(第 15 家)、Fiji Airways 2025 加入、Hawaiian 2026-04 加入
- 天合聯盟:SAS 2024-09-01 加入(第 21 家)、ITA 2025-04-30 完成退出
- oneworld Explorer(2025-07 官方 PDF):最少 3 段、最多 16 段;洲內上限:非洲 4、亞洲 4、歐洲/中東 4、北美 6、南美 4、西南太平洋 4;可加購每洲 2 段(至多 20 段);至多 15 個中途停留
- SkyTeam Go Round the World Pass:仍存在,官方有 RTW planner
- 星空環球票具體規則:未查證到,列入 TODO

---

## 3. 總體架構與執行順序

```text
執行順序(依賴關係):
A. 資料授權分層 ──→ B. 航線層整合 ──→ C. 月更管道 ──→ D. repo 門面
(1 小時)            (2-3 天)          (0.5-1 天)       (30 分鐘)

A 必須先做:授權表述與實際狀態不符(資料已含 ODbL 來源但整庫只宣稱 MIT)
B 的產物被 C 的管道自動化;D 是最後門面
```

**每次改動都要跑的驗證(專案既有)**:`npm run test`(vitest run --maxWorkers=4)、`npm run typecheck`(tsc -b --noEmit)、`npm run lint`(eslint .)。**Iron Rule:`tests/calibration/flyertalk-routings.test.ts` 24 個校準測試任一失敗即阻擋。**

---

## 4. 交付物 A:資料授權分層

### 4.1 新增 `DATA_LICENSE`(repo 根目錄,完整全文)

```text
DATA — Open Database License (ODbL) 1.0
=======================================

The data files under public/data/ (and any derived dataset published
from this repository) are licensed under the Open Database License
(ODbL) v1.0, unless a specific file carries its own source/license
annotation that overrides this default.

The ODbL is a share-alike license. If you publicly use a database
derived from this data, you must:

  1. Keep this notice (or a link to this file) with the derived
     database (ODbL §4.2/§4.3);
  2. Release the derived database under the ODbL or a compatible
     license (ODbL §4.4);
  3. Make the complete derived database or the change set available
     in machine-readable form, free of charge (ODbL §4.6).

Full license text: https://opendatacommons.org/licenses/odbl/1-0/

Per-source provenance and license obligations are listed in
THIRD_PARTY_NOTICES.md in this repository. When a file under
public/data/ carries its own "source"/"license" fields, those
fields take precedence for that file.

This data license covers the database and its compilation. It does
not cover: (a) trademarks or logos of airlines/airports/governments;
(b) personal data (passenger or otherwise); (c) code under the MIT
License.

Not legal advice. Contact a lawyer before commercial redistribution.
```

### 4.2 新增 `THIRD_PARTY_NOTICES.md`(完整全文)

```markdown
# Third-Party Notices & Data Provenance

更新時間:2026-09-15 · 用途:記錄 public/data/ 每個資料來源的授權與義務。
單一檔案內有自帶 source/license 欄位者,以該欄位為準。

## 資料來源清單

| 來源 | 用途 | 授權 | 義務 |
|---|---|---|---|
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
```

### 4.3 資料檔修正(需要人工確認來源)

| 檔案 | 現況 | 動作 |
|---|---|---|
| `public/data/airlines.json` | 純陣列,45 筆 `{iata, icao, name, country}` | 頂層加 metadata:`{ "source": "...", "license": "...", "attribution": "..." }`;來源需 repo owner 確認(疑似 OurAirports / openflights 衍生) |
| `public/data/airports.json` | 純陣列,數千筆 `{iata, name, city, country, lat, lon, icao}` | 同上;欄位結構與 OurAirports 高度吻合,極可能公有領域,仍需 owner 確認採集來源 |
| `public/data/route-network/runtime-current.meta.json` | 有 `builtOn`/hashes,無授權 | 補 `source` 與 `license` 欄位 |
| `README.md` License 段落 | 僅「License: MIT」 | 改為「Code: MIT · Data: ODbL 1.0(見 DATA_LICENSE / THIRD_PARTY_NOTICES.md)」 |

---

## 5. 交付物 B:航線層整合

### 5.1 尊重現有證據層級(不可破壞)

策略文件定義(照引):OAG/Cirium contract feed(全球 dated schedule 主幹)→ 官方/政府佐證(TDX)→ air-routes(discovery)→ ADS-B(operational cross-check)→ discovery-only(永不提升為 production evidence)。

**現有檔案必須保留**:`mrairspace-flight-number-candidates.json`、`adsbiq-recent-route-flight-number-candidates.json`(已有 source/license 標註,是範例)、`runtime-current.json`(30,712 條)。

### 5.2 新增 `scripts/ingest-mrairspace.ts`

**功能**:拉取 MrAirspace 最新 release → 下載 parquet → 過濾 → 產出標準化 candidates JSON。

```typescript
// 規格(實作細節可調整,介面與欄位必須一致)

// 1. 拉 release 元資料(勿用 README 的錯誤連結)
//    GET https://api.github.com/repos/MrAirspace/aircraft-flight-schedules/releases/latest
//    → tag_name, assets[].name(模式: YYYY_Q{n}_detailed_github.parquet), assets[].browser_download_url

// 2. 下載 parquet(約 870MB)
//    解析建議:duckdb 或 parquetjs + fetch(stream)

// 3. 過濾與標準化:
//    - 只留 Airline 非空(排除 GA)
//    - Airline 欄位是 ICAO 碼 → 對映 IATA(用現有 airlines.json 或 ICAO→IATA 對照)
//    - 取 Track_Origin_ApplicableAirports / Track_Destination_ApplicableAirports(ICAO → IATA)
//    - 以 Track_Origin_DateTime_UTC 落在該季月份內判定(禁用 drop_duplicates)
//    - 記錄 2026 Q2 的 2026-05-05~07 缺口(容忍 + 寫入 meta)

// 4. 產出 public/data/route-network/mrairspace-flight-number-candidates-YYYY-Q{n}.json:
//    {
//      "source": "https://github.com/MrAirspace/aircraft-flight-schedules",
//      "license": "ODbL-1.0",
//      "quarter": "2026-Q2",
//      "generatedAt": "<ISO>",
//      "knownGaps": ["2026-05-05", "2026-05-06", "2026-05-07"],
//      "candidates": [
//        { "airline_iata": "BR", "origin": "TPE", "destination": "LAX",
//          "firstSeenUtc": "...", "lastSeenUtc": "...", "observationCount": 12 }
//      ]
//    }
```

### 5.3 升級判定:`candidates → runtime`

```text
每個 IATA 機場對 (A→B) 的升級判定:
1. 候選來源計數:candidates 中出現 ≥2 次獨立觀測(MrAirspace 季度 + ADSBiq 日期 各算獨立來源)
2. 聯盟航司過濾:airline_iata ∈ alliance_membership 且 member_since <= snapshot_date
3. 方向性:directional 記錄(A→B 與 B→A 分開計)
4. 產出欄位:airline_iata, origin, destination, first_seen_quarter, last_seen_quarter,
   observation_count, evidence_sources[], confidence
5. confidence 分級:
   - 'high'    : ≥2 來源且跨 ≥2 季度
   - 'medium'  : ≥2 來源單季度,或單來源跨多季度
   - 'candidate': 單來源單季度(保留但標註,不進 runtime)
```

### 5.4 合併策略

- 不刪除既有 `runtime-current.json` 人工策展條目
- 新管道產物寫入 `route-network/runtime-generated-YYYY-MM.json`,與策展檔並存
- `meta.json` 記錄 `mergeStrategy: "curated + generated"`;衝突時 **curated 優先**(人工核實過)
- 驗證規則(進 CI,與現有 zod schema 對接):
  - `origin`/`destination` 必須存在於 `airports.json`
  - `airline_iata` 必須存在於 `airlines.json` 或 `alliance_membership`
  - 同 airline+origin+destination 不可重複(directional)
  - observation_count 與上游季度檔一致性抽查(抽 5 條人工核對)

---

## 6. 交付物 C:月更管道

### 6.1 新增 `.github/workflows/monthly-data-release.yml`(完整全文)

```yaml
name: monthly-data-release

on:
  schedule:
    - cron: '30 4 1 * *'        # 每月 1 日 04:30 UTC(避開整點高峰)
  workflow_dispatch: {}          # 手動補跑

permissions:
  contents: write                # release 需要

jobs:
  build-and-release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install
        run: npm ci

      - name: 拉取 MrAirspace 最新 release
        run: npx tsx scripts/ingest-mrairspace.ts

      - name: 重建 runtime route-network
        run: npx tsx scripts/build-runtime-route-network.ts

      - name: 重建班表(harvest 腳本按需)
        run: |
          npx tsx scripts/harvest-jx-schedules.mjs || echo "harvest skipped (no API key?)"

      - name: 打包資料
        run: |
          mkdir -p dist
          ./scripts/package-data.sh dist/data-$(date +%Y-%m).zip

      - name: 產生 SHA256 checksum manifest
        working-directory: dist
        run: |
          find . -type f -exec sha256sum {} \; | sed 's|^\./||' | sort > SHA256SUMS
          cat SHA256SUMS

      - name: 驗證 checksum
        working-directory: dist
        run: sha256sum -c SHA256SUMS || exit 1

      - name: 建立/更新 release 並上傳
        uses: softprops/action-gh-release@v3
        with:
          tag_name: data-$(date +%Y-%m)
          generate_release_notes: true
          files: |
            dist/*.zip
            dist/SHA256SUMS
          fail_on_unmatched_files: true
```

### 6.2 已知限制與對策(查證)

| 限制 | 對策 |
|---|---|
| 公開 repo 60 天無活動,排程被自動停用 | 月更 run 末尾把更新的 `SHA256SUMS` commit 回 main(既是活動紀錄也保排程);或監控 Actions 頁 banner |
| schedule 事件在高負載時延遲/可能丟棄 | cron 設在整點邊角(`04:30` 而非 `04:00`) |
| 用 `GITHUB_TOKEN` 建的 release 不觸發下游 `release.published` workflow | 若要串接,改用 PAT secrets |
| artifact 只留 90 天 | 資料發布用 release asset(永久),artifact 只當 build 間暫存(`retention-days: 7`) |

### 6.3 整合現有腳本

- `scripts/harvest-jx-schedules.mjs`(原每季手動)→ 月更中嘗試跑,無 API key 時跳過並記錄
- `schedules:verify` / `schedules:replay`(TDX 快照)→ 月更管道中跑 `schedules:verify`,失敗時**保留上期資料**(不發布壞資料)

---

## 7. 交付物 D:repo 門面

| # | 項目 | 現況 | 改法 |
|---|---|---|---|
| 1 | repo 描述 | "Mileage runner routing calculator — replaces the FlyerTalk-thread habit..."(舊定位) | 改為:「Taiwan-first round-the-world award route planner. Validate RTW itineraries against alliance award rules, share by URL.」(Settings → Description) |
| 2 | README badge | 硬編碼 861 tests(過期,基準 895) | 改用 CI badge:`![tests](https://github.com/ftll574/gcmp/actions/workflows/ci.yml/badge.svg)` |
| 3 | README License 段落 | 僅「License: MIT」 | 改為「Code: MIT · Data: ODbL 1.0(見 DATA_LICENSE / THIRD_PARTY_NOTICES.md)」 |
| 4 | CHANGELOG | 有檔 | 加一筆「2026-09-15:data licensing split (ODbL), monthly release pipeline, route-network generation」 |
| 5 | README Current Limits | 誠實列出 42 筆 directional 紀錄、138 筆策展班表 | 保留(這是優點),加一句「route-network 已開始以 MrAirspace/ADSBiq 生成管道擴充」 |
| 6 | `VERSION` 檔 | 1.9.0 | 資料層獨立版本:data `2026-09` + code SemVer 分開記 |

---

## 8. 驗收標準與測試

### 每個交付物完成即驗收

**A(授權)**: `ls DATA_LICENSE THIRD_PARTY_NOTICES.md` 存在;`airlines.json`/`airports.json` 有 metadata;`npm run test && npm run typecheck && npm run lint` 全綠。

**B(航線層)**: `npx tsx scripts/ingest-mrairspace.ts` 能跑出 `mrairspace-flight-number-candidates-*.json`(含 source/license/knownGaps);`runtime-generated-*.json` 產出;CI 驗證規則(airport/airline 存在性、不重複)通過。

**C(管道)**: `workflow_dispatch` 手動觸發成功;release `data-YYYY-MM` 建立且含 `SHA256SUMS`;`sha256sum -c SHA256SUMS` 通過;TDX verify 失敗時保留上期資料的行為被驗證。

**D(門面)**: repo 描述、badge、License 段落、CHANGELOG 更新。

### 回歸

**Iron Rule(不可妥協)**: `tests/calibration/flyertalk-routings.test.ts` 24 個校準測試任一失敗 → 阻擋 ship,先修復再繼續。

---

## 9. 已知限制與風險

| 風險 | 對策 |
|---|---|
| `airlines.json`/`airports.json` 來源不明 | 需 repo owner 確認採集來源才能標授權;在此之前標 `"source": "unattributed (pending confirmation)"` |
| AeroDataBox ToU 全文未公開 | 涉及商業化前直接向官方索取;校準輸出是否屬 permitted derived work 需檢視 |
| 星空環球票具體規則未查證 | 列入 TODO,不影響 MVP(先做 oneworld) |
| MrAirspace 資料有季度缺口與重疊 | 已在 ingest 規格中處理(knownGaps 記錄、月份判定、禁 drop_duplicates) |
| 單一維護者 burnout | 自動化優先;月更管道本身就是對策 |
| GitHub Actions 排程 60 天停用 | 6.2 對策:月更 commit SHA256SUMS 回 main |

---

## 10. 附錄:資料來源一覽

| 資料檔 | 來源 | 授權 |
|---|---|---|
| `public/data/airports.json` | 待 owner 確認(疑似 OurAirports) | 待標 |
| `public/data/airlines.json` | 待 owner 確認 | 待標 |
| `public/data/route-network/mrairspace-*.json` | MrAirspace | ODbL-1.0(已標) |
| `public/data/route-network/adsbiq-*.json` | ADSBiq | ODbL-1.0(已標) |
| `public/data/schedules/current.json` | STARLUX API / AeroRoutes / 華航 PDF | 站方條款 |
| `public/data/rtw-products/current.json` | 官方文件 + 社群轉錄 | 見 THIRD_PARTY_NOTICES |
| TDX 管道產物 | 交通部 TDX | OGDL 第1版(顯名聲明) |

---

*本規格書所有事實查證於 2026-09-15,來源見各節。AeroDataBox 正式 ToU 全文未公開。非法律意見。*