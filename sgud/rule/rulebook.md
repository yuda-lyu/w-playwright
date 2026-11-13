# 規則帳本

本檔為套件設計與開發階段之規則帳本(藍圖),為要求程式碼須長成什麼樣,或由規格產出之測試(項目/說明/流程)有哪些,包含軸、單一擁有者、已知限制、破壞性變更紀錄,以及對應是哪些測試檔案或指令等,由agent自行編列、擴充與維護.當前已做到哪些記於`sgud/state/state.md`.過長時依類型拆為`rulebook_<類型>.md`,本檔只留索引.

- 規格來源:排程第 442 項之設計報告(定稿,2026-11-13;下稱「設計」)與主控裁示(2026-11-13,四項皆甲).本套件 `CLAUDE.md` 定位句:統一以 Playwright 啟動瀏覽器之工具(啟動參數、瀏覽器之取得與檢查).
- 背景:Windows 上 Chromium 153 起每啟動一個新瀏覽器根行程即以無效密碼呼叫一次 `LogonUser`(錯誤密碼次數 +1,本機原則 10 次即鎖定);停用功能 `AutofillAiWalletPrivatePasses` 即不發生;Chromium 對兩個 `--disable-features` 只取最後一個.

## 一、套件內規則

### R-PW-MERGE 合併(設計 §3.1;唯一實作 `src/getChromiumLaunchOptions.mjs` 之 `mergeParsed`)

| 條 | 規則 | 測試 |
|---|---|---|
| 01 | 輸出之命令列恰一個 `--disable-features`,＝〔內附表預設,除非呼叫端 ignore 含預設串〕＋守門功能＋呼叫端項(排序、去重),置於 `args` 最後一個元素;`ignoreDefaultArgs` 加入內附表預設串(精確) | `unit-mergeFeatures`(預設、F18、第4步);`api-pwDrift`(真命令列 16 格矩陣、接線) |
| 02 | 呼叫端之功能開關一切寫法(開關名去前置 `-`、ASCII 轉小寫、取 `=` 前為 `disable-features`／`enable-features`;無值、多個)一律吸收 | `unit-mergeFeatures` F4;變異 M3 |
| 03 | `args` 任一元素非原始字串、≠ 去頭尾空白之形式、非 `-` 開頭、等於 `--`、開關名為 `single-argument`、含控制字元(C0、DEL、**C1**——U+0085 於 Windows 之 Chromium 被當空白修剪,`'--\u0085'` 即成終止符,2026-11-13 headless shell 實證),或功能項不合 `^\*?[A-Za-z0-9_]+([<:][\x21-\x7e]*)?$`,或元素數非 0～10000 之整數 → 整個 `args` 視為 `[]`(守門照加,K3) | `unit-mergeFeatures` F4、F5、F16、F17;`unit-opt` A3;變異 M4、M13 |
| 04 | `ignoreDefaultArgs` 須為元素皆非空字串之陣列(`true` 不收);其中功能開關樣式之項一律剔除(F7);含與預設串完全相同之項表「不要 Playwright 預設清單」(enable 同理) | `unit-mergeFeatures` F6、F7、第4步;`api-pwDrift` 呼叫端案 |
| 05 | enable 於「呼叫端給了 enable 開關(含無值)」「要去掉預設 enable」「呼叫端 disable 與預設 enable 同名」任一成立時處理;剔除功能名(去 `*`、取 `<`／`:` 前)屬守門者與同時出現在呼叫端 disable 者(原則 3);與預設 disable 同名者不改行為、debug 提示 | `unit-mergeFeatures` F8、原則3(3 案)、提示案;變異 M14 |
| 06 | 合併串恰等於預設串者不加 ignore、不另附(F18) | `unit-mergeFeatures` F18(以假想之未來內附表) |
| 07 | 預設 enable 依呼叫時之 `PLAYWRIGHT_LEGACY_SCREENSHOT`(真值即無預設 enable) | `unit-mergeFeatures` 兩案 |
| 08 | `ignoreAllDefaultArgs`、自用鍵(`autoInstall`、`installDeps`、`debug`、`funLog`、`onTrace`)、`__testHook*` 不轉傳(提示不含鍵名);`channel`、`executablePath` 恆為輸出之自有鍵(未給為 `undefined`,蓋過 Playwright 用戶端之 `_defaultLaunchOptions`);其餘鍵原樣轉傳(V7、V8) | `unit-mergeFeatures` 第10步、全域預設案;`api-pwDrift` 全域預設案;變異 M5、M19 |
| 09 | 同組輸入不同順序之輸出開關字串相同(原則 2);不改寫呼叫端物件(V9);每次回新物件;`getChromiumLaunchOptions` 永不拋錯(內部缺陷時回只含守門之保底輸出) | `unit-mergeFeatures` |

### R-PW-TABLE 內附表與版本(設計 §3.2)

- `src/pwDefaults.mjs` 對應 `package.json` 之 `playwright-core` 精確版本;實裝版本 ≠ 表即拒絕啟動 `E_PW_VERSION`(F1).表不由腳本產生.
- 升版流程:改精確版本 → `api-pwDrift` 轉紅並印出實際清單與靜態抽取 → 人工更新表 → 全套綠(含 `api-realChromeGuard` 實際通過)→ 發布 → 全庫連動.
- 測試:`api-pwDrift`(未合併之基準與表逐項相同、靜態抽取一致)、`unit-env`(版本不符)、`unit-pkg`(依賴精確版).變異 M8.

### R-PW-ENV 環境(設計 §2.2 第②步、F14、F15)

- `PWDEBUG` 為 inspector 值(Playwright `debugMode` 語意:非 `''`、`console`、`0`、`false`)時 `E_ENV`;來源三者任一:本模組載入時之快照、呼叫時之值(依 Playwright `getFromENV` 依序讀 `PWDEBUG`、`npm_config_pwdebug`、`npm_package_config_pwdebug`)、Playwright 實際採用之 `debugMode()`.
- `SELENIUM_REMOTE_URL` 有值即 `E_ENV`;兩入口一致(原則 4).
- 最後檢查(`finalGate`):實際呼叫 BrowserType(真或替身)之前、一切回調之後,同步再檢環境(E_ENV),且 `PLAYWRIGHT_LEGACY_SCREENSHOT` 於合併後改變即依現值重新合併.
- 測試:`unit-env`(含隔離行程之載入時設定／載入後設定／playwright-core 先載入／npm_config 變體／對照);`unit-setBrowserTypeForTest`(回調改環境兩案);變異 M6、M7、M15、M15b.

### R-PW-ORDER 兩入口同一順序(原則 4)

①快照 opt → ②環境 → ③版本 → ④登入守門 → ⑤合併 → ⑥BrowserType(或替身)→ ⑦受管缺檔依 `autoInstall` 安裝一次再啟動一次.`launchChromiumPersistent` 之 `userDataDir` 非字串 → reject `E_ARG`,先於①.實作:`src/_launchCore.mjs` 之 `prepare`.測試:`unit-env`(順序兩案)、`unit-logonGuard`(兩入口).

### R-PW-OPT 輸入檢測(設計 §7;dspec〈輸入參數之檢測機制〉§7 之 w-playwright 例外)

- 不依 wsemi;`src/_check.mjs` 為最小實作,種類語意對齊 wsemi 同名種類(O1、B1、S1、S2、S3、F1、A3、N2 `'timer'`).opt 每鍵只讀一次(V11);非預期之值視為未給、改用預設(K3);`opt.debug` 時以固定詞彙提示(不含值,K9、V20;同函數同鍵同原因每行程一次;有 `funLog` 交 `funLog('warn', msg)`,否則 `console.warn`).
- 測試:`unit-opt`(V24 矩陣、讀次數、撤銷之 Proxy、提示全文).

### R-PW-ERR 錯誤契約(設計 §2.3;dspec〈診斷輸出與遮罩〉D1 例外、D2、D3)

- Promise 一律 reject 帶 `code` 之 `Error`,訊息固定詞彙(版本號可附),無 `cause`;Playwright 原錯誤只交 `opt.funLog('launch-error', { fn, code }, 原錯誤)`;不自寫遮罩.
- code 全集:`E_ARG`、`E_ENV`、`E_PW_VERSION`、`E_LOGON_GUARD`、`E_BROWSER_MISSING`、`E_LAUNCH_TIMEOUT`、`E_LAUNCH`、`E_INSTALL`.
- 測試:`unit-setBrowserTypeForTest`、`unit-env`、`unit-ensureChromium`.

### R-PW-TRACE 觀察回調(dspec〈計時器〉§2;getTrace 單一擁有者之 w-playwright 例外)

- `onTrace` 同步呼叫、不帶接收者、拋錯與 rejection 忽略、事件凍結且只含原始值;未給不組事件.事件:`launch-options`、`env-reject`、`version-reject`、`logon-reject`、`install-start`、`install-done`、`install-fail`.`funLog` 同語意.
- 測試以事件同步(安裝逾時等以 reject 事件為同步點,不以固定等待).

### R-PW-INSTALL 受管瀏覽器之取得(設計 §4)

- `ensureChromium` 與 `autoInstall` 共用 `src/_install.mjs`:`process.execPath` 執行本套件所依之 `playwright-core/cli.js install --no-remove --only-shell|--no-shell chromium`(Linux 且 `installDeps` 另 `install-deps chromium`);`windowsHide: true`;子行程 `PLAYWRIGHT_BROWSERS_PATH` 固定為載入時 Playwright 之 `registryDirectory`(F22);逾時以 `taskkill /T /F`(Windows)結束子行程樹.
- `autoInstall`、`installDeps` 預設 false;受管缺檔且未自動安裝 → `E_BROWSER_MISSING`.
- 測試:`unit-ensureChromium`(注入替身)、`api-autoInstall`(真下載,空 `PLAYWRIGHT_BROWSERS_PATH`).變異 M11、M12.

### R-PW-LOGON 執行期登入守門(主控裁示 4)

- `W_PLAYWRIGHT_LOGON_GUARD` 開啟(未設、''、'0'、'false' 之精確值以外;不去空白)時,種類非 headless shell 之啟動前讀 `BadPasswordAttempts`(`src/readBadPassword.wsf` 經 `cscript //nologo`,WinNT ADSI,`windowsHide`;不用 PowerShell),≥1、已鎖或讀不到 → `E_LOGON_GUARD`.非 Windows 一律讀不到;目前行程之帳號須 `USERDOMAIN`＝`COMPUTERNAME`(本機帳號),否則讀不到.
- 時點:②～④之前置檢查讀一次;另於每次實際呼叫真 BrowserType 前(含自動安裝後之重試、替身之每次 `next()`)重讀;同一行程內此類啟動以鎖依序進行(讀取至啟動完成).跨行程不協調(殘餘,README 載明).
- 種類:`executablePath` 等於 Playwright 受管之 headless shell 路徑(registry,正規化比對),或(無 `executablePath`、無 `channel`、無頭)為 headless shell;其餘皆非(檔名相同之他檔亦非).
- 測試:`unit-logonGuard`(含真讀取一案、next 重讀、序列化、本機帳號);`unit-ensureChromium`(安裝後重試重讀);`api-realChromeGuard` 之真啟動子行程開啟此守門.變異 M9、M16、M20、M21、M22.

### R-PW-SEAM 測試接縫(設計 §2.2、F20)

- `setBrowserTypeForTest(fake)`:fake 為一般物件且 `launch` 為函數(`launchPersistentContext` 可省,給了須為函數),否則同步 throw `E_ARG`;方法只讀一次並快照,呼叫時以原 fake 為 `this`;替身以堆疊管理(生效者為最後設定且未還原者,還原不必依序);替身收合併後選項(深複本)與 `next`(見 README);替身層不自動安裝(缺檔即 `E_BROWSER_MISSING`);`next` 內之本套件錯誤原樣往外(不重包、不重報 funLog).不對外提供原始 BrowserType.
- 測試:`unit-setBrowserTypeForTest`;`api-pwDrift`(next 真啟動).變異 M10、M18、M25.

### R-PW-HIDE 子行程隱藏視窗(全域 §8.3)

- `src/` 內 `child_process` 全家(含本地別名 `sp`、`ef`)之每一處呼叫皆 `windowsHide: true`.盤點:`unit-pkg` 之最後一案(括號平衡取整個呼叫、防空集合 ≥3 處).

### R-PW-NOWSEMI 不依 wsemi(主控裁示 1;設計約束 1)

- `src`、`test`、`toolg` 不引用 `wsemi`、`playwright`(只用 `playwright-core`);`dependencies` 只有 `playwright-core` 精確版,dev 只有 `w-package-tools`.盤點:`unit-pkg`.

### R-PW-REAL 真瀏覽器之守門驗證(設計 §3.4、§8.3)

- `api-realChromeGuard` 常駐於全套:win32、有 Chrome、錯誤次數可讀且為 0 時,經本套件參數實際啟動真 Chrome 一次(無頭),`chrome://version` 之 `#variations-cmd-section`(base64 JSON)之 disable 集合 ⊇ 內附表 ∪ 守門、命令列恰一串、觀察窗內錯誤次數皆 0;不符條件即 skip(**略過不算通過**).同檔之對照(只起 headless shell)證明判準對未合併之命令列為 false.
- 完整 Chromium 與 Edge:一次性 `node test/tools/guardProbe.mjs real <chromium|msedge>`(不常駐);驗證紀錄於 `state.md`.

## 二、全庫盤點規則(遷移後;各使用端之遷移輪逐包套用)

### R-PW-ONLY Chromium 系之啟動一律經 w-playwright(設計 §8.4、F9)

- 規則:全庫各自有套件(排除 `node_modules`、`dist`)之 `.mjs`／`.js`(含 `spec/`)不得以靜態或動態匯入、`require` 引用 `playwright`／`playwright-core`;只許本套件之 `src/`、`test/`(漂移與守門測試須直接用 playwright-core)與 w-package-tools 之 `test/`(設計 §6.3 不納入).各使用端 `package.json` 不得宣告 `playwright`／`playwright-core`(w-package-tools 除外).JSDoc 範例一併改寫,不另設註解例外.
- 盤點指令(於自有套件之根目錄集合執行;命中數須為 0,允許清單除外):

```
rg -n --glob '*.{mjs,js}' --glob '!**/node_modules/**' --glob '!**/dist/**' "(from\s+|import\(\s*|require\(\s*)['\"\`]playwright(-core)?['\"\`/]" <自有套件根>
rg -n --glob '**/package.json' --glob '!**/node_modules/**' "\"playwright(-core)?\"\s*:" <自有套件根>
```

- 允許清單:`w-playwright/src/**`、`w-playwright/test/**`、`w-package-tools/test/**`(其 `package.json` 之 dev `playwright` 亦允許).
- 防空集合:盤點前先以本套件 `src/_pw.mjs`(必命中)確認指令有效.
- 判準:命中於允許清單外者為「未套」;遷移前之現況見設計 §5.1(13＋1＋7 包).

### R-PW-WIRING 使用端之接線測試(設計 §8.4、F21;role-coder-for-test §1 第 6 條)

- 規則:每個使用端至少一個接線測試,以 `wpw.setBrowserTypeForTest` 斷言其**每個**啟動點送出之選項含守門(`args` 最後一個元素為合併之 `--disable-features` 且含 `AutofillAiWalletPrivatePasses`;恰一串),並**斷言替身之呼叫次數 >0**(依賴樹有兩份 w-playwright 時替身只作用於測試所引用之一份,未斷言即可能空過);多個啟動點者先收斂為單一內部啟動點(如 w-flowchart 之 10 站點);注入式設計之自有注入者亦同(注入 `wpw.launchChromium`).至少一案不用替身(真啟動 headless shell)或以 `next()` 走真路徑.
- 盤點:各使用端之啟動點全集以 `rg -n "wpw\.(launchChromium|launchChromiumPersistent)\(" <該套件>/src` 列出,與其接線測試之斷言逐點對照;另逐點植入變異(改為不經 wpw 之寫法)確認有測試轉紅.

## 三、測試檔對照(改動範圍 → 測試檔)

本套件無 e2e(瀏覽器 UI)測試;測試全為 `unit-`(不啟動瀏覽器)與 `api-`(真啟動 headless shell、真下載、真 Chrome).

| 改動範圍 | 測試檔 |
|---|---|
| 合併(`getChromiumLaunchOptions.mjs`)、內附表 | `unit-mergeFeatures`、`unit-opt`、`api-pwDrift`、`api-realChromeGuard` |
| 啟動流程(`_launchCore.mjs`)、環境、版本 | `unit-env`、`unit-setBrowserTypeForTest`、`unit-logonGuard`、`api-pwDrift` |
| 輸入檢測(`_check.mjs`) | `unit-opt` 及全部 unit |
| 安裝(`_install.mjs`、`ensureChromium.mjs`) | `unit-ensureChromium`、`api-autoInstall` |
| 登入守門(`_logonGuard.mjs`、`readBadPassword.wsf`) | `unit-logonGuard`、`api-realChromeGuard` |
| 系統 Chrome(`_findChrome.mjs`、`findSystemChrome.mjs`、`getPlaywrightInfo.mjs`) | `unit-findSystemChrome`、`unit-mergeFeatures` F19 |
| 依賴、匯出、子行程隱藏 | `unit-pkg` |
| Playwright 升版 | 全套(`api-pwDrift` 先紅) |

全套:`npm test`(`mocha --parallel "test/*.test.mjs" --timeout 180000`);`api-realChromeGuard` 會啟動真 Chrome 一次,跑前錯誤次數須為 0.

## 四、破壞性變更紀錄

- 1.0.0(新建):取代 w-package-tools-e2e 之 `launchChromium`／`launchChromiumCore`(由遷移輪移除;原則 14 不留相容層).
