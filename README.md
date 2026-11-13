# w-playwright
A tool to launch Chromium-family browsers through Playwright with unified launch arguments, browser installation and checks.

![language](https://img.shields.io/badge/language-JavaScript-orange.svg) 
[![npm version](http://img.shields.io/npm/v/w-playwright.svg?style=flat)](https://npmjs.org/package/w-playwright) 
[![license](https://img.shields.io/npm/l/w-playwright.svg?style=flat)](https://npmjs.org/package/w-playwright) 
[![npm download](https://img.shields.io/npm/dt/w-playwright.svg)](https://npmjs.org/package/w-playwright) 
[![npm download](https://img.shields.io/npm/dm/w-playwright.svg)](https://npmjs.org/package/w-playwright) 
[![jsdelivr download](https://img.shields.io/jsdelivr/npm/hm/w-playwright.svg)](https://www.jsdelivr.com/package/npm/w-playwright)

## Documentation
To view documentation or get support, visit [docs](https://yuda-lyu.github.io/w-playwright/global.html).

## Core
> 統一以 Playwright 啟動 Chromium 系瀏覽器之工具(啟動參數、瀏覽器之取得與檢查)。使用端一律 `import wpw from 'w-playwright'`,不直接依賴 `playwright`／`playwright-core`,不深層匯入 `src/`。

> **守門參數與原因**:Windows 上 Chromium 153 起,每啟動一個新的瀏覽器根行程,即以無效密碼替目前使用者呼叫一次 `LogonUser`(安全性紀錄 4625、錯誤密碼次數 +1;本機原則 10 分鐘內 10 次即鎖定帳號);停用 Chromium 功能 `AutofillAiWalletPrivatePasses` 即不再發生。Chromium 對兩個 `--disable-features` 只取最後一個,而 Playwright 自帶一串預設,故本套件於每次啟動之命令列**恰給一個** `--disable-features`(Playwright 預設清單＋`AutofillAiWalletPrivatePasses`＋呼叫端自給者,置於呼叫端 args 之末),並以 `ignoreDefaultArgs` 去掉 Playwright 預設之那一串。不提供停用守門之選項。

> 合併規則(`getChromiumLaunchOptions` 為唯一實作,兩個啟動入口共用):
> - 呼叫端之 `--disable-features`／`--enable-features` 之任何寫法(大小寫、單一連字號、無值、多個)一律吸收進同一串;`--enable-features` 中屬守門功能或同時被呼叫端停用之項目剔除(呼叫端停用 Playwright 預設啟用之功能時,預設之啟用亦剔除);啟用之項目與 Playwright 預設停用者同名時 Chromium 以停用為準(`debug` 時提示)。
> - `args` 任一元素非字串、前後有空白、不以 `-` 開頭、等於 `--`、為 `--single-argument`(大小寫與連字號不拘)、含控制字元(C0、DEL、C1;C1 之 U+0085 於 Windows 之 Chromium 會被當空白修剪,`'--\u0085'` 即成開關終止符)、元素數逾 10000,或功能項非 ASCII 語法(`^\*?[A-Za-z0-9_]+([<:]...)?$`)時,**整個 `args` 視為 `[]`**(守門照加;呼叫端其餘參數如 `--proxy-server` 一併捨棄——需保語意者改用 `proxy` 選項)。
> - `ignoreDefaultArgs: true` 不支援(視為 `[]`);`ignoreDefaultArgs` 內之功能開關樣式項目一律剔除;其內含與 Playwright 預設 disable 串完全相同之項,表示不要 Playwright 之預設清單(守門照加)。
> - `ignoreAllDefaultArgs` 與 Playwright 內部之 `__testHook*` 鍵一律刪除;`channel`、`executablePath` 恆為輸出之鍵(未給時為 `undefined`,使 Playwright 之全域預設啟動選項無法蓋過);其餘鍵原樣轉傳給 Playwright。
> - 實際呼叫 Playwright 之前(合併與一切回調之後)同步再檢一次環境;`PLAYWRIGHT_LEGACY_SCREENSHOT` 於合併後改變者依現值重新合併。

> **版本**:`dependencies` 只有 `playwright-core` 精確 `1.64.1`;本套件內附該版之預設清單(`src/pwDefaults.mjs`),**實裝版本與內附表不同即拒絕啟動**(`E_PW_VERSION`;例如依賴樹以 overrides 換了版本)。升版只改本套件:改精確版本 → 本套件測試 `api-pwDrift` 轉紅並印出新清單 → 更新內附表 → 全套綠(含 `api-realChromeGuard` 實際通過)→ 發布。

## Installation

### Using npm(ES6 module):
```alias
npm i w-playwright
```

1. **安裝即帶入 playwright-core 1.64.1**(經本套件之 `dependencies`,精確版本)。使用端不需、也不應另裝 `playwright` 或 `playwright-core`。
2. **受管瀏覽器之取得**(無頭預設用之 headless shell;有頭或 `channel: 'chromium'` 用之完整 Chromium):由本套件所依之 playwright-core 下載,請用 `await wpw.ensureChromium()`(headless shell)或 `await wpw.ensureChromium({ kind: 'chromium' })`(完整 Chromium);或啟動時給 `autoInstall: true`(缺檔時安裝一次再啟動)。**自動安裝預設關**:未安裝而啟動即 `E_BROWSER_MISSING`。**不要用 `npx playwright install`**(依賴樹中他版被提升時會下載到不同版本之瀏覽器)。
   - 下載由 Playwright 自其 CDN(`cdn.playwright.dev`)取得;其完整性檢查為檔案大小(Content-Length)、解壓與標記檔,**無雜湊校驗**(1.64.1 `lib/coreBundle.js` 讀碼),與自有套件之〈外部執行檔〉規格不同(該規格對 Playwright 自管之瀏覽器加註例外)。
   - 安裝子行程以 `process.execPath` 執行本套件所依之 `playwright-core/cli.js install --no-remove …`,隱藏視窗;`--no-remove` 使本機其他 Playwright 版本之瀏覽器不被移除。
   - Linux 缺系統相依時:`ensureChromium({ installDeps: true })` 或啟動時 `installDeps: true`(執行 `install-deps chromium`,可能需 sudo;預設關)。
3. **離線**:於可連網之機器以同版 w-playwright 執行 `ensureChromium()`(需要完整 Chromium 時另執行 `ensureChromium({ kind: 'chromium' })`),把 Playwright 之瀏覽器資料夾(Windows 預設 `%LOCALAPPDATA%\ms-playwright` 內之 `chromium_headless_shell-1248`、`chromium-1248` 等)複製至目標機,並以環境變數 `PLAYWRIGHT_BROWSERS_PATH` 指向該資料夾。**此變數須在載入本套件前設定**(Playwright 於模組載入時決定瀏覽器目錄;執行期改動不生效,本套件之安裝子行程亦沿用載入時之目錄)。
4. **用真 Chrome(`channel: 'chrome'`)或 Edge(`channel: 'msedge'`)者,須自行安裝 Google Chrome／Microsoft Edge**;`wpw.findSystemChrome()`(或 `{ channel: 'msedge' }`)只以檔案存在判定其位置,不啟動、不代表可啟動。
5. **守門參數**:本套件一律加入 `--disable-features=<Playwright 預設>,AutofillAiWalletPrivatePasses,<呼叫端自給>`,原因見〈Core〉。
6. **不支援之環境變數**(會使守門失效,一律拒絕 `E_ENV`):`PWDEBUG` 為 inspector 模式之值(Playwright 會另起未合併參數之 Inspector 瀏覽器並強制有頭;`console`、`0`、`false` 不受限;亦讀 `npm_config_pwdebug`、`npm_package_config_pwdebug`,且 Playwright 於載入時快取,載入時有值、事後刪除仍拒絕)、`SELENIUM_REMOTE_URL`(改走不經 `ignoreDefaultArgs` 之 Selenium 路徑)。

#### Example:
```alias
import wpw from 'w-playwright'

//無頭(headless shell), 未安裝時先安裝一次
let browser = await wpw.launchChromium({ headless: true, autoInstall: true })
let page = await browser.newPage()
await page.setContent('<div>ok</div>')
await browser.close()

//真Chrome(須先安裝Google Chrome)
if (wpw.findSystemChrome()) {
    let b = await wpw.launchChromium({ channel: 'chrome', headless: true, args: ['--lang=en-US'] })
    await b.close()
}

//持久設定檔('' 表Playwright之暫存設定檔; 非空時須為絕對路徑)
let context = await wpw.launchChromiumPersistent('', { headless: true })
await context.close()

//合併後之選項(可檢視; 不啟動)
console.log(wpw.getChromiumLaunchOptions({ args: ['--disable-features=Translate'] }).args)
```

## API

| 函數 | 回傳 | 失敗通道 |
|---|---|---|
| `launchChromium(opt)` | `Promise<Browser>` | reject 帶 `code` 之 Error |
| `launchChromiumPersistent(userDataDir, opt)` | `Promise<BrowserContext>` | 同上;`userDataDir` 非字串即 `E_ARG`(先於任何副作用) |
| `getChromiumLaunchOptions(opt)` | 合併後之新物件(供檢視與診斷;環境、版本與登入守門只在兩個啟動入口,請勿自行以之呼叫 playwright-core) | 永不拋錯 |
| `ensureChromium(opt)` | `Promise<{ kind }>` | reject `E_INSTALL` |
| `findSystemChrome(opt)` | 絕對路徑或 `''` | 永不拋錯 |
| `getPlaywrightInfo()` | 深凍結之診斷資訊 `{ coreVersion, tableVersion, tableMatch, guardFeatures, defaultDisableFeatures, defaultEnableFeatures, systemChrome: { path, version } }` | 永不拋錯 |
| `setBrowserTypeForTest(fake)` | 還原函數 | `fake` 不符即同步 throw `E_ARG` |

啟動入口之順序(兩者一致):快照 opt(每鍵只讀一次)→ 環境檢查(`E_ENV`)→ 版本檢查(`E_PW_VERSION`)→ 登入守門(`E_LOGON_GUARD`,見下)→ 合併 → 呼叫 Playwright(或測試替身)→ 受管瀏覽器缺檔時依 `autoInstall` 安裝一次再啟動一次。

`opt`(兩個啟動入口):Playwright `chromium.launch`(或 `launchPersistentContext`)之選項,加上自用鍵 `autoInstall`(布林,預設 false)、`installDeps`(布林,預設 false)、`debug`(布林,預設 false)、`funLog`、`onTrace`。`args`、`ignoreDefaultArgs`、`headless`(預設 true)、`channel`(`chromium`、`chrome-for-testing`、`chrome`、`chrome-beta`、`chrome-dev`、`chrome-canary`、`msedge`、`msedge-beta`、`msedge-dev`、`msedge-canary`)、`executablePath` 由本套件檢測;非預期之值視為未給、改用預設,`debug: true` 時以固定詞彙提示(不含傳入之值;同函數同鍵同原因每行程一次;有 `funLog` 交 `funLog('warn', 訊息)`,否則 `console.warn`)。其餘鍵原樣轉傳,由 Playwright 檢查(其拒絕經 `E_LAUNCH`)。

| code | 時機 |
|---|---|
| `E_ARG` | 一般參數無效(`userDataDir` 非字串、`setBrowserTypeForTest` 之 `fake` 不符) |
| `E_ENV` | `PWDEBUG` 為 inspector 模式、`SELENIUM_REMOTE_URL` 有值 |
| `E_PW_VERSION` | 實裝 playwright-core ≠ 內附表 |
| `E_LOGON_GUARD` | 登入守門開啟且錯誤密碼次數 ≥1、帳號已鎖或讀不到 |
| `E_BROWSER_MISSING` | 受管瀏覽器缺檔且未 `autoInstall`(訊息附 `ensureChromium` 用法) |
| `E_LAUNCH_TIMEOUT`／`E_LAUNCH` | Playwright 啟動逾時／其他失敗(含自動安裝後仍缺檔、系統通道缺檔) |
| `E_INSTALL` | 安裝子行程失敗(含離開碼)、無法啟動或逾時 |

對外錯誤只含固定詞彙(與版本號),不附 Playwright 之原錯誤(其 `<launching>` 紀錄含完整命令列與設定檔路徑);原錯誤只交呼叫端自給之 `opt.funLog('launch-error', { fn, code }, 原錯誤)`。`funLog` 之其他標籤:`'warn'`(提示)、`'install-output'`(安裝子行程之輸出)、`'install-error'`。`funLog`、`onTrace` 皆同步呼叫,拋錯與 rejection 一律忽略。

`onTrace` 事件(凍結物件 `{ type, ... }`,不含輸入值):`launch-options`(`fn`、`nArgs`、`nDisable`、`nEnable`、`tableMatch`、`kind`)、`env-reject`(`env`)、`version-reject`(`coreVersion`、`tableVersion`)、`logon-reject`(`kind`)、`install-start`／`install-done`(`kind`)、`install-fail`(`kind`、`exitCode`)。

`setBrowserTypeForTest(fake)`:同一行程內以替身取代本套件所呼叫之 BrowserType(使用端之 src 與測試皆經主檔,同時生效),回還原函數;不對外提供原始 BrowserType。替身收到**合併後**之選項:`fake.launch(mergedOpt, next)`、`fake.launchPersistentContext(userDataDir, mergedOpt, next)`(以原 `fake` 為 `this`;方法只讀一次);`next()` 以同一份合併後選項(深複本,替身改寫其收到之物件不影響)呼叫真 Playwright(包裝真啟動以掛頁面鉤子者用之),`next(o)` 對 `o` 重走完整流程(環境、版本、登入守門、合併)後呼叫真 Playwright;`next` 內之本套件錯誤(如 `E_ENV`)原樣往外。替身之拋錯依真啟動之規則轉為固定詞彙錯誤,但替身層**不自動安裝**(缺檔一律 `E_BROWSER_MISSING`)。多次設定時最後設定且未還原者生效,還原不必依序。依賴樹有兩份本套件時只作用於呼叫者那一份,使用端之接線測試須斷言替身確被呼叫。

由使用端注入瀏覽器之設計(如注入 `launchBrowser`),注入者須注入本套件之 `wpw.launchChromium`,不得注入未經本套件之啟動。

## 執行期登入守門(預設關)

環境變數 `W_PLAYWRIGHT_LOGON_GUARD` 開啟時(未設、空字串、`0`、`false` 之**精確值**為關,其餘一律為開,含 `' 0 '` 等帶空白者),每次啟動**非 headless shell** 之瀏覽器(真 Chrome、Edge、完整 Chromium、自訂執行檔;`executablePath` 只有等於 Playwright 受管之 headless shell 路徑者才算 headless shell)前,讀目前使用者之錯誤密碼次數(`BadPasswordAttempts`;WinNT ADSI 經 `cscript //nologo src/readBadPassword.wsf`,唯讀、子行程隱藏視窗、不用 PowerShell),**≥1、帳號已鎖或讀不到即拒絕 `E_LOGON_GUARD`**。用途:連動與測試環境中,於啟動「之前」擋下守門因未知原因失效之情形(事後監看只能事後發現,10 次可在數秒內發生)。

- 每次實際呼叫 Playwright 前皆重讀(含自動安裝後之重試、替身之每次 `next()`);同一行程內此類啟動依序進行(讀取至瀏覽器啟動完成為一段),後一個啟動會讀到前一個造成之增量。**跨行程之並行啟動不協調**(可能同時讀到 0 而各自啟動),須由執行環境排程。
- 代價:開啟期間若使用者剛打錯密碼,10 分鐘內(計數歸零前)真 Chrome 之啟動皆被拒;每次啟動多約 0.1～0.2 秒,且同行程之真瀏覽器啟動不並行。
- 只讀本機帳號(`WinNT://./<使用者>`),且須 `USERDOMAIN` 等於 `COMPUTERNAME`(不分大小寫);網域帳號或無法判定者讀不到即拒絕(避免讀到同名之本機帳號)。
- 非 Windows:無此計數,開啟時一律讀不到而拒絕(只應在 Windows 開啟)。

## 驗證狀態

守門之生效以「經本套件參數啟動一次 → `chrome://version` 之『指令列變化版本』(生效之覆寫)之 disable 集合 ⊇ 內附表預設 ∪ 守門 → 錯誤密碼次數前後增量 0」驗證。已驗之組合(2026-11-13,Windows 11,無頭;**未列者不視為已證**):

| 瀏覽器 | 通道 | 版本 | 結果 |
|---|---|---|---|
| Google Chrome | `chrome` | 157.0.8103.78 | 生效之 disable ⊇ 預設∪守門、命令列恰一串;增量 0 |
| Microsoft Edge | `msedge` | 157.0.4341.46 | 生效之 disable 19 項,與預設∪守門完全相同、命令列恰一串;增量 0 |
| Chromium(Playwright 1.64.1 之 revision 1248) | `chromium` | 156.0.8078.4 | 同上(19 項完全相同);增量 0 |
| Chrome Headless Shell(revision 1248) | 預設(無頭、未給通道) | 156.0.8078.4 | 本即不觸發;命令列由 `api-pwDrift` 驗證 |

未驗:有頭、`chrome-beta`／`dev`／`canary`、`msedge-beta`／`dev`／`canary`、`chrome-for-testing` 通道名(與 `chromium` 同執行檔)、持久設定檔之 `chrome://flags`(可能把實驗旗標併入同一串)、企業原則、其他作業系統。已驗版本不寫入程式(各機之瀏覽器版本不同、隨自動更新而變):Chrome／Edge 自動更新後,先跑本套件之 `api-realChromeGuard`(實際通過才算,略過不算;其輸出記錄所驗之版本)再跑會連續啟動該瀏覽器之測試。

## Testing

`npm test` 含:單元測試(不啟動瀏覽器)、`api-pwDrift`(以 headless shell 實際啟動,比對 Playwright 預設清單與合併後之命令列;Playwright 升版時轉紅)、`api-autoInstall`(以空的 `PLAYWRIGHT_BROWSERS_PATH` 實際下載 headless shell)、`api-realChromeGuard`(Windows 有 Chrome 且錯誤次數為 0 時,經本套件參數**實際啟動真 Chrome 一次**並驗證增量 0;否則 skip 並寫明原因)。測試之子行程一律清除 `PWDEBUG`、`SELENIUM_REMOTE_URL` 等環境變數。

啟動真 Chrome 之使用端測試可深層引用 `w-playwright/test/tools/readBadPassword.mjs`(與執行期登入守門同一讀法)作前後比對:

```alias
import readBadPassword from 'w-playwright/test/tools/readBadPassword.mjs'

let r = await readBadPassword() //{ ok, bad, locked }; 非Windows或讀不到時ok為false
```
