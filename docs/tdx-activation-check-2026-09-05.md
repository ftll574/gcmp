# TDX 設定檢查與待完成驗收

使用者回報「TDX 已設定」。工作區 `E:\workspace\gcmp`。

## 已確認／沒有確認

- `.env.schedules.local` 存在，`TDX_CLIENT_ID` 與 `TDX_CLIENT_SECRET` 均非空；provider 為 tdx。檢查只輸出布林值，未展示憑證內容，未改寫該檔案。
- `.env.local` 原本不存在；已加入公開的 `VITE_SCHEDULE_API_BASE=/api`，以便開發前端使用現有 Vite proxy。兩個 local env 檔均應保持 Git 忽略。
- DevSpace 發出帶憑證認證請求的工具呼叫被平台安全檢查阻擋；停止工具端的認證嘗試，沒有透過其他工具或改寫指令重試。**未取得 TDX 的 token／班表驗證結果，不代表金鑰錯誤，也不代表已成功接通。**

## 帳戶持有人在本機執行

在 Windows PowerShell 執行：

```powershell
Set-Location 'E:\workspace\gcmp'
npm run schedules:verify
```

新增的 CLI 只在由使用者明確執行時載入本機憑證，使用現有 TDX adapter，不會啟動任何收費替代資料源或查詢機位。上游呼叫硬限額 12（包含 token／重試／分頁），同航線不同月份重用快照；通常為 1 次認證加 3 條航線快照，實際筆數依分頁而變。

固定核對 TPE→HKG、HKG→TPE、TPE→SFO，自執行日開始的 30 天、30 天後與 90 天後的區間。這是涵蓋率探針，不是事先承諾可查三個月。報告只包含 HTTP 狀態、正規化班號／日期數、資料有效期與預定義問題代碼，**不保存金鑰、token、認證回應、原始上游錯誤或完整請求內容**。

報告：`test-results/tdx-live/verification.json`（Git 忽略）。安全分享摘要，不要分享 env 檔案。

| verdict | 意義 |
| --- | --- |
| published-flights-found | API 可存取且 adapter 取得至少一筆官方預定班次；仍須檢查各航線有效期／完整性，不等於全面驗收通過 |
| endpoint-accessible-no-published-flights | HTTP 成功但沒有可用正規化班次，需查資料期間與欄位；不是航線停飛 |
| authentication-failed | 認證服務回傳錯誤，需檢查金鑰／帳戶 |
| timetable-access-denied | 認證後班表服務拒絕存取，需確認航空資料服務權限 |
| quota-limited | 被服務端限流，停止重試 |
| missing-credentials / connection-or-response-failed | 本機缺少值，或尚無可用認證／資料回應 |

本輪僅以 mock fetch 測試新診斷工具，不由代理執行上述 live 命令。等待使用者完成本機檢查後，再讀取此無憑證報告並處理真實欄位／日期涵蓋問題。

## 本輪程式檢查

新增 10 個不連外的診斷測試，涵蓋缺憑證、認證錯誤、服務權限、限流、空資料、有效班表、網路例外與不合法 token 回應；全套 50 個測試檔、713 個測試通過。`npm run typecheck`、`npm run lint`、`git diff --check` 通過。`git check-ignore` 確認兩個 local env 檔及報告路徑皆被忽略。本輪未重新建置、啟動服務、commit、push 或部署，亦未實際執行需憑證的驗證 CLI。
