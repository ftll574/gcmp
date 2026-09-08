# TDX 首次真實報告：連線通過、共掛欄位修正

> 後續真實 v2 報告已於台灣時間 2026-09-06 00:09 產生：1,111 列全解析，但零共掛項目，營運者辨識未通過。最新修正與 v3 參考紀錄隔離見 `docs/tdx-operator-evidence-2026-09-06.md`。下文保留歷史過程，不再代表最新狀態。

工作區：`E:\workspace\gcmp`。使用者自行執行產生的報告：
`test-results/tdx-live/verification.json`，checkedAt=`2026-09-05T14:43:02.524Z`。
本輪沒有重新呼叫被工具安全檢查阻擋的認證路徑，沒有讀取或輸出密鑰。

## 已有真實證據

- 認證 HTTP 200；TPE→HKG、HKG→TPE、TPE→SFO 三次班表查詢均 HTTP 200。
- verdict=`published-flights-found`，dataAccessible=true。共記錄 4 次外部請求（1 次認證 + 3 份航線快照），不是逐日期查詢。
- 三條航線在 2026-09-05～10-04 區間均有 30 天正面日期；10-05～11-03 區間均有 20 天，出版物最後日期為 10-24。
- 12-04～2027-01-02 的取樣沒有正面結果。這是取回資料的涵蓋限制，不是停飛證據，也不是全球／全年涵蓋證明。

這份由**修正前正規化器**產生。TPE→SFO 列出了 AS、AV、CM、DL、TG 等疑似行銷共掛代碼，不能把 16 個班號當成 16 班實際營運航班，也不能據此宣告航空聯盟篩選通過真實驗收。

## 已確認的程式缺陷與修正

官方來源：`https://tdx.transportdata.tw/webapi/File/Swagger/V3/eb87998f-2f9c-4592-8d75-c62e5b724962`（2026-09-05 查閱）。
`GeneralFlightSchedule.FlightNumber` 包含航空代碼；`CodeShare` 物件的 `AirlineID` 與數字 `FlightNumber` 則分開存放。舊程式只取 CodeShare.FlightNumber，漏掉 AirlineID，無法比對正式物件格式。原測試只測完整班號字串，沒有覆蓋此形狀。

已修改 `server/tdx-schedules.ts`：完整航空＋班號比對、統一前置零；只在相同方向機場對／有效日期／星期使用共掛關係；過期或其他航線不影響當日結果；自我別名不刪自身，矛盾的相互指涉不猜營運者。官方允許的 null 時間與 CodeShare 不再使合法日期整列遺失，仍不填假時間。未更改 complete=false，未知仍不是無班次。

**真實資料如何填共掛關係仍需新版報告確認。** 首份報告沒有原始列結構，不能在本機重播並宣稱新版真實班次已通過。

## 診斷第二版

同一個使用者指令 `npm.cmd run schedules:verify`：新增 `reportVersion=2`、`normalizerVersion=2-structured-codeshares`，各航空班號／日期計數、收到／解析／拒絕列數、共掛欄位形狀統計與最多 16 組公開欄位範例。

範例由明確白名單構造，不是原始 API dump，不含 token、secret、headers、認證回應或任意未知欄位。共用原三份航線快照，不額外增加請求。終端機改成摘要，完整報告仍保存在本機；下次 user-run 將前份報告保存為 `verification.previous.json`，便於比較。

## 驗證與界線

新增 25 個 synthetic 回歸測試；全套 **51 個測試檔、738 個測試通過**，TypeScript、lint、build、git diff --check 通過。測試涵蓋官方物件格式、前置零、日期／方向隔離、自我與矛盾共掛、可空欄位、診斷不洩漏與請求計數。不是測試資料冒充真實班表。

保留原有使用者變更、密鑰設定及首份報告。未改前端 UI 或正式班表資料，未 commit／push／部署，未購買其他供應商。下一個 live gate 是使用者重新執行同一診斷，核對主班號與共掛範例，無須重新申請密鑰。

## 接續輪：離線診斷證據補強，真實 v2 報告仍待產生

本輪開頭及修正後再讀 `test-results/tdx-live/verification.json`，checkedAt 仍為 `2026-09-05T14:43:02.524Z`；沒有 `reportVersion=2` 或 `normalizerVersion`。沒有可比較的新真實結果，沒有改寫或從 synthetic 資料重建該報告。帳戶連線成功仍成立，營運航空／班次正規化的 live gate 仍未通過。

先處理能離線重現的驗收缺口：原 `summarizeTdxSnapshot` 只用「主班號＋正規化別名」作範例去重，會把同班號不同星期、有效期間、方向、時間、更新時間及原始前置零形狀合併；時間樣本也丟失 +1/-1/+0。完全無法解析的共掛原先只有計數，沒有可供檢查的安全範例。這是**診斷證據遺失**，不是本輪已證明真實班次遭誤刪。

已在 `server/tdx-schedules.ts` 補強公開欄位摘要，`server/tdx-diagnostics.ts` 補上報告界線說明：

- 外層仍是 `reportVersion=2`，`normalizerVersion=2-structured-codeshares` 不變；每份 `timetableSnapshots` 新增 `summaryVersion=2`。**本輪未修改 `normalizeTdxSchedules` 的營運班次判定。**
- 範例保留經格式白名單檢查的航空／班號分欄、來源主班號與前置零、方向、ISO 星期（星期一=1）、有效期、更新時間、明示跨日 offset；沒有 offset 仍為 null，不推算抵達日期。字串與物件共掛形式可區分，矛盾或無法解析的欄位不猜成有效識別。
- 以完整的去機密公開欄位判斷範例是否相同，再套用輸出上限。維持**每份航線快照最多 16 個範例、每例最多 20 個共掛欄位／別名**，新增不同範例與被截斷數量；超出上限不是不存在，也不是完整可重播快照。
- 不含任意 raw response、未知欄位、token、secret、headers 或認證內容；未新增外部請求，仍共用原三份航線快照與 12 次請求硬上限。

新增 `tests/server/tdx-snapshot-review.test.ts` 的 16 項 synthetic 測試，先確認在修正前失敗，再確認修正後通過。與既有三份 TDX 測試合跑，**4 個測試檔、75 個測試通過**，`npm.cmd run typecheck` 通過。這些不是新的真實班表驗收。

另已啟動全套 test → typecheck → lint → build → diff-check 命令鏈，但讀取該程序結果時遭工具安全檢查阻擋，沒有透過其他程序／工具重取該結果。因此本輪**不能確認完整測試、lint 與 build 是否通過**；上一輪完整通過的 51 檔／738 測試是歷史基線，不能冒充含新增測試後的驗證結果。

另外獨立執行的靜態 `git diff --check` 通過；`git status --short` 保留原有修改與新增檔案。`git check-ignore` 確認 `.env.schedules.local`、`.env.local` 與原驗證報告皆仍被忽略，沒有讀取設定內容。這些靜態檢查不代表已取得被阻擋的全套驗證結果。

下一個動作仍由帳戶持有人在本機執行，不需重新設定金鑰：

```powershell
Set-Location 'E:\workspace\gcmp'
npm.cmd run schedules:verify
```

該命令原有的 `verification.previous.json` 備份行為保留。後續 session 必須先讀最新檔，不可預設使用者尚未重跑；有新報告後先核對營運者、共掛關係及期間合併，再進入真實網站選班／分享重載驗收。尚未做新的真實 UI 驗收、commit、push 或部署。
