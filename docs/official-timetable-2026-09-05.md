# TDX 與官方班表日期：第三條可用資料路徑

工作區：`E:\workspace\gcmp`。日期：2026-09-05。

## 本輪已可使用

無須 API 金鑰／後端即可在日期月曆查詢已收錄的 ANA 官方季節班表，並選取日期、航班號、加入既有行程或新航段、複製給客服、分享後重載。這不是 synthetic demo；正式資料是人工核對公開來源後的班表事實轉錄。

`public/data/official-schedules.json`：37 個分季服務紀錄（15 個有方向機場對，不是完整 ANA 航網）。涵蓋 TSA↔HND、NRT↔BRU、HND↔VIE/LHR/FRA/SFO/JFK，以及冬季 LAX→HND NH125。部分航線每日多個班號，彼此保留。自 2026-09-09 起這份 catalog 與其他 runtime data 一樣由 app loader 載入並以 schema 驗證，不再編入主 JavaScript bundle；gateway、報表與測試仍共用同一份檔案。

夏季有效期 2026-03-29～2026-10-24，冬季 2026-10-25～2027-03-27。夏季來源表標更新於 2026-02-04；冬季表標更新於 2026-08-20。本輪來源核對日為 2026-09-05，必須於 2026-10-05 複查，否則停止以此快照產生正面日期。這是應用的維護期限，不是航空公司保證，也沒有設定自動排程替人重新驗證。

例外有獨立欄位：NH205 2026-10-23、NH206 2026-10-24 增飛；NH125 2026-11-01 停飛。週期與例外同時生效；不直接把「通常每週飛」當成未來每天確定營運。

來源未刊時間，所以這批 ANA 紀錄刻意不填時間。顯示「時間未公布／抵達日期待確認」，不填 00:00、不猜跨日，且不拿日期資料保證銜接時間。已存分享網址只保存航空／日期／班號，不保存「已確認」標籤。

官方來源：
- https://www.ana.co.jp/en/kr/plan-book/routes/international-route-information/

## TDX 接入

已新增 `server/tdx-schedules.ts`：OIDC client-credentials、token 共用與更新、固定官方主機、HTTPS、不跟隨 redirect、response 大小限制、5 頁上限、穩定排序分頁、每條航線 snapshot 共用、4 小時快取、每日上游預算、最多 4 併發及 16 個 distinct pending routes。預算包含 token 與重試。多副本部署須共享額度，不可把 per-process 預算當全站費用上限。

端點為 `/api/basic/v2/Air/GeneralSchedule/International`，只查至少一端在台灣的機場對。一次取 route snapshot 供整月／不同月份重用，不是每一天重查一次。需要 API key；沒有採訪客模式自動抓取，也沒有購買方案。

正規化參照官方既有說明，使用 `ScheduleStartDate`／`ScheduleEndDate` 與七個 weekday boolean，合併同班號不同期間／星期紀錄，考慮所有適用列而非只取第一列。只使用 main 航班識別，不把 CodeShare 別名另外新增成營運航班；明示貨運／共掛／濕租及矛盾識別被排除。`ArrivalTime` 明示 +1/-1 才展開抵達日期，沒有 offset 保持抵達日期未知。上游 UpdateTime 超過應用 24 小時新鮮度限額不產生正面結果。TDX 新取得的定期表仍顯示為「官方預定班次」，不是營運即時狀態。

**尚未完成：TDX 真實帳戶驗證。環境沒有 TDX_CLIENT_ID/TDX_CLIENT_SECRET，本輪沒有呼叫需認證的班表 API；TDX adapter 由依官方欄位製作的 synthetic fixture 測試。** 真正 BR/CX 涵蓋月份、main/codeshare 語意、貨運／經停的排除與跨日欄位，仍需以帳戶取得的回應逐項驗收。在此之前，不宣稱台灣所有航段已可查日期。

官方欄位／日期範例與服務指引：
- https://data.gov.tw/dataset/161167
- https://tdx.transportdata.tw/topic/detail/69da8706-2fbd-4361-9f57-1dba95a66961
- https://ptx.transportdata.tw/PTX/Topic/94d6afb4-d8db-4399-88eb-75f8e95ac56c
- https://ptx.transportdata.tw/PTX/Topic/ae903fcb-7204-4831-8291-a64f0ca33664
- https://tdx.transportdata.tw/topic/detail/d8931d61-6093-40de-a08d-9daa0bdf5c59
- https://github.com/tdxmotc/SampleCode

## 金鑰設定（不是聊天提供）

複製 `.env.schedules.example` 至已忽略的 `.env.schedules.local`，本機填：

```dotenv
SCHEDULE_PROVIDER=tdx
TDX_CLIENT_ID=your-client-id
TDX_CLIENT_SECRET=your-client-secret
```

`npm run schedules:serve` 啟動 Node gateway。前端 `.env.local` 設定 `VITE_SCHEDULE_API_BASE=/api`，再 `npm run dev`。沒有金鑰時官方靜態模式本來就可使用；無須為它額外啟動 gateway。健康檢查只回報 provider/configured 與官方資料筆數，不回傳 token／secret。

不要把 TDX secret 加 VITE_ 前綴，不要提交 Git。TDX 註冊、方案額度與授權展示條件需由帳戶持有人確認。本輪未註冊帳戶或產生付費呼叫。

## 驗證

新增加 52 項測試：日期／週期／例外、來源期限、無時間、跨日、TDX token/分頁/快取/額度/錯誤／共掛去重、官方 fallback、完整新結果優先、實際 App 日期-only 選班及分享重載。全套執行結果為 49 個測試檔、703 個測試通過（含原 24 個 calibration）。

`npm run typecheck`、`npm run lint`、`npm run build` 與 `git diff --check` 通過。ESLint 排除已在 Git 忽略的 browser test-results／臨時 Edge profile，避免檢查瀏覽器產生的第三方檔案；應用與測試原始碼的規則未放寬。沒有新增套件或修改 lockfile。

另用真實 loopback HTTP server 驗證 official-only 模式：健康檢查明確回報 credentialsConfigured=false，NRT→BRU 9/7 回傳 NH231 的出版物日期、9/8 為空但 complete=false；沒有外部供應商請求。configured 僅代表憑證是否設定，不宣稱供應商已完成連線驗證。

隔離 headless Edge 實跑 1440／1024／390px，讀取真實本地 ANA catalog（未 mock 日期資料、未使用付費 provider）。NRT→BRU 九月 30 天中，NH231 13 天顯示官方預定班次，17 天未知，沒有任何一天被捏造成全航線無班次。選取 9/7 NH231 後分享重載保存成功；三種寬度月曆不重疊／不溢出，無 runtime exception。

重跑：先在 loopback port 5188 啟動 Vite，再 `node scripts/qa-flight-calendar.mjs --official`。報告與截圖在 `test-results/official-flight-calendar/`，不是完整無障礙驗收。超過 source review deadline 後此 positive smoke 會失敗，需真實重新核對來源，不可只改測試日期延命。

## 尚未做

TDX 認證 live response、全 BR/CX 航網、JL/SQ 等夥伴的完整官方日期表、全球付費來源比較、供應商授權／部署均尚未完成。本輪保持原 138 筆 legacy schedules 與 42 筆 network observations 不變，不拿它們填新的確認月曆。未 commit／push／部署，公開網站尚未套用。
