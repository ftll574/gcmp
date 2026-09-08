# TDX：一次收集公開快照，之後由代理離線重播

> 更新：使用者已產生 2026-09-05T17:09:57.251Z 的 v3 報告及完整公開快照，代理已直接重播成功。見 `docs/tdx-capture-review-2026-09-06.md`；以下「缺少快照」只記錄本功能建立時的歷史狀態，不是目前狀態。

工作區：`E:\workspace\gcmp`。使用者希望不必每次修改程式都手動執行真實驗證。

## 現況與界線

本輪讀到 `verification.json` 仍是 v2、`checkedAt=2026-09-05T16:09:44.097Z`。`test-results/tdx-live` 只有目前與上一份統計報告，沒有可重播快照；不能從班號／日期總數重建原始列。

一般 shell、測試、建置與離線工具可由代理執行。先前被安全檢查阻擋的帶憑證 TDX 認證仍不得執行，也不以代理、間接啟動 gateway 或其他工具繞過。沒有安裝背景排程、要求開放金鑰或啟用付費供應商。

## 已實作

`npm.cmd run schedules:verify` 仍由帳戶持有人主動執行。現在會從**原本同三份航線快照**保存 `test-results/tdx-live/snapshot.json`，不增加請求；再次收集前備份成 `snapshot.previous.json`。未取得任何快照時保留前份檔案，不以失敗結果覆蓋。原 verification 報告與備份行為不變。

這不是 raw response dump。`server/tdx-snapshot.ts` 只構造並驗證固定公開欄位：航空代碼／班號、方向、有效期、星期、時間、更新時間、共掛分欄以及明示的貨運／共掛／濕租／服務型別標記。未知屬性與任意文字不持久化；有不符合白名單的已知欄位時，整列以 null 占位並計入 `redactedRows`，不只丟掉限制標記而意外提升可信度。合法紀錄完整保留，不受報告 16 個範例上限限制。每份最多 2,500 列、每列最多 200 個共掛；讀入檔案上限 32MB。

新增可由代理自行執行的 **`npm.cmd run schedules:replay`**：只讀保存的公開快照，以目前正規化器重跑原三個日期窗，結果寫入 `test-results/tdx-replay/replay.json`。不讀任何 env 檔、不使用 gateway、不取得 token、不 fetch、不因缺少／損壞快照而自動連外；不改寫真實 verification 報告。輸出保留逐日結果，供離線核對，不只是總數。

`mode=offline-replay`、`liveVerification=false`、`externalRequests=0`，並分別保留 capture 與 replay 時間。評估時間固定為每份快照的原始 fetchedAt，**不是把來源 checkedAt／reviewBy 改成現在**。舊資料可供歷史回歸，但不可拿重播成功當作最新班表、營運者驗收或目前仍未過期。

`projectionComplete` 只代表公開欄位投影沒有整列遮蔽，不代表航線／日期涵蓋完整。未知欄位與遮蔽文字無法離線重建；未來若缺少新欄位或要確認上游變化，仍可能需要帳戶持有人重新收集。無須為每次純正規化修正重新消耗認證與班表請求。

## 本輪執行紀錄

代理已直接執行 `npm.cmd run schedules:replay`：由於尚無 `snapshot.json`，正常以 exit code 2 回報缺少輸入、沒有連外，也沒有重設金鑰。沒有偽造真實快照或宣稱完成真實重播。

新增 18 項 synthetic 測試涵蓋白名單／不洩密、缺漏與 null 與空陣列、超過 16 筆仍保留、分季／星期／跨日／排除標記的重播等值、固定歷史時鐘、不完整投影、帳戶診斷仍僅四次 mock 請求，以及 CLI 的缺檔／損壞／正常輸入。CLI 子程序測試明確封鎖 fetch 與 process.loadEnvFile，且確認不修改原 verification。

最終全套 **55 個測試檔、786 個測試通過**，含原 24 個 calibration；`npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd run build`、`git diff --check` 命令鏈已取得 exit code 0。這是程式驗證，不是新的真實 TDX 認證、營運者驗收或瀏覽器驗收。未改變正規化器版本、班表資料或前端；未 commit、push 或部署。

後續接手時，先讀最新 verification 與 snapshot 存在狀態。有快照就由代理直接執行離線重播及測試；沒有時不得把報告範例冒充完整快照，也不要每改一處就再要求使用者收集一次。
