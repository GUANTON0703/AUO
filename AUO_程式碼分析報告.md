# AUO 專案程式碼分析報告

分析日期：2026-08-17
分析範圍：`E:\AUO`（排除 `.git` 內部物件，不把 Git metadata 當成產品程式碼）

## 一、整體成果

已成功存取並掃描 `E:\AUO`。目前專案實際上是一個非常小的前端靜態頁面專案，主要產品程式碼集中在 `index.html`；資料查詢後端不在此目錄內，因此無法由本專案驗證 API 實作、資料庫、CORS、部署服務或真實查詢結果。

檔案統計：
- 非 `.git` 檔案：6 個
- Git 追蹤檔案：5 個
- 未追蹤檔案：1 個（捷徑）
- HTML：1 個
- BAT：2 個
- Markdown：1 個
- Python wheel：1 個
- Windows 捷徑：1 個
- 自動化測試：0 個

## 二、完整檔案清單與用途

| 檔案 | 狀態 | 用途與分析結果 |
|---|---|---|
| `index.html` | Git 追蹤 | 完整單頁前端，內含 HTML、CSS、JavaScript，沒有拆分模組。提供 LV3 日期查詢、欄位顯示設定、GRADE/SHIFT/FIRST_YIELD_FLAG 篩選、LV3 人員色彩圖例、除帳 SCRP 查詢、Server 狀態燈。 |
| `README.md` | Git 追蹤 | 只有 `# AUO`，沒有安裝、啟動、API 契約或部署說明。 |
| `上傳.bat` | Git 追蹤 | 執行 `git add -A`、互動式 commit，最後固定 `git push origin main`。 |
| `下載.bat` | Git 追蹤 | 執行 `git pull origin main`，沒有錯誤碼處理。 |
| `langflow-1.11.2-py3-none-any.whl` | Git 追蹤 | Python wheel；檔案內容僅約 10.5 KB，包含少量版本與 metadata 檔，不是本專案的 API 原始碼，且無法從此目錄證明它實際用途。 |
| `AUO - 捷徑.lnk` | 未追蹤 | Windows 捷徑，未納入 Git。未將其視為可執行程式碼；其目標需在 Windows 捷徑屬性中確認。 |

## 三、目前架構

目前架構是：

`瀏覽器 → E:\AUO\index.html → http://localhost:5000`

前端固定呼叫：
- `GET /api/ping`
- `POST /api/query`，body：`{start_date, end_date}`
- `POST /api/chip-scrp`，body：`{chip_id}`

`index.html` 內部沒有後端、資料庫、路由框架、套件管理設定或測試。所有 CSS/JavaScript 都內嵌在單一 HTML，前端在收到完整資料後於瀏覽器端分組、篩選與產生表格。

## 四、目前功能

1. 日期區間查詢 LV3 資料。
2. 查詢結果依 PRODUCT_CODE、TOOL_ID、DEFECT_CODE_DESC/DEFECT_VALUE 分組並使用 rowspan 顯示。
3. 前端欄位顯示/隱藏、全選、全不選。
4. 依 GRADE、SHIFT、FIRST_YIELD_FLAG 篩選。
5. 依 LV3_PERSON 配色並產生圖例。
6. 片 ID 的 SCRP 除帳資訊查詢。
7. 啟動時及每 10 秒檢查 Server 狀態。
8. 查詢中顯示遮罩、錯誤提示與空結果提示。
9. `上傳.bat`、`下載.bat` 提供基本 GitHub 同步操作。

## 五、發現的問題與證據

### P0／阻塞風險

1. **後端不在專案內，系統無法獨立部署或完整驗證**
   - 證據：目錄沒有 `.py`、`.js`、`.ts`、`requirements.txt`、`package.json`、Docker 或服務設定。
   - 影響：只能分析前端，無法確認 API 的欄位契約、權限、資料庫查詢、錯誤格式及效能。
   - 建議：先取得後端 repository 或服務路徑，再做端到端修正。

2. **API 位址硬編碼為 localhost:5000**
   - 證據：`index.html:224`：`var API_BASE = 'http://localhost:5000';`
   - 影響：其他電腦開啟頁面時會連到使用者自己的 localhost；HTTPS 頁面也可能被 Mixed Content 阻擋。
   - 建議：改成同源相對路徑或可配置的環境設定，並補充正式/測試環境啟動方式。

### P1／高優先

3. **沒有請求逾時、取消或重試策略**
   - 證據：`doQuery` 與 `doScrpQuery` 使用原生 `fetch`，沒有 AbortController 或 timeout。
   - 影響：後端掛住時遮罩可能長時間不消失，使用者無法恢復。
   - 建議：共用 `fetchJson`，預設 30 秒 timeout，統一處理網路錯誤與非 JSON 回應。

4. **重複的 API/錯誤處理與 UI 狀態管理**
   - 證據：兩個查詢函式各自處理 fetch、JSON、錯誤、遮罩與按鈕狀態。
   - 影響：未來修一處容易漏另一處。
   - 建議：抽出 API client、錯誤顯示及 loading controller。

5. **單一 510 行 HTML，維護與測試困難**
   - 證據：CSS、頁面結構與約 280 行 JavaScript 全部集中於 `index.html`。
   - 影響：修改容易互相影響，沒有 lint、單元測試或瀏覽器回歸測試。
   - 建議：至少拆成 `src/styles.css`、`src/api.js`、`src/query.js`、`src/scrp.js`，或導入簡單建置工具。

6. **結果全部載入瀏覽器後才篩選與渲染**
   - 證據：`_all=rows`、`applyF()` 在前端 filter，`renderTable()` 逐筆建立 DOM。
   - 影響：大量日期資料可能造成記憶體、DOM 效能及瀏覽器卡頓問題。
   - 建議：短期加上最大筆數/分頁或虛擬列表；長期把篩選條件送到後端並由後端分頁。

### P2／中優先

7. **Git 上傳腳本直接 `git add -A` 並固定推送 main**
   - 證據：`上傳.bat:22`、`上傳.bat:43`。
   - 影響：可能誤提交捷徑、敏感檔或大型檔案；直接推 main 也缺少審查與回滾點。
   - 建議：加入 `.gitignore`、敏感檔檢查、分支/確認機制與 push 失敗處理。

8. **下載腳本沒有檢查 pull 是否成功**
   - 證據：`下載.bat` 執行 pull 後無 `errorlevel` 判斷。
   - 影響：衝突或網路失敗時仍顯示「完成」。
   - 建議：檢查錯誤碼並明確提示衝突處理。

9. **README 幾乎沒有操作文件**
   - 影響：新使用者不知道後端如何啟動、API 位址如何設定、資料格式及故障排除方式。

10. **未看到任何測試、格式化或靜態檢查設定**
   - 影響：目前無法自動攔截 JavaScript 語法、API 回應變更或 UI 回歸。

## 六、修改優先順序與具體方案

### 第一階段：先恢復可部署性與可觀測性

1. 將 `API_BASE` 改為設定值，優先採同源 `/api`；若必須跨主機，使用啟動設定或 `window.AUO_CONFIG`，不可寫死 localhost。
2. 新增共用 `fetchJson(url, options, timeoutMs)`：處理 timeout、HTTP 非 2xx、非 JSON、網路錯誤與錯誤訊息。
3. 查清並記錄後端三支 API 的 request/response schema、CORS 與啟動命令。
4. 更新 `README.md`：前端開啟方式、後端啟動方式、環境變數、API 範例、故障排除。

涉及檔案：`index.html`、`README.md`；若取得後端則加入後端 API/設定檔。

### 第二階段：拆分前端並建立測試

1. 把 inline CSS/JS 拆檔。
2. 建立 API client 與資料格式驗證。
3. 對日期驗證、空結果、HTTP 錯誤、timeout、SCRP 查詢及篩選撰寫測試。
4. 加入 ESLint/Prettier 或至少 JavaScript 語法檢查。

涉及檔案：新增 `src/`、`tests/`、`package.json`（若採 Node 工具鏈）。

### 第三階段：大量資料與 Git 流程改善

1. API 支援 server-side filter、排序、分頁與筆數上限。
2. 前端以分頁或虛擬列表取代一次建立大量 DOM。
3. 新增 `.gitignore`，排除捷徑、暫存檔、秘密與不應提交的大型安裝檔。
4. 改善 BAT：pull/push 錯誤碼處理、提交前顯示清單、避免未確認直接推 main。

## 七、測試與驗收條件

### 必要自動測試

- 日期起始日大於結束日：顯示錯誤且不發送 API。
- 缺日期、缺 chip ID：顯示錯誤且不發送 API。
- API 2xx 正常 JSON：正確顯示資料、筆數、篩選器與圖例。
- API 回傳空陣列：顯示空結果，不殘留前一次表格。
- API 回傳 4xx/5xx、非 JSON、網路斷線：在 timeout 內解除遮罩並顯示可理解錯誤。
- GRADE/SHIFT/FIRST_YIELD_FLAG 篩選結果與筆數正確。
- 欄位隱藏不影響其他欄位及 rowspan 結構。
- SCRP 查詢成功、空結果、錯誤與 Enter 觸發均正常。
- `git diff --check` 通過；JavaScript 語法檢查通過。

### 手動驗收

1. 從正式部署網址與另一台電腦開啟，確認不會連到該電腦的 localhost。
2. 後端停止時，右上角狀態燈、查詢錯誤與恢復後重試均正常。
3. 以小、中、大資料量測試，確認頁面不會無限卡住。
4. Chrome/Edge 測試日期查詢、欄位設定、兩個分頁與 SCRP Enter 查詢。
5. 上傳/下載腳本在成功、無變更、pull 衝突、push 失敗時都顯示正確結果。

## 八、風險與回滾方式

- 先建立 Git 分支，例如 `refactor/auo-frontend`，不要直接改 main。
- 每個階段獨立 commit；修改前保留目前 `402fb26` 作為基準點。
- 前端重構失敗：切回上一個穩定 commit，或暫時以原 `index.html` 部署。
- API 契約變更：先保留舊 endpoint/response 相容層，再切換前端。
- 分頁/後端查詢改動：先以 feature flag 或測試環境驗證，避免正式資料查詢中斷。
- 不要把 `.env`、帳密、資料庫連線字串或本機捷徑提交到 Git。
- 回滾指令（在確認工作區沒有未保存變更後）：`git revert <problematic-commit>`；若尚未共享且需回到基準點，才使用 `git reset --hard 402fb26`。

## 九、限制與下一步

本次已實際讀取全部非 `.git` 檔案；但後端原始碼、API server、資料庫與部署環境不在 `E:\AUO`，所以無法完成端到端測試，也不能確認前端目前是否真的能查到資料。

建議下一步：取得 `localhost:5000` 對應的後端專案或服務路徑，先確認 `/api/ping`、`/api/query`、`/api/chip-scrp` 的實際實作與回應，再依第一階段方案修改。