# TDX v2 真實複查：連線成功，缺少營運者證據

後續開發流程：`docs/tdx-offline-replay-2026-09-06.md`。既有 user-run 指令已加入公開快照保存；有快照後由代理自行執行 `schedules:replay`，不必每次修程式就要求重新連線。此功能不改變本頁的營運者證據缺口。

工作區：`E:\workspace\gcmp`。本輪只讀使用者產生的去機密報告，沒有執行 TDX 認證、班表快照或啟動 gateway 間接連外。

## 讀到的報告與前後差異

最新 `test-results/tdx-live/verification.json`：`reportVersion=2`、`normalizerVersion=2-structured-codeshares`，三份摘要皆 `summaryVersion=2`。
`checkedAt=2026-09-05T16:09:44.097Z`，即台灣時間 **2026-09-06 00:09:44**。
`verification.previous.json` 為第一版 `2026-09-05T14:43:02.524Z`。

新版仍為 `verdict=published-flights-found`、`dataAccessible=true`，認證與三次班表查詢全部 HTTP 200，共 4 次外部請求。這些是帳戶持有人的執行結果，不是代理本輪發出的請求。

| 航線 | 收到／解析／拒絕列數 | 共掛物件／字串／未解析項目 | 9/5–10/4 的第一版→第二版 occurrence |
| --- | --- | --- | --- |
| TPE→HKG | 486 / 486 / 0 | 0 / 0 / 0 | 1425 → 1418 |
| HKG→TPE | 485 / 485 / 0 | 0 / 0 / 0 | 1395 → 1388 |
| TPE→SFO | 140 / 140 / 0 | 0 / 0 / 0 | 480 → 480 |

共 1,111 列全部解析，但沒有任何 CodeShare 項目或範例。第二版沒有區分缺欄位、null 與空陣列，**不能假稱已知道實際是哪種形狀**，也沒有完整快照可供離線重播。

三條航線的班號集合沒有改變。TPE→SFO 仍列出 AS7218、AV4507/4509、BR8/18/28、CI4、CM8011/8013、DL7725、JX12、TG6252/6254/6256、UA852/872，共 16 個班號、9 個航空代碼。這不是 16 班真實營運航班或 9 家真實營運航空的證明。
香港雙向各少 7 個 occurrence 的原因未由現有報告釐清，不能歸功於共掛去重成功；兩次為不同時間取得的快照。

日期範圍不變：第一窗 30 天有紀錄；10/5–11/3 的窗仍為 20 天，最後至 10/24，各 occurrence 988 / 967 / 320；12/4–2027/1/2 無適用結果。這是有限出版物涵蓋，不是停飛、全航網或全年涵蓋證據。

## 判斷與修正界線

本輪查閱的公開文件（不需帳戶認證）：
- 官方航空 v2 OpenAPI：`https://tdx.transportdata.tw/webapi/File/Swagger/V3/eb87998f-2f9c-4592-8d75-c62e5b724962`
- 資料集說明：`https://data.gov.tw/dataset/161167`

OpenAPI 的 AirlineID／FlightNumber 與 CodeShare 欄位定義，不能讓本次零關係報告自動成為營運者證據。原邏輯將「未被已知別名排除」當成「營運班次」，是過強推論。沒有用航空黑名單、班號長度、時刻相同或航空印象猜營運者。

**修正是安全隔離，不是宣稱已找出真實營運者。** 正規化器升為 `3-unverified-operators`：保留既有方向／日期／星期／時效／格式檢查與有明示關係時的候選去重，但所有 TDX 候選只進 `references`，不進可選的 `published`／`flights`。即使某筆含共掛關係，去重後留下的根節點也不自動取得營運者認證。

`TimetableReference` 使用 `airlineCode` 與 `operatorStatus=unverified`，刻意沒有 `carrier`，不能當成 `FlightSelection`。保留日期、班號、已公布時間、明示跨日、來源與有效期；缺時間不填午夜。含未解營運者的回應不能宣告 `complete=true`。

月曆四個狀態不變。待核對紀錄的日期仍為 `unknown`（符合方案的營運者未知），但格內顯示「N 筆待核對」，並另列「有公布紀錄・營運者待確認」。這些是全航線紀錄，不按 BR／CX 的營運航空資格篩選；只有核實的航班走原篩選／加入流程。

待核對卡片可複製給客服，明示可能為行銷共掛，先核對實際營運航空／班號與直飛客運性質；不能一鍵寫入行程或分享網址的 op/fn。過期紀錄會移除，點擊複製當下也重查時效。原 ANA 官方出版物的選班／分享流程保留。

## 第三版診斷

下一次由帳戶持有人執行既有命令才會產生新報告：

```powershell
Set-Location 'E:\workspace\gcmp'
npm.cmd run schedules:verify
```

外層 `reportVersion=3`、`normalizerVersion=3-unverified-operators`，快照 `summaryVersion=3`。
有可用參考時 verdict 改為 `timetable-references-found-operator-unverified`，另列 `operatingCarrierAcceptance=unverified`。CLI exit code 2 是驗收尚未完成的警示，不是要求重設金鑰。

`referenceOccurrences`／`daysWithTimetableReferences`／`byAirlineCode` 與營運航班統計分開；`byCarrier` 不會把行銷代碼當營運者。
新增 CodeShare 缺漏／null／空陣列／非空陣列／異常形狀計數。即使零共掛也保留公開欄位範例，優先每個班號一例再補分季資料；**同一航線總共最多 16 個不同範例**，每例共掛最多 20 項。舊 `codeshareExamples` 僅為該集合子集，非額外取樣。省略數仍明列，不宣稱完整重播證據。

沒有 token、secret、headers、認證回應、任意 raw response 或未知欄位內容。沿用三份航線快照與 12 次外部請求上限，沒有新增探查端點或付費 fallback。

## 本輪驗證與仍未完成

- 新增 14 項 synthetic 回歸（9 個伺服器／模型、5 個元件／實際 App），不是使用者報告的原始班表重播。
- 全套 **54 個測試檔、768 個測試通過**，含原 24 個 calibration。重點 7 檔／97 測試通過，TypeScript 通過。
- 最終程式版本的 `npm.cmd run test`（54 檔／768 測試）、`npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd run build` 均已取得 exit code 0；`git diff --check` 通過。初次 lint 指出複製處理函式的 React purity 問題，已改成明確的 `useCallback` 事件回呼，保留點擊當下的時效檢查，並重跑上述全部檢查通過，未放寬 lint 規則。
- `git check-ignore` 確認兩份 local env 與兩份使用者報告仍被忽略；檢查只輸出路徑，沒有讀出憑證值。
- 真實營運者／營運班號正規化仍待證據，不能直接進入「真實 TDX 選班→分享重載」的通過宣告。本輪沒有真實瀏覽器驗收或正式部署。

原使用者未提交成果、本機 env 與兩份使用者報告均未覆寫。沒有 commit、push、部署、訂閱、機位查詢或購買資料服務。後續 session **先讀最新 verification.json**，不可預設第三版已執行，也不可要求重設既有金鑰。
