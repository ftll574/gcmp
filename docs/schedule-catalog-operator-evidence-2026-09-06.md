# 以既有 schedule catalog 擴張 bounded operator evidence

本輪延續 `tdx-bounded-operator-acceptance-2026-09-06.md`，沒有新增 live provider，也沒有把 AeroDataBox 接進正式流程。

## 新增可用證據

`server/operator-evidence.ts` 現在除了 EVA 官方 flight-status exact identities，也可使用既有 `public/data/schedules/current.json` 中 **chart-verified + exact route + exact flight number + exact date/weekday** 的紀錄作第二層 operator evidence。

- `BR28 TPE→SFO`：來源為既有 AeroRoutes airline-schedule filing，`effectiveFrom=2026-03-29`，以 `industry-timetable` 類型標記；不是 BR-prefix 規則。
- `JX233 TPE→HKG`、`JX234 HKG→TPE`、`JX12 TPE→SFO`：來源為 STARLUX 官方 timetable API；只在 catalog 明示的 `2026-09-09..2026-09-15` 視窗內可升級，視窗外仍 unresolved。
- 同一 catalog 中過期的 CI 2025 資料不會被拿來驗證 2026 航班。
- CX 仍沒有 exact independent operator evidence，維持 unresolved。

`PublicationSourceSchema` 新增 `industry-timetable`，用來區分 airline-owned publication 與航空業 filing/timetable 證據；不把 AeroRoutes 冒充航空公司官方頁面。

## 產品篩選仍獨立

Raw gateway 在 JX 官方有效視窗內會把 JX exact flights 放入 `published`。但 EVA Star Alliance / Cathay oneworld 產品仍會依 eligible operating carrier 過濾，因此 JX 不會因為「營運者已確認」就變成 BR/CX RTW 可選航班。這是 evidence correctness 與 product eligibility 的分層。

## 真實 Edge 驗收

`npm.cmd run schedules:qa:replay` 在保存的 1,111-row TDX snapshot 上、以 evidence review time 執行 3 routes × 3 viewport：

- TPE→HKG 2026-09-10：BR product 顯示 7 verified BR + 39 unresolved；raw evidence 中 JX exact flights 已確認但因產品不合資格而不顯示。
- HKG→TPE 2026-09-07：7 verified BR + 41 unresolved；STARLUX window 尚未開始。
- TPE→SFO 2026-10-24：**BR8/BR18/BR28 共 3 verified + 13 unresolved**；實際選取 BR28，`fn=28` 寫入 share URL，完整 document reload 後仍保留。

9 組 Edge cases 全部通過，0 unexpected request、0 runtime error；沒有 TDX 認證、沒有 AeroDataBox request、沒有 live schedule fallback。

## 回歸與基線

舊 synthetic tests 原本用 BR28 當「刻意未驗證」資料，現在會撞到真實 evidence catalog；已統一改成不存在的 BR998。真實 BR28/JX 行為由獨立 operator-evidence / captured-data regressions 鎖定。

最終：**61 test files / 861 tests passed**；TypeScript、ESLint、production build、`git diff --check` 均通過。未 commit、push、deploy。
