# 狀態

本檔記載當前已開發功能之最新狀態(只記現況、不寫過程;過程見 `sgud/exp/experience.md`).藍圖見 `sgud/rule/rulebook.md`.

- 最近更新:2026-11-26(排程第 636 項:新增可疊放之啟動後鉤子 `onBrowserCreated`〔R-PW-HOOK〕、安裝整體上限與常數 `INSTALL_BUDGET_MS`／`LAUNCH_HOOK_TIMEOUT_MS`〔R-PW-BUDGET〕;前一項為第 585 項:啟動預設帶 `--lang=<主機系統語系>`,R-PW-LANG;再前為第 440 項:`playwright-core` 升至 1.65.1).版本以 `package.json` 為準;發布與 `dist` 由發布流程產製.本輪未改 `package.json` 版本(發布由主控);使用端取得本項須待發布與升版.
- 最近一次驗證(2026-11-26,第 636 項):本庫根與 `npm pack` 發布包解開之目錄之全套各 277 passing、0 failing、0 pending(`api-autoInstall` 之 3 個會真下載之案未跑〔不得實際下載瀏覽器〕,其無下載之案 1/1 綠);eslint 0 問題;private-guard CLEAN;變異 39 個全擊殺(清單見帳本).
- 依賴:`playwright-core` 精確 `1.65.1`(內建 Chromium 159.0.8154.6、revision 1255);dev `w-package-tools`.不依 wsemi.

## 功能與帳本條目

| 功能 | 帳本 | 狀態 | 測試 |
|---|---|---|---|
| 合併(恰一串 `--disable-features`＋守門;legacy 環境變數下之預設 enable 依 `enableLegacyOmit`) | R-PW-MERGE 01～09 | 完成 | `unit-mergeFeatures`、`api-pwDrift`、`api-realChromeGuard` |
| 啟動語系預設(未給 `--lang` 時補主機系統語系;`opt.lang` 指定或 `false` 關閉;呼叫端 `args` 優先;`getPlaywrightInfo().systemLang`) | R-PW-LANG 01～09 | 完成(headless shell revision 1255 實測;真 Chrome／Edge／完整 Chromium、有頭、非 Windows 未驗) | `unit-lang`、`api-lang`、`api-pwDrift` |
| 內附表與版本比對 | R-PW-TABLE | 完成(1.65.1;表之變更見帳本) | `api-pwDrift`、`unit-env`、`unit-pkg` |
| 環境拒絕(PWDEBUG、SELENIUM_REMOTE_URL) | R-PW-ENV | 完成 | `unit-env` |
| 兩入口同一順序 | R-PW-ORDER | 完成 | `unit-env`、`unit-logonGuard` |
| 輸入檢測 | R-PW-OPT | 完成 | `unit-opt` |
| 錯誤契約 | R-PW-ERR | 完成 | `unit-setBrowserTypeForTest`、`unit-ensureChromium`、`unit-env` |
| onTrace／funLog | R-PW-TRACE | 完成 | 各 unit |
| 受管瀏覽器之取得 | R-PW-INSTALL | 完成 | `unit-ensureChromium`、`api-autoInstall` |
| 執行期登入守門 | R-PW-LOGON | 完成 | `unit-logonGuard`、`api-realChromeGuard`(子行程開啟) |
| 測試接縫(替換,非疊放) | R-PW-SEAM | 完成 | `unit-setBrowserTypeForTest`、`api-pwDrift` |
| 啟動後鉤子 `onBrowserCreated`(可疊放;兩入口×真／替身 4 條路徑單一包裝 `withHooks`;與 `setBrowserTypeForTest` 正交;失敗先關閉再 `E_LAUNCH_HOOK`;`onTrace` 增 `browser-hook`／`browser-hook-failed`) | R-PW-HOOK 01～10 | 完成(真 headless shell 驗證;變異 H01～H18 皆轉紅;**使用端尚未改用**,由主控另派) | `unit-onBrowserCreated`、`api-onBrowserCreated` |
| 安裝預算(`INSTALL_BUDGET_MS`＝15 分鐘為 `autoInstall`／`ensureChromium` 之實際預設上限;`opt.installTimeout`;兩個安裝子行程共用;並行之等候計入;`LAUNCH_HOOK_TIMEOUT_MS`＝1150000) | R-PW-BUDGET 01～07 | 完成(假時鐘驗恰於預算逾時;真安裝子行程以「持有中之鎖」驗上限、不下載;變異 B01～B14 與備援 B01b、B13 皆轉紅) | `unit-installBudget`、`api-installBudget` |
| 子行程隱藏視窗 | R-PW-HIDE | 完成(3 處) | `unit-pkg` |
| 不依 wsemi | R-PW-NOWSEMI | 完成 | `unit-pkg` |
| 真瀏覽器守門驗證 | R-PW-REAL | 完成(見下表) | `api-realChromeGuard`(常駐)、`test/tools/guardProbe.mjs`(一次性) |
| 全庫:只經 w-playwright | R-PW-ONLY | **未做**(遷移輪 M1～M6) | 盤點指令見帳本 |
| 全庫:使用端接線測試 | R-PW-WIRING | **未做**(遷移輪) | — |

## 守門之實證(Windows 11;皆無頭;經本套件合併參數;錯誤密碼次數前後讀取;現況為 Playwright 1.65.1 下之結果,1.64.1 下之舊結果見經驗檔)

| 日期 | 瀏覽器 | 通道 | 版本 | 生效之 disable | 增量 |
|---|---|---|---|---|---|
| 2026-11-21 | Google Chrome | `chrome` | 157.0.8103.79 | ⊇ 預設∪守門;命令列恰一串(`api-realChromeGuard` 常駐) | 0 |
| 2026-11-21 | Microsoft Edge | `msedge` | 157.0.4341.60 | 17 項＝預設∪守門;命令列恰一串 | 0 |
| 2026-11-21 | Chromium(revision 1255) | `chromium` | 159.0.8154.6 | 17 項＝預設∪守門;命令列恰一串 | 0 |

未驗(不視為已證):有頭;`chrome-beta`／`dev`／`canary`、`msedge-beta`／`dev`／`canary`;持久設定檔之 `chrome://flags`;企業原則;非 Windows.Chrome／Edge 自動更新後須先跑 `api-realChromeGuard`(實際通過)再跑會連續啟動之測試.

## 外審後之修正(2026-11-13,A／B／C 各 1)

已收入:args 之 C1 控制字元(含 NEL)無效、陣列長度上限、enable 與預設 enable 之衝突、channel／executablePath 恆為輸出鍵、受管 shell 以路徑比對、最後檢查(環境、legacy 重新合併)、每次真啟動前重讀登入守門與行程內序列化、本機帳號判定、開關精確值、本套件錯誤不重包、替身層不安裝／堆疊／this／深複本、安裝逾時之行程樹結束與等待、測試工具之環境變數大小寫與逾時樹狀結束.逐條核對見實作輪報告.

## 已知缺口與待辦

- 遷移輪(各使用端改依本套件、移除 w-package-tools-e2e 之 `launchChromium`)未做,依設計 §5、§6 由主控派 M1～M6.
- 有頭之守門效果未實測(主機不得開可見視窗);首次證據由使用端遷移後之首次全套於守門下取得.
- 下次 Playwright 升版依 R-PW-TABLE 之流程與〈升版核對清單〉(release notes 不載啟動開關之變動;1.65.1 之 legacy 語意變動即由 `api-pwDrift` 之隔離行程案抓到).
- 啟動語系:結果隨主機系統語系而變(同 Chromium 156 時代);需跨機器一致者由呼叫端明確給 `lang`／`args`.`api-lang` 之字型案僅在 Windows 且主機語系為 zh-TW 時執行(其餘略過並寫明),「預設 ≠ 關閉」之案於主機語系為 en-US 時略過.真 Chrome／Edge／完整 Chromium 之語系行為未實測.
- 殘餘(不在保證內):登入守門跨行程之並行啟動不協調;持久設定檔之 `chrome://flags`;企業原則;已驗瀏覽器版本不程式化(以 `api-realChromeGuard` 之輸出為紀錄).
- 安裝上限(15 分鐘,第 636 項起)之取值依本機目錄大小估算,未實測下載時間(不得下載);並行之後到者之有效上限為「Playwright 安裝目錄鎖之等候上限約 7.8 分鐘(實測 470 秒)與預算之較小者」:先到者慢線下載逾此時後到者以 `E_INSTALL` 失敗,不自動重試(使用端可重跑;對 ELOCKED 於預算內自動重試為可選改進,待裁示).
- 使用端改用鉤子(以 `wpw.onBrowserCreated(...)` 取代各自包 `launch`)、使用端 `before` 掛 `LAUNCH_HOOK_TIMEOUT_MS`:由主控於本項發布後另派.
