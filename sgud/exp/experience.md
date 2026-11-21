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

## 一之二、升至 playwright-core 1.65.1 之實測(2026-11-21,第 440 項)

1. **release notes 不載啟動開關之變動,以 `api-pwDrift` 與讀 `coreBundle.js` 為準**:1.65.0／1.65.1 之說明未提 `chromiumSwitches`,實際 disable 18 → 16 項、enable 1 → 2 項(逐項見帳本 R-PW-TABLE 之變更紀錄).`AutoDeElevate` 自 disable 清單消失,改以 `--do-not-de-elevate` 開關(`coreBundle.js` 之 `chromiumSwitches` 尾端).
2. **legacy 環境變數之語意隨表結構而變**:1.64.1 之 `PLAYWRIGHT_LEGACY_SCREENSHOT` 真值使唯一之 enable 項消失(整串省略);1.65.1 之 `enabledFeatures()` 為 `[legacy ? '' : 'CDPScreenshotNewSurface', 'SkipListAccountsWithoutGaiaCookies'].filter(Boolean)`,真值只去前者.只更新表而不改合併器時,legacy 下命令列出現兩串 `--enable-features`(Playwright 之餘項串＋呼叫端串),`api-pwDrift` 之隔離行程案實測轉紅(修前紅);修法為表增 `enableLegacyOmit`、`getDefaultEnableFeatures` 依之過濾.**表之鍵不只「清單」,還含「清單項是否隨環境變數省略」**.
3. **單元測試以具體功能名當「Playwright 預設 disable 之例」者,表一動即失效**:`Translate` 於 1.65.1 已不在預設;改用 `MediaRouter` 並於測試內以斷言驗其仍在表內(前提不成立即明確失敗,不靜默空過).
4. **持久啟動之 logger 於 1.65.1 仍只收 `api` 類紀錄**(2026-11-21 以 headless shell 實測),`<launching>` 之取法仍須 `DEBUG=pw:browser` 攔截 stderr.
5. **registry 之 Chrome／Edge 路徑與通道全集於 1.65.1 不變**(`_createChromiumChannel` 之前綴順序、後綴;10 個通道),`_findChrome.mjs` 之路徑表無須改.下載函式 `downloadFile` 仍只比 Content-Length 之大小(chunked 時不比)、無雜湊.
6. **1.64.1 下之守門實證(已被 1.65.1 下之結果取代,僅存史)**:Chrome 157.0.8103.78、Edge 157.0.4341.46、Chromium 156.0.8078.4(revision 1248),生效 disable 皆 19 項(＝18 項預設＋守門),增量皆 0.
7. **新瀏覽器之佔用**(Windows,`%LOCALAPPDATA%\ms-playwright`):`chromium_headless_shell-1255` 約 288 MB、`chromium-1255` 約 453 MB;`--no-remove` 使 1243、1248、1254 仍在,不自動回收舊 revision.
8. **需帶環境變數啟動 node 腳本時**:Git Bash 下 `cmd /c "set X=1&& node …"` 之 `/c` 會被 MSYS 轉成 `C:/` 而開出互動式 cmd 空轉(不會執行目標腳本、離開碼 0);改以一支 `.mjs` 於內部設 `process.env` 後 `await import()` 目標腳本.
9. **`npm i <套件>@<版> --save-exact` 之副作用**:同時把 `package-lock.json` 之 `version` 對齊 `package.json`,並於 `package.json` 末尾補換行;皆非人為改版號.

## 一之三、啟動語系(2026-11-21,第 585 項)

1. **Chromium 159 不再繼承主機系統語系**(應用程式語系預設 en-US;156 繼承):影響 generic 字族之字型與行高,不只 `navigator.language`;Playwright context 之 `locale` 只改 `navigator.language`.`--lang=<語系>` 補回(兩種修訂雙向實測,見第 440 項之調查報告;本輪於 revision 1255 重現:預設 zh-TW／微軟正黑體／14px 拉丁字 31.55×19,`lang:false` 為 en-US／Arial／29.56×16,中文字 Microsoft YaHei).
2. **量測法**:CDP `CSS.getPlatformFontsForNode`(須 `DOM.enable`、`CSS.enable`、`DOM.getDocument`、`DOM.querySelector`)取實際用於節點之字型;`familyName` 為**在地化名稱**(繁中主機回 `微軟正黑體`,不是 `Microsoft JhengHei`),比對須兩者皆收.
3. **Chromium 會正規化語系**:`--lang=ja-JP` 之 `navigator.language` 為 `ja`;故真瀏覽器測試之預期值不寫「等於傳入字串」,改比「與呼叫端自給同一 `--lang` 之結果逐項相同」(`api-lang` 之 `callerHost`),並只在 `zh-TW` 主機硬比字串.
4. **預設行為依主機環境者,既有測試須固定環境**:新增預設後,斷言 `args` 完整內容之三檔(`unit-mergeFeatures`、`unit-opt`、`unit-setBrowserTypeForTest`)共 17 案隨主機語系而紅(補入一個 `--lang`);處置為於 `before` 令系統語系取不到(`test/tools/sysLang.mjs` 之 `muteSysLang`,取代 `Intl.DateTimeFormat`),斷言本身不動.`Intl` 於 Windows 之 Node 取自作業系統,環境變數 `LANG`／`LC_ALL` 不影響,故子行程法無效,只能取代 `Intl.DateTimeFormat`(本套件每次合併時才讀,不快取,故可取代).
5. **`opt.lang` 採單一選項(字串或 `false`)**而非「`lang`＋布林」兩選項:三態(指定／關閉／預設)一個鍵即足,無矛盾組合;無效值依 K3 視為未給(取系統語系)並提示.`args` 與 `opt.lang` 並存時 `args` 為準(原樣保留,呼叫端最明確之低階寫法),`debug` 時提示.
6. **`api-pwDrift` 之真命令列**:Playwright 1.65.1 本身不帶 `--lang`(基準命令列無 lang 開關,已加斷言;升版若自帶即轉紅,合併規則須重議);「呼叫端優先」做成**不補**(全命令列之 lang 開關即呼叫端所給者),不依賴 Chromium 對重複同名開關之取捨(未驗證).
7. **eslint 兩點**:`no-lone-blocks`(區塊內無 `let` 宣告即為多餘)、`no-mixed-operators`(`a && b || c && d` 須加括號).

## 二、測試與驗證

1. **真瀏覽器之守門驗證**:讀 `chrome://version` 之「指令列變化版本」(`#variations-cmd-section` 內之 base64 JSON,為生效之覆寫);headless shell 無此頁(`net::ERR_INVALID_URL`),只能驗命令列.錯誤次數於啟動時即增加,關閉後以 1 秒間隔讀 8 次作否定斷言之觀察窗.
2. **對照(證明判準會抓到錯)不必啟動真 Chrome**:以 headless shell 之 `launchServer` 讀「不合併」與「只另給守門一串」之命令列,取最後一串為生效集合,判準即為 false.
3. **變異證據**:於 `./tmp` 之副本植入變異(副本內 `test` 以相對路徑引用副本之 `src`,`playwright-core` 由上層 `node_modules` 解析),逐一跑對應之單元測試;外審修正後共 23 個變異皆轉紅.曾有一個變異未轉紅(頭尾 NEL 檢查),追查為與 C1 控制字元規則重複之冗餘碼,刪除冗餘並改以「拿掉 C1」為變異——未轉紅之變異先查是否冗餘,不是先補測試.
4. **外審三家互補**:同一份碼,B 類(terra)30 條偏重測試缺口與時序邊界、A 類(opus)19 條找到唯一以實測證實之守門失效(NEL)、C 類(nemotron)6 條多為文件與測試缺口;收回後以「先查原始碼／實測、再改」逐條核對.
5. **eslint**:本套件設定只掃 `.mjs` 時須 `npx eslint --ext .mjs src test toolg`(未給 `--ext` 回 No files matching).
