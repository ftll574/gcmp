# AeroDataBox 免費額度 calibration prototype

工作區：`E:\workspace\gcmp`。此輪依使用者要求先以**免費來源**評估第二營運者證據，不把第三方資料直接接進正式 UI，也不取代 TDX / 航空公司官方證據。

## 為什麼選這個測法

2026-09-06 查閱 AeroDataBox 官方文件：RapidAPI 仍有 unrestricted-duration FREE plan；目前 Basic trial 為 600 API units / month、1 req/s。Flight Status `GET /flights/number/{flight}/{date}` 是 Tier 2，因此一次約 2 units。官方 codeshareStatus 明確區分 Unknown / IsOperator / IsCodeshared；Unknown 不能當營運者證據。官方也提醒部分機場在 codeshare 狀態缺失時可能用複雜過濾推估 operational flights，而且可能 false results，因此 GCMP 不能把單一 AeroDataBox 結果當 source of truth。

來源：
- https://aerodatabox.com/pricing/
- https://aerodatabox.com/api-spec
- https://aerodatabox.com/flight-history/
- https://pub.dev/documentation/aerodatabox/latest/openapi.api/CodeshareStatus-class.html

## 實作

新增 `server/aerodatabox-calibration.ts` 與 `npm.cmd run schedules:calibrate:aerodatabox`。這是 acceptance/calibration harness，不是新的 production provider subsystem。

- 輸入只讀既有 `test-results/tdx-live/snapshot.json`。
- 只從 current normalizer 仍在 `references` 的 unresolved designators 抽樣，已由 EVA 官方 evidence 升級的 BR8/18/809/851…不浪費 quota 重查。
- deterministic stratified sample：優先每條 route × airline code 一筆，再補剩餘，預設 18 筆、硬上限 30 筆。
- RapidAPI endpoint 固定為 `https://aerodatabox.p.rapidapi.com/flights/number/{designator}/{date}`，關閉 aircraft image/location。
- hard rate limit：至少 1.1 秒一請求；不併發。
- API key 只可放 `.env.aerodatabox.local` 的 `AERODATABOX_RAPIDAPI_KEY`；`.local` 由既有 gitignore 排除。報告不輸出 key、raw provider body 或任意未知欄位。
- 沒有 key 時 exit code 2，只產出 target plan，**0 external requests**；不 fallback 到任何其他 provider。

目前離線 plan 共 18 筆，包括 HKG↔TPE 的 BR289x / CI / CX / HB / HX / JX / UO，以及 TPE→SFO 的 AS7218 / AV4507 / BR28 / CI4 等。這些是 calibration targets，不是已證明的 operator mapping。

## 真實免費校準結果

使用者設定 RapidAPI free key 後，`npm.cmd run schedules:calibrate:aerodatabox` 實際查了 18 筆，沒有重試：16 筆得到唯一 `IsOperator` assertion、2 筆（UO110/UO111）為 Unknown、0 筆 provider-internal multi-operator conflict。表面 resolved rate 為 88.9%，但這**不是營運者正確率**。

關鍵反例：AeroDataBox 對 `AS7218 TPE→SFO 2026-09-07` 回 `IsOperator / AS`。另只花 1 次免費 request 查同日 `JX12`，AeroDataBox 又回 `IsOperator / JX`（另帶一筆 Unknown）。獨立公開資料明確顯示 AS7218 是 JX12 的 codeshare、由 STARLUX JX12 執飛；專案既有 STARLUX 官方 timetable catalog 也有 JX0012 TPE→SFO 的 chart-verified operating row（有效抽樣窗 2026-09-09～09-15，不能倒推 09-07）。因此 AeroDataBox 的 `IsOperator` 只能視為 provider assertion，不能單獨當 GCMP operating-carrier truth。

本輪總計消耗 19 次免費 requests；沒有任何結果寫入 production operator registry。

### 兩來源交叉驗證與 known controls

新增 `npm.cmd run schedules:crossvalidate:aerodatabox`，只讀已保存的 calibration report 與 `public/data/schedules/current.json`，不呼叫 AeroDataBox。嚴格要求「同方向＋同班號＋同一天＋chart-verified，且 effective window / weekday 皆成立」。原 18 筆中，16 筆有 provider assertion，但目前只有 **BR28 TPE→SFO 2026-09-07** 恰好有同日獨立班表證據，且結果一致；另外 15 筆是 `insufficient-evidence`，不是衝突。CI 現有官方目錄只到 2025-03-29，JX 官方測試窗自 2026-09-09 起，均不可倒推到 9/7。

另外以「已知答案」測 provider 本身。9/10～9/12 的 8 筆 controls 中僅 BR8 回出 operator，顯示免費 Flight Status 對較遠未來日期的覆蓋不穩；改查 **2026-09-07** 後，BR851、BR852、BR18、BR28 都 HTTP 200 且唯一回 `IsOperator=BR`，加上先前 BR8，已知 BR controls 為 **5/5 agreement**。因此免費版近程 exact-flight 查詢有實用價值，但不能把空結果當停飛，也不能把單一 `IsOperator` 當真值。

目前最合理定位：**TDX / 官方班表是底層；AeroDataBox 是低頻、可快取的第二證據。** 只有和另一份獨立官方或 chart-verified 資料一致時才可成為 high-confidence candidate；provider-only、Unknown、或來源衝突都維持不可選。

## 判讀規則（修正後）

只持久化白名單觀察：designator、route/date、match count、codeshareStatus 集合、airline IATA 集合、唯一 `IsOperator` airline（若存在）。

- 唯一 IsOperator → `provider-asserted`，只代表 AeroDataBox 自己的 assertion
- 沒有 IsOperator → unknown
- 多個 IsOperator airline → conflict

`provider-asserted` **不會自動寫入 production operator evidence registry**。必須再和航空公司官方班表、現有 chart-verified operating catalog 或另一個獨立 provider 一致，才能升級成 high-confidence 候選。AS7218/JX12 反例證明這個交叉驗證不可省略。

## 驗證

新增 calibration 與 cross-validation 回歸，涵蓋：無 key 零請求、抽樣排除已驗證 EVA、exact RapidAPI endpoint/header、報告不洩漏 key/raw secret、Unknown 與多 operator conflict 不會升級、單一 `IsOperator` 只可標成 `provider-asserted`，以及同日 exact chart evidence 的 agreement/conflict/insufficient-evidence 判讀。

第一輪 prototype 完成時全套 **60 個測試檔、852 個測試通過**；TypeScript、ESLint、production build、`git diff --check` 全部通過。之後評分語意修正的 focused tests / TypeScript / ESLint 亦通過。未 commit、push、deploy。
