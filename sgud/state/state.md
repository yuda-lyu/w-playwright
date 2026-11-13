# 狀態

本檔記載當前已開發功能之最新狀態(只記現況、不寫過程;過程見 `sgud/exp/experience.md`).藍圖見 `sgud/rule/rulebook.md`.

- 最近更新:2026-11-13(排程第 442 項實作輪 I1).版本 1.0.0,**未發布**(發布與 `dist` 由發布流程產製).
- 依賴:`playwright-core` 精確 `1.64.1`;dev `w-package-tools`.不依 wsemi.

## 功能與帳本條目

| 功能 | 帳本 | 狀態 | 測試 |
|---|---|---|---|
| 合併(恰一串 `--disable-features`＋守門) | R-PW-MERGE 01～09 | 完成 | `unit-mergeFeatures`、`api-pwDrift`、`api-realChromeGuard` |
| 內附表與版本比對 | R-PW-TABLE | 完成(1.64.1) | `api-pwDrift`、`unit-env`、`unit-pkg` |
| 環境拒絕(PWDEBUG、SELENIUM_REMOTE_URL) | R-PW-ENV | 完成 | `unit-env` |
| 兩入口同一順序 | R-PW-ORDER | 完成 | `unit-env`、`unit-logonGuard` |
| 輸入檢測 | R-PW-OPT | 完成 | `unit-opt` |
| 錯誤契約 | R-PW-ERR | 完成 | `unit-setBrowserTypeForTest`、`unit-ensureChromium`、`unit-env` |
| onTrace／funLog | R-PW-TRACE | 完成 | 各 unit |
| 受管瀏覽器之取得 | R-PW-INSTALL | 完成 | `unit-ensureChromium`、`api-autoInstall` |
| 執行期登入守門 | R-PW-LOGON | 完成 | `unit-logonGuard`、`api-realChromeGuard`(子行程開啟) |
| 測試接縫 | R-PW-SEAM | 完成 | `unit-setBrowserTypeForTest`、`api-pwDrift` |
| 子行程隱藏視窗 | R-PW-HIDE | 完成(3 處) | `unit-pkg` |
| 不依 wsemi | R-PW-NOWSEMI | 完成 | `unit-pkg` |
| 真瀏覽器守門驗證 | R-PW-REAL | 完成(見下表) | `api-realChromeGuard`(常駐)、`test/tools/guardProbe.mjs`(一次性) |
| 全庫:只經 w-playwright | R-PW-ONLY | **未做**(遷移輪 M1～M6) | 盤點指令見帳本 |
| 全庫:使用端接線測試 | R-PW-WIRING | **未做**(遷移輪) | — |

## 守門之實證(Windows 11;皆無頭;經本套件合併參數;錯誤密碼次數前後讀取)

| 日期 | 瀏覽器 | 通道 | 版本 | 生效之 disable | 增量 |
|---|---|---|---|---|---|
| 2026-11-13 | Google Chrome | `chrome` | 157.0.8103.78 | ⊇ 預設∪守門;命令列恰一串 | 0 |
| 2026-11-13 | Microsoft Edge | `msedge` | 157.0.4341.46 | 19 項＝預設∪守門 | 0 |
| 2026-11-13 | Chromium(revision 1248) | `chromium` | 156.0.8078.4 | 19 項＝預設∪守門 | 0 |

未驗(不視為已證):有頭;`chrome-beta`／`dev`／`canary`、`msedge-beta`／`dev`／`canary`;持久設定檔之 `chrome://flags`;企業原則;非 Windows.Chrome／Edge 自動更新後須先跑 `api-realChromeGuard`(實際通過)再跑會連續啟動之測試.

## 外審後之修正(2026-11-13,A／B／C 各 1)

已收入:args 之 C1 控制字元(含 NEL)無效、陣列長度上限、enable 與預設 enable 之衝突、channel／executablePath 恆為輸出鍵、受管 shell 以路徑比對、最後檢查(環境、legacy 重新合併)、每次真啟動前重讀登入守門與行程內序列化、本機帳號判定、開關精確值、本套件錯誤不重包、替身層不安裝／堆疊／this／深複本、安裝逾時之行程樹結束與等待、測試工具之環境變數大小寫與逾時樹狀結束.逐條核對見實作輪報告.

## 已知缺口與待辦

- 遷移輪(各使用端改依本套件、移除 w-package-tools-e2e 之 `launchChromium`)未做,依設計 §5、§6 由主控派 M1～M6.
- 有頭之守門效果未實測(主機不得開可見視窗);首次證據由使用端遷移後之首次全套於守門下取得.
- Playwright 升版(第 440 項)時依 R-PW-TABLE 之流程更新內附表.
- 殘餘(不在保證內):登入守門跨行程之並行啟動不協調;持久設定檔之 `chrome://flags`;企業原則;已驗瀏覽器版本不程式化(以 `api-realChromeGuard` 之輸出為紀錄).
- 自動啟動時之自動安裝無逾時上限(`ensureChromium({ timeout })` 可先行呼叫).
