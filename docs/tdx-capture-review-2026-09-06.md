# TDX 真實快照已可重播；修正查詢後日期跳回月初

工作區：`E:\workspace\gcmp`。這輪由代理讀取使用者新檔，直接執行離線重播與測試，未發出 TDX 認證或新的航線請求，也未啟動 gateway 間接連外。

## 已收到的證據

`test-results/tdx-live/verification.json`：reportVersion=3、normalizerVersion=`3-unverified-operators`，checkedAt=`2026-09-05T17:09:57.251Z`（台灣時間 2026-09-06 01:09:57）。認證與三份航線快照均 HTTP 200，四次請求為使用者執行的結果。verdict=`timetable-references-found-operator-unverified`，dataAccessible=true；不是金鑰錯誤。

`verification.previous.json` 是 v2、`2026-09-05T16:09:44.097Z`。本次另有完整的公開欄位 `snapshot.json`。下表數字都是**日期×刊載班號的參考紀錄**，不是實際營運班次或獎勵機位數。

| 航線 | 收到／保存／遮蔽列數 | CodeShare 空陣列 | 9/5–10/4：日期／參考紀錄 | 10/5–11/3：日期／參考紀錄 |
| --- | --- | --- | --- | --- |
| TPE→HKG | 486 / 486 / 0 | 486 | 30 / 1418 | 20 / 988 |
| HKG→TPE | 485 / 485 / 0 | 485 | 30 / 1388 | 20 / 967 |
| TPE→SFO | 140 / 140 / 0 | 140 | 30 / 480 | 20 / 320 |

1,111 列的 CodeShare **全是明確空陣列**，不是 missing、null、異常欄位或解析失敗。保存的欄位沒有貨運／共掛／濕租／服務型別標記，不能將其缺席當作客運營運者證明。這次快照沒有可用的共掛邊，不能據此驗收相互指涉的真實語意；該邏輯仍只有模擬回歸證據。

各窗紀錄數及班號集合與前一版一致（v2 的 publishedOccurrences 現在應解讀為 references，不是營運者確認）。TPE→SFO 仍有 16 個刊載班號；AS7218 與 JX012 有相同起降時間，但**時間相同不能推導誰營運或應刪除誰**。

## 已由代理完成的離線核對

`npm.cmd run schedules:replay` exit code 0，輸出 `test-results/tdx-replay/replay.json`：mode=offline-replay、liveVerification=false、externalRequests=0、projectionComplete=true。三航線×三視窗的紀錄數／班號集合全部與使用者 v3 報告一致。

另外獨立以來源有效期與 UTC 日期的星期枚舉 2026-09-05～11-03 的刊載日期（只用 UTC 做日期算術，不拿它推導當地抵達日）：TPE→HKG 2,406、HKG→TPE 2,355、TPE→SFO 800 個唯一日期×刊載班號，合計 5,561，與重播吻合。這個窗口沒有同日期同班號的相互衝突時刻。不同有效期／星期的紀錄均納入，非只取第一列。

三條航線最後有紀錄日均為 2026-10-24；10/25～11/3 及 12/4～2027/1/2 的取樣保持未知，沒有 complete=true，也沒有變成無班次。到達日期只接受原始 +1/-1 標記；沒有 offset 的時間仍無抵達日期。

這是**保存資料在原取得時間的歷史驗證**，不是重新查證目前班表。原 checkedAt／reviewBy 均保留，未將重播時間充當來源更新。projectionComplete 只表示公開欄位未遮蔽任何列，不代表完整航網／全年涵蓋。

## 真實輸入重現的 UI 問題與修正

`FlightDatesPanel` 原本在每次成功查詢後直接切到本月第一個有資料的日期。新測試顯示：初始查 9/10 的 JX233，畫面卻列出 9/6 的 08:30；初始查 10/24 的 AS7218，客服複製文字卻成為 10/1→9/30，而非 10/24→10/23。這不是 TDX 重新排班，是 UI 重寫 selectedDate。

已修正 `src/components/FlightDatesPanel.tsx`：有證據的目前日期保留；使用者點過日期（包括查詢進行中點選或刻意查看未知日期），回應／重查不再跳回第一筆。切換月份時重設該月選日意圖；只有尚未選日且初始日期沒有任何資料的探索流程，仍可自動顯示第一筆。未改動營運者判斷、方案資格、班表來源期限或分享格式。

## 回歸資料與驗證

新增 `tests/fixtures/tdx-captured-2026-09-06.ts`：從原公開快照轉錄五個班號共 61 列（JX233 28、CX408 8、AS7218 8、BR008 9、JX012 8），保留各班號所有分段期間。已用逐欄 deepEqual 與原快照檢查一致，不是手造時間或日曆，也未放進正式航班目錄。其餘班號不在這個小型 fixture；全 1,111 列的證據仍由本機快照重播保留。

新增 15 項伺服器回歸與 4 項元件回歸。涵蓋分段／星期與四種 JX233 時刻、BR008 前置零與 10/1 時刻變更、+1/-1、未指明抵達日、相同時刻不猜營運者、過期／範圍外未知，以及查詢途中選日與客服複製日期。元件使用**歷史時鐘＋mock HTTP**，不是完整真實瀏覽器或新的供應商驗收。兩個日期跳動測試先失敗，修正後通過。

最終驗證：**57 個測試檔、805 個測試全部通過**，包含原有 24 個 calibration 與本輪新增 19 項。`npm.cmd run test` → `npm.cmd run typecheck` → `npm.cmd run lint` → `npm.cmd run build` → `git diff --check` 完整命令鏈取得 exit code 0。重點 5 檔／40 測試亦通過。未放寬規則、略過測試或更換正式資料。

## 接續界線

現在有真實快照，純正規化修改、回歸與歷史 UI 測試由代理自己執行，不再要求使用者每輪重跑。不升版診斷去重複取得同一份空 CodeShare。營運航空仍需要另一份足以辨識營運者的官方證據，不能靠航空黑名單、班號長短、同時刻分組或重跑命令解決。

未 commit、push、部署、購買服務或更動 local env。使用者報告及快照保持原狀；未完成最新真實營運者驗收或真實 TDX 選班→分享重載驗收。

本輪留存檔案 SHA-256：

```text
verification.json          6aedb800b7cefcb698ad2929ab5598849b2d4ae6b6e92701948969ec168c0f33
verification.previous.json 9c09bb8bfe60731ab8969421497ba4c75b745f2bae5c824e3d7af648861f1edb
snapshot.json              99d80dba98b75f4c8ae97f74ea98a381ec3af2bd4f9cb0c3596f0c03a02fd1d1
```
