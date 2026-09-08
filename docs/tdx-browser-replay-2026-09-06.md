# TDX 歷史快照：真實 Edge 操作驗收

> Historical record. The later bounded EVA operator-acceptance round supersedes
> the "operator evidence still missing" state below. See
> `docs/tdx-bounded-operator-acceptance-2026-09-06.md`.
>
> **2026-09-06 CX completion addendum:** the current `schedules:qa:replay`
> deliberately separates still-fresh historical replay from later operator/UI
> fixture cases. CX completion evidence was reviewed after the saved TDX rows'
> four-hour freshness window, so those later cases reuse the saved public row
> content with explicitly synthetic freshness and are labeled as such in Edge
> and `report.json`. They are UI/resolver integration evidence, never a new or
> fresh TDX capture. See `docs/cx-cross-source-operator-evidence-2026-09-06.md`.

工作區：`E:\workspace\gcmp`。接續 `tdx-capture-review-2026-09-06.md`；不是重新盤點，也沒有再要求使用者執行認證或收集相同資料。

## 營運者證據仍未通過

本輪先核對長榮與國泰的公開官方班表入口，未取得足以將現有 TDX 參考紀錄升格的「特定班號、方向、適用期間及實際營運者」證據。長榮互動頁面的進一步工具讀取遭安全檢查阻擋後即停止，沒有透過其他工具或瀏覽器重試被阻擋的內容。國泰頁面明示客滿航班不會顯示，空結果不可作為無班次證據。

官方公開參考：
- `https://booking.evaair.com/flyeva/eva/b2c/flight-schedules.aspx?lang=en-global`
- `https://www.cathaypacific.com/cx/en_TW/book-a-trip/timetable.html`

沒有新增營運者對照表、航空黑名單、班號長度規則、按同時刻推定共掛或人工猜定的適用日期。`3-unverified-operators` 保持不變，TDX 仍是可供客服核對、不可直接當成營運航班選取的 references。這是尚未通過的產品門檻，不因測試全綠而消失。

## 已完成的可重複瀏覽器驗收

新增 `npm.cmd run schedules:qa:replay`，由代理自行執行。`scripts/qa-tdx-replay.mjs` 啟動自己管理的 loopback Vite（5196，strictPort）與隔離 headless Edge；結束時關閉自己啟動的程序，不操作使用者的瀏覽器 profile 或外部服務。

`scripts/lib/tdx-browser-replay.ts` 驗證完整公開欄位快照，依查詢月份使用原正規化器及原 fetchedAt 產生結果。Chrome DevTools Protocol 在請求送往 Vite proxy 前，以快照回覆 `/api/schedules`。其餘 API、非 GET、陌生航線、重複／多餘參數與外部 URL 均攔截，不建立班表 HTTP server、不啟動 TDX gateway、不載入 `.env.schedules.local`、不認證、不在缺資料時切到 live fallback。

瀏覽器日期固定在原 capture 時間，截圖附醒目的 HISTORICAL TDX REPLAY 標示；source.checkedAt/reviewBy 未延長。此隔離測試中的剪貼簿是 spy，不存取作業系統剪貼簿。外部 DNS 解析被限制，Google Fonts stylesheet 亦被攔截，因此版面尺寸驗收採替代字型，不是正式字型／完整視覺／無障礙驗收。

### 本次成功報告

`test-results/tdx-browser-replay/report.json`：

- mode=`real-edge-historical-tdx-replay`，liveVerification=false，operatingCarrierAcceptance=unverified。
- 完整快照 1,111 列，capture=`2026-09-05T17:09:57.251Z`；SHA-256 保持 `99d80dba98b75f4c8ae97f74ea98a381ec3af2bd4f9cb0c3596f0c03a02fd1d1`。
- 12 次瀏覽器日期查詢均由本機 CDP 回覆；0 個非預期請求、0 個 Runtime exception。18 次 Google Fonts 樣式請求均攔下，不是供應商請求。
- 3 條航線 × 1440／1024／390px，共 9 組情境通過，9 張截圖位於 `test-results/tdx-browser-replay/run-pqKlHH/`。

| 情境 | 保留選日 | 當日刊載班號卡片 | 重點 |
| --- | --- | --- | --- |
| TPE→HKG | 2026-09-10 | 48 | 逐一對照完整快照，JX233 08:10 的日期／客服複製正確 |
| HKG→TPE | 2026-09-07 | 48 | CX408 明示 +1，複製保留隔日抵達 |
| TPE→SFO | 2026-10-24 | 16 | AS7218 明示 -1；鍵盤選 10/25 及重查仍未知，不變成停飛 |

卡片數是日期上的刊載班號數，絕不是實際營運班次數。所有參考仍不可經「選班」寫入 op/fn；客服複製不改寫原行程。驗收對原本已存的使用者班號參考進行真正新文件載入，確認分享參數保留；**不是已完成 TDX 核實營運航班的選班→分享流程**。

九組月曆均沒有格子重疊／橫向溢出，390px 視窗的月曆 gridWidth 與 gridScrollWidth 均為 275px。截圖已輸出；這些結論來自瀏覽器 DOM 尺寸與操作斷言，不宣稱已逐張人工視覺審查。

## 測試與失敗修正紀錄

首次腳本將開啟月曆與查詢放在同一同步腳本、未等待 React 顯示查詢按鈕，已拆開並等待可用控制。之後發現只變更 hash 不會建立新文件，導致剪貼簿 spy 殘留；改用 about:blank 過渡後真正載入分享頁，沒有把 SPA 導覽冒充重載。外部字型請求則明確攔截並記錄，不允許任何供應商請求來換取通過。

新增 19 項 resolver 回歸測試，涵蓋精確月份／來源時間、完整快照要求及所有禁止通往真實 API 的輸入。一次全套執行有既有 CX 航線探索案例在建議按鈕尚未出現時同步點擊失敗；測試 helper 改為等待同一精確航線按鈕可用，保留全部七段 CX 行程與原有斷言，不固定 sleep、不略過測試、不改動產品篩選邏輯。

重跑全套已確認 58 個測試檔、824 個測試通過，包含原 24 個 calibration；`npm.cmd run test` → `npm.cmd run typecheck` → `npm.cmd run lint` → `npm.cmd run build` → `git diff --check` 完整命令鏈取得 exit code 0。測試沒有被略過，沒有放寬產品規則。真實 Edge 歷史重播命令另已取得 exit code 0。

## 下一個產品門檻

本輪未修改正式 UI、日期正規化或正式班表目錄，亦未 commit、push、部署或購買服務。下一步仍是取得足以辨識目標班號營運者的官方證據，才可對該證據涵蓋的航線與日期開放加入行程。不要繼續升版診斷或讓使用者重取同樣的空 CodeShare；不要把本次歷史瀏覽器驗收當成當前班表／營運者驗收。
