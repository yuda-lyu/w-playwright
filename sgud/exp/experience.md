# 累積經驗

本檔為執行工作時特有之累積經驗,留給後續之嘗試、執行與判斷,由agent自行編列、擴充與維護.過長時抽出舊者為`experience_<年月日>.md`,並於本檔註明何時抽出.

## 一、playwright-core 1.64.1 之實測(2026-11-13,實作輪 I1)

1. **持久啟動之命令列取不到 logger 紀錄**:`launchPersistentContext` 之 `logger` 選項只收到 `api` 類紀錄,收不到 `<launching>`(含完整命令列);CDP `Browser.getBrowserCommandLine` 須命令列有 `--enable-automation`,Playwright 1.64.1 未給而拒絕.可行作法:子行程以環境變數 `DEBUG=pw:browser` 啟動,Playwright 之 debugLogger 把 `<launching> <exe> <args>` 寫到 stderr,於子行程攔截 `process.stderr.write`(`test/tools/pwDriftProbe.mjs`).非持久啟動則用 `launchServer` 之 `server.process().spawnargs`.
2. **`playwright install` 預設會移除未被連結之他版瀏覽器**:CLI 有 `--no-remove`;本套件之安裝一律加,實裝 chromium-1248 後本機 1243、1254 仍在.
3. **`PWDEBUG` 等環境變數之讀法**:Playwright 之 `getFromENV(name)` 依序讀 `name`、`npm_config_<小寫>`、`npm_package_config_<小寫>`;`debugMode` 於模組初始化時快取.`playwright-core/lib/coreBundle`(package exports 有列)之 `utils.debugMode()` 可取 Playwright 實際採用之值,`registry.registryDirectory` 可取其瀏覽器目錄.
4. **`__testHook*` 選項**:伺服端只在 `PWTEST_UNDER_TEST` 時保留,但 `__testHookSeleniumRemoteURL` 會使 `launch` 改走 Selenium 路徑(不經 `ignoreDefaultArgs`),故一律自選項刪除.
5. **`channel` 之實際執行檔**:只有「無頭且未給 channel」用 headless shell;`channel: 'chromium'` 即使無頭也用完整 Chromium(會觸發 LogonUser).`chrome-for-testing` 為完整 Chromium 之別名.`channel: 'chromium-headless-shell'` 亦被 Playwright 接受,本套件依設計之 10 個通道全集不收.
6. **下載之完整性**:只有 Content-Length 之大小比對、解壓與標記檔,無雜湊.
7. **Edge 之 `chrome://version`**:以 `channel: 'msedge'` 啟動時 `page.goto('chrome://version')` 可用,`#variations-cmd-section` 同樣存在.
8. **Chromium 修剪引數之空白集合含 U+0085(NEL),JS 之 `trim` 不含**:`'--\u0085'` 經 Chromium(Windows)修剪成 `'--'`(開關終止符),其後之 `--remote-debugging-pipe` 等皆失效、啟動失敗(headless shell 實測);`'-- '` 亦然但 JS `trim` 會修剪故原規則已擋.故 args 之控制字元檢查須含 C1.
9. **Playwright 用戶端以 `{ ...this._playwright._defaultLaunchOptions, ...options }` 合併**(`coreBundle.js:64822`,Playwright Test 執行器會設此全域預設):本套件未輸出之鍵(如未給之 `channel`、`executablePath`)會被全域預設補上,使實際瀏覽器與本套件判定之種類不同;故輸出恆含此兩鍵(值 `undefined`).
10. **onTrace 等同步回調可在合併後改環境變數**:Playwright 於啟動時才讀 `SELENIUM_REMOTE_URL`、`PLAYWRIGHT_LEGACY_SCREENSHOT`,故檢查須在一切回調之後、呼叫 BrowserType 之前同步再做一次.

## 二、測試與驗證

1. **真瀏覽器之守門驗證**:讀 `chrome://version` 之「指令列變化版本」(`#variations-cmd-section` 內之 base64 JSON,為生效之覆寫);headless shell 無此頁(`net::ERR_INVALID_URL`),只能驗命令列.錯誤次數於啟動時即增加,關閉後以 1 秒間隔讀 8 次作否定斷言之觀察窗.
2. **對照(證明判準會抓到錯)不必啟動真 Chrome**:以 headless shell 之 `launchServer` 讀「不合併」與「只另給守門一串」之命令列,取最後一串為生效集合,判準即為 false.
3. **變異證據**:於 `./tmp` 之副本植入變異(副本內 `test` 以相對路徑引用副本之 `src`,`playwright-core` 由上層 `node_modules` 解析),逐一跑對應之單元測試;外審修正後共 23 個變異皆轉紅.曾有一個變異未轉紅(頭尾 NEL 檢查),追查為與 C1 控制字元規則重複之冗餘碼,刪除冗餘並改以「拿掉 C1」為變異——未轉紅之變異先查是否冗餘,不是先補測試.
4. **外審三家互補**:同一份碼,B 類(terra)30 條偏重測試缺口與時序邊界、A 類(opus)19 條找到唯一以實測證實之守門失效(NEL)、C 類(nemotron)6 條多為文件與測試缺口;收回後以「先查原始碼／實測、再改」逐條核對.
5. **eslint**:本套件設定只掃 `.mjs` 時須 `npx eslint --ext .mjs src test toolg`(未給 `--ext` 回 No files matching).
