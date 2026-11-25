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
| 07 | 預設 enable 依呼叫時之 `PLAYWRIGHT_LEGACY_SCREENSHOT`:真值時只省略內附表 `enableLegacyOmit` 之項、餘項仍給(1.64.1 預設 enable 僅一項,故當時為「無預設 enable」;1.65.1 起餘項 `SkipListAccountsWithoutGaiaCookies` 仍給,命令列仍恰一串 enable);規則之意圖不變:合併所認定之 Playwright 預設 enable 須與其實際命令列一致 | `unit-mergeFeatures`(未設 1 案、已設 2 案,含鑑別力前提斷言);`unit-setBrowserTypeForTest`(回調改環境後重新合併);`api-pwDrift`(legacy 隔離行程之真命令列:基準之 enable ＝ 表扣除 `enableLegacyOmit`,合併後 enable 恰一串);變異:`getDefaultEnableFeatures` 於 legacy 改回 `[]` 時上列三處轉紅 |
| 08 | `ignoreAllDefaultArgs`、自用鍵(`autoInstall`、`installDeps`、`lang`、`debug`、`funLog`、`onTrace`)、`__testHook*` 不轉傳(提示不含鍵名);`channel`、`executablePath` 恆為輸出之自有鍵(未給為 `undefined`,蓋過 Playwright 用戶端之 `_defaultLaunchOptions`);其餘鍵原樣轉傳(V7、V8) | `unit-mergeFeatures` 第10步、全域預設案;`api-pwDrift` 全域預設案;變異 M5、M19 |
| 09 | 同組輸入不同順序之輸出開關字串相同(原則 2);不改寫呼叫端物件(V9);每次回新物件;`getChromiumLaunchOptions` 永不拋錯(內部缺陷時回只含守門之保底輸出) | `unit-mergeFeatures` |

### R-PW-LANG 啟動語系預設(排程第 585 項,2026-11-21;唯一實作 `src/getChromiumLaunchOptions.mjs` 之 `mergeParsed` 第 3b 步、`getSystemLang`、`isLangStr`)

- 背景:Chromium 159(headless shell／chromium revision 1255)不再繼承主機系統語系,應用程式語系預設 en-US(156、revision 1248 繼承);generic 字族(`sans-serif`)隨語系選字(Windows 繁中主機:拉丁字微軟正黑體 → Arial、中文字微軟正黑體 → Microsoft YaHei,14px 行高 19 → 16);Playwright context 之 `locale` 只改 `navigator.language`、不改字型.`--lang` 補回.
- 選項 `opt.lang`:**語系字串或 `false`**(自用鍵,不轉傳).理由:單一選項即涵蓋「指定／關閉／預設」三態,不增「布林＋字串」之冗餘組合(`lang:'x'` 而 `useSystemLang:false` 之矛盾格);種類為 R-PW-OPT 既有種類之併用(S 型之語法檢測＋B1 之 `false`),無效者依 K3 視為未給並於 `debug` 提示(V19 格式).語法 `isLangStr`:`^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$` 且長度 ≤35(單一語系;不含逗號、底線、空白、控制字元;與系統語系共用同一判準).

| 條 | 規則 | 測試 |
|---|---|---|
| 01 | 預設:呼叫端 `args`(有效者)無 lang 開關且 `opt.lang` 非 `false` 時,命令列補**恰一個** `--lang=<語系>`;語系＝`opt.lang`(有效字串)否則主機系統語系 `Intl.DateTimeFormat().resolvedOptions().locale`(每次合併時取得,不快取) | `unit-lang`(預設、各語系值、不快取);`api-lang`(真 headless shell:`navigator.language`、字型、行高);`api-pwDrift`(真命令列:16 格矩陣、接線、`next()`、四種呼叫);變異 L01、L10 |
| 02 | 取不到(Intl 不存在、建構式或 `resolvedOptions` 拋錯、`locale` 非字串或不合語法)→ 不補、不寫死任何語系;輸出與無本功能時完全相同 | `unit-lang`(16 種取不到之形態);變異 L06 |
| 03 | 呼叫端優先:`args` 含開關名為 lang 之任何寫法(`--lang=…`、`-lang=…`、大小寫、無值、空值)者原樣保留於原位、不補(全命令列之 lang 開關即呼叫端所給者;給兩個即兩個);`opt.lang` 為字串而 `args` 已有者 `opt.lang` 不採用並於 `debug` 提示(`opt.lang is ignored because args already contains a --lang switch`);`args` 整鍵無效(R-PW-MERGE 03)時其內之 `--lang` 一併捨棄、改補預設 | `unit-lang`(7 種寫法、兩個 lang、與功能開關並存、衝突提示、整鍵無效);`api-lang`(`callerArgs` 同 `optEn`);變異 L02、L09、L16 |
| 04 | `opt.lang`:有效字串→改補該語系(不讀系統語系);`false`→不補(`args` 已有者仍原樣保留);`null`／`undefined`／無效(`true`、`''`、含空白／底線／逗號／非 ASCII、過長、非字串)→視為未給(取系統語系)並於 `debug` 提示 `invalid opt.lang: must be a locale string such as 'en-US' or false, using default the system language`(不含值);每鍵只讀一次(V11);存取拋錯視為無效 | `unit-lang`(22 種無效值、V11、存取器拋錯、提示全文與一次性);`api-lang`(`off`、`optEn`、`optJa`);變異 L03、L05、L08 |
| 05 | 位置:`args` ＝呼叫端其餘 args(原序)＋`--lang`＋〔`--enable-features`〕＋合併 `--disable-features`(R-PW-MERGE 01:仍恆為最後一個元素);輸出與輸入順序無關(原則 2) | `unit-lang`(位置、順序無關、`assertGuarded`);變異 L04、L15 |
| 06 | 兩入口(`launchChromium`、`launchChromiumPersistent`)與 `getChromiumLaunchOptions` 經同一合併,結果一致;`finalGate` 於 `PLAYWRIGHT_LEGACY_SCREENSHOT` 改變而重新合併時 lang 仍恰一個;`next(o)` 重走完整流程;`fallbackOptions`(內部缺陷之保底)只含守門、不含 lang(R-PW-MERGE 09) | `unit-lang`(8 種輸入 × 系統語系有／無 × 兩入口之替身、finalGate 案、保底案);`api-lang`(`persistentDefault`＝`default`);`api-pwDrift`;變異 L12～L14(逐點植入) |
| 07 | `opt.lang` 不轉傳給 Playwright(`SELF_KEYS`);其餘未宣告之鍵(如 context 之 `locale`)仍原樣轉傳,且不影響本項 | `unit-lang`;`api-lang`(`defaultCtxLocaleEn`:語系變而字型不變);變異 L07 |
| 08 | `getPlaywrightInfo().systemLang`＝本套件預設將補入之主機系統語系(同一取得函數 `getSystemLang`;取不到 `''`;深凍結) | `unit-lang`;變異 L11 |
| 09 | 真瀏覽器之實證(headless shell revision 1255,Windows 繁中主機):預設 `navigator.language` 為主機語系、`sans-serif` 拉丁字與中文字皆微軟正黑體;`lang:false` 為 en-US、Arial／Microsoft YaHei;兩者行高、寬度不同(鑑別力);主機系統語系為 en-US 者「預設 ≠ 關閉」之案略過(略過不算通過) | `api-lang`(子行程 `test/tools/langProbe.mjs`) |

- 站點全集(R-PW-LANG 之「須經同一合併」之處):①`mergeParsed`(唯一實作)——被 `getChromiumLaunchOptions`、`_launchCore.prepare`(兩入口)、`_launchCore.finalGate`(重新合併)三處呼叫;②`getPlaywrightInfo`(呈現);③`fallbackOptions`(刻意不套:保底只含守門).盤點指令(命中須只在 `mergeParsed` 與其輔助):`rg -n "SW_LANG|getSystemLang|isLangStr" src`、`rg -n "mergeParsed\(" src`;防空集合:前者須命中 `src/getChromiumLaunchOptions.mjs`.
- 既有測試之處置:`unit-mergeFeatures`、`unit-opt`、`unit-setBrowserTypeForTest` 之斷言為 `args` 之完整內容與長度,於 `before` 以 `test/tools/sysLang.mjs` 之 `muteSysLang()` 令主機系統語系取不到(斷言本身未改、未放寬),使之不隨主機語系而變;語系預設之斷言集中於 `unit-lang`.新增測試若斷言 `args` 之完整內容,須先固定系統語系(`setSysLang`／`muteSysLang`).
- 變異清單(R-PW-LANG;於 `./tmp` 之副本逐一植入,跑所列測試,須皆轉紅;2026-11-21 共 16 個皆轉紅,數字見該輪報告):L01 預設不補;L02 呼叫端 lang 偵測改為 `startsWith('--lang')`;L03 `lang:false` 不關閉;L04 lang 置於合併 disable 之後;L05 語系字串不檢測(只判非空);L06 取不到時寫死 `en-US`;L07 `lang` 不列自用鍵;L08 忽略 `opt.lang` 之字串;L09 拿掉呼叫端優先;L10 系統語系於模組載入時快取;L11 `getPlaywrightInfo().systemLang` 恆 `''`;L12／L13 持久／非持久入口各自去掉 `--lang`;L14 `finalGate` 重新合併後去掉 `--lang`;L15 lang 置於呼叫端其餘 args 之前;L16 衝突時不提示.
- 未驗(不視為已證):真 Chrome／Edge／完整 Chromium 之語系行為(本項只實測 headless shell revision 1255);有頭;Linux／macOS;非 zh-TW 主機之字型(`api-lang` 之字型案在非 Windows 或非 zh-TW 主機略過).

### R-PW-TABLE 內附表與版本(設計 §3.2)

- `src/pwDefaults.mjs` 對應 `package.json` 之 `playwright-core` 精確版本;實裝版本 ≠ 表即拒絕啟動 `E_PW_VERSION`(F1).表不由腳本產生.
- 升版流程:以 `npm i playwright-core@<版> --save-exact` 改精確版本(不得改宣告後 `npm i`,會繞過冷卻期)→ `api-pwDrift` 轉紅並印出實際清單與靜態抽取 → 人工更新表 → 全套綠(含 `api-realChromeGuard` 實際通過)→ 發布 → 全庫連動.
- 表之鍵:`version`、`disableFeatures`、`enableFeatures`、`enableLegacyEnv`、`enableLegacyOmit`(legacy 環境變數為真時 Playwright 自預設 enable 省略之項)、`guardFeatures`、`channels`.
- 升版核對清單(每次升版逐項,人工讀 `node_modules/playwright-core/lib/coreBundle.js`;Playwright 之 release notes 不載啟動開關之變動,1.65.1 即然):①`chromiumSwitches.ts` 段之 `disabledFeatures`、`enabledFeatures()`(含條件式項目,如 legacy 環境變數省略何項);②registry 之 Chromium 系通道全集與 Windows 前綴/後綴(`_findChrome.mjs` 所仿);③錯誤訊息詞 `Executable doesn't exist at`、`Host system is missing dependencies`、`Missing system dependencies`(`_launchCore.mjs` 之比對);④CLI 選項 `--no-remove`、`--only-shell`、`--no-shell`、`install-deps`;⑤本套件取用之內部介面:`playwright-core/lib/coreBundle` 之 `utils.debugMode`、`registry.registryDirectory`、`registry.registry.findExecutable`、package `exports` 仍列 `./lib/coreBundle`;⑥`api-pwDrift` 之 legacy 隔離行程案(真命令列)與真 Chrome／Edge／完整 Chromium 之一次性守門實證.
- 表之變更紀錄:1.64.1 → 1.65.1(第 440 項,2026-11-21):disable 18 → 16 項(去 `DialMediaRouteProvider`、`GlobalMediaControls`、`BlockOriginHeaderModificationOnRedirect`、`Translate`、`AutoDeElevate`;增 `HttpsFirstBalancedModeAutoEnable`、`TcpPortRandomizationWin`、`PreconnectToSearch`);enable 1 → 2 項(增 `SkipListAccountsWithoutGaiaCookies`,且 legacy 環境變數自此只省略 `CDPScreenshotNewSurface`、不再整串省略 → 新增 `enableLegacyOmit` 與 R-PW-MERGE 07 之修正);`channels` 10 項不變;registry 之 Chrome/Edge 路徑不變.
- 測試:`api-pwDrift`(未合併之基準與表逐項相同、靜態抽取一致、legacy 隔離行程之真命令列)、`unit-env`(版本不符)、`unit-pkg`(依賴精確版).變異 M8.

### R-PW-ENV 環境(設計 §2.2 第②步、F14、F15)

- `PWDEBUG` 為 inspector 值(Playwright `debugMode` 語意:非 `''`、`console`、`0`、`false`)時 `E_ENV`;來源三者任一:本模組載入時之快照、呼叫時之值(依 Playwright `getFromENV` 依序讀 `PWDEBUG`、`npm_config_pwdebug`、`npm_package_config_pwdebug`)、Playwright 實際採用之 `debugMode()`.
- `SELENIUM_REMOTE_URL` 有值即 `E_ENV`;兩入口一致(原則 4).
- 最後檢查(`finalGate`):實際呼叫 BrowserType(真或替身)之前、一切回調之後,同步再檢環境(E_ENV),且 `PLAYWRIGHT_LEGACY_SCREENSHOT` 於合併後改變即依現值重新合併.
- 測試:`unit-env`(含隔離行程之載入時設定／載入後設定／playwright-core 先載入／npm_config 變體／對照);`unit-setBrowserTypeForTest`(回調改環境兩案);變異 M6、M7、M15、M15b.

### R-PW-ORDER 兩入口同一順序(原則 4)

①快照 opt → ②環境 → ③版本 → ④登入守門 → ⑤合併 → ⑥BrowserType(或替身)→ ⑦受管缺檔依 `autoInstall` 安裝一次再啟動一次.`launchChromiumPersistent` 之 `userDataDir` 非字串 → reject `E_ARG`,先於①.實作:`src/_launchCore.mjs` 之 `prepare`.測試:`unit-env`(順序兩案)、`unit-logonGuard`(兩入口).

### R-PW-OPT 輸入檢測(設計 §7;dspec〈輸入參數之檢測機制〉§7 之 w-playwright 例外)

- 不依 wsemi;`src/_check.mjs` 為最小實作,種類語意對齊 wsemi 同名種類(O1、B1、S1、S2、S3、F1、A3、N2 `'timer'`);`opt.lang`(語系字串或 `false`)見 R-PW-LANG 04,語法判準 `isLangStr` 於 `src/getChromiumLaunchOptions.mjs`.opt 每鍵只讀一次(V11);非預期之值視為未給、改用預設(K3);`opt.debug` 時以固定詞彙提示(不含值,K9、V20;同函數同鍵同原因每行程一次;有 `funLog` 交 `funLog('warn', msg)`,否則 `console.warn`).
- 自用鍵:`debug`、`funLog`、`onTrace`、`autoInstall`、`installDeps`、`installTimeout`(排程第 636 項;N2 `timer`,預設 `INSTALL_BUDGET_MS`,0 不限,無效改預設並提示)、`lang`;皆不轉傳(`SELF_KEYS`).
- 測試:`unit-opt`(V24 矩陣、讀次數、撤銷之 Proxy、提示全文);`unit-installBudget`(`installTimeout` 之有效／無效矩陣與提示全文).

### R-PW-ERR 錯誤契約(設計 §2.3;dspec〈診斷輸出與遮罩〉D1 例外、D2、D3)

- Promise 一律 reject 帶 `code` 之 `Error`,訊息固定詞彙(版本號可附),無 `cause`;Playwright 原錯誤只交 `opt.funLog('launch-error', { fn, code }, 原錯誤)`;不自寫遮罩.
- code 全集:`E_ARG`、`E_ENV`、`E_PW_VERSION`、`E_LOGON_GUARD`、`E_BROWSER_MISSING`、`E_LAUNCH_TIMEOUT`、`E_LAUNCH`、`E_INSTALL`、`E_LAUNCH_HOOK`(排程第 636 項:`onBrowserCreated` 之鉤子失敗,見 R-PW-HOOK).
- 測試:`unit-setBrowserTypeForTest`、`unit-env`、`unit-ensureChromium`、`unit-onBrowserCreated`.

### R-PW-TRACE 觀察回調(dspec〈計時器〉§2;getTrace 單一擁有者之 w-playwright 例外)

- `onTrace` 同步呼叫、不帶接收者、拋錯與 rejection 忽略、事件凍結且只含原始值;未給不組事件.事件:`launch-options`、`env-reject`、`version-reject`、`logon-reject`、`install-start`、`install-done`、`install-fail`(逾時之 `exitCode` 為 -1)、`browser-hook`、`browser-hook-failed`(後兩者見 R-PW-HOOK).`funLog` 同語意(標籤:`warn`、`launch-error`、`hook-error`、`install-output`、`install-error`).
- 測試以事件同步(安裝逾時等以 reject 事件為同步點,不以固定等待).

### R-PW-INSTALL 受管瀏覽器之取得(設計 §4)

- `ensureChromium` 與 `autoInstall` 共用 `src/_install.mjs`:`process.execPath` 執行本套件所依之 `playwright-core/cli.js install --no-remove --only-shell|--no-shell chromium`(Linux 且 `installDeps` 另 `install-deps chromium`);`windowsHide: true`;子行程 `PLAYWRIGHT_BROWSERS_PATH` 固定為載入時 Playwright 之 `registryDirectory`(F22);逾時以 `taskkill /T /F`(Windows)結束子行程樹.
- `autoInstall`、`installDeps` 預設 false;受管缺檔且未自動安裝 → `E_BROWSER_MISSING`.
- 安裝有整體上限(排程第 636 項,見 R-PW-BUDGET):`autoInstall` 以 `opt.installTimeout`(預設 `INSTALL_BUDGET_MS`)、`ensureChromium` 以 `opt.timeout`(預設 `INSTALL_BUDGET_MS`),明確給 0 才不限.
- 測試:`unit-ensureChromium`(注入替身)、`api-autoInstall`(真下載,空 `PLAYWRIGHT_BROWSERS_PATH`)、`unit-installBudget`、`api-installBudget`.變異 M11、M12.

### R-PW-LOGON 執行期登入守門(主控裁示 4)

- `W_PLAYWRIGHT_LOGON_GUARD` 開啟(未設、''、'0'、'false' 之精確值以外;不去空白)時,種類非 headless shell 之啟動前讀 `BadPasswordAttempts`(`src/readBadPassword.wsf` 經 `cscript //nologo`,WinNT ADSI,`windowsHide`;不用 PowerShell),≥1、已鎖或讀不到 → `E_LOGON_GUARD`.非 Windows 一律讀不到;目前行程之帳號須 `USERDOMAIN`＝`COMPUTERNAME`(本機帳號),否則讀不到.
- 時點:②～④之前置檢查讀一次;另於每次實際呼叫真 BrowserType 前(含自動安裝後之重試、替身之每次 `next()`)重讀;同一行程內此類啟動以鎖依序進行(讀取至啟動完成).跨行程不協調(殘餘,README 載明).
- 種類:`executablePath` 等於 Playwright 受管之 headless shell 路徑(registry,正規化比對),或(無 `executablePath`、無 `channel`、無頭)為 headless shell;其餘皆非(檔名相同之他檔亦非).
- 測試:`unit-logonGuard`(含真讀取一案、next 重讀、序列化、本機帳號);`unit-ensureChromium`(安裝後重試重讀);`api-realChromeGuard` 之真啟動子行程開啟此守門.變異 M9、M16、M20、M21、M22.

### R-PW-SEAM 測試接縫(設計 §2.2、F20)

- `setBrowserTypeForTest(fake)`:fake 為一般物件且 `launch` 為函數(`launchPersistentContext` 可省,給了須為函數),否則同步 throw `E_ARG`;方法只讀一次並快照,呼叫時以原 fake 為 `this`;替身以堆疊管理(生效者為最後設定且未還原者,還原不必依序);替身收合併後選項(深複本)與 `next`(見 README);替身層不自動安裝(缺檔即 `E_BROWSER_MISSING`);`next` 內之本套件錯誤原樣往外(不重包、不重報 funLog).不對外提供原始 BrowserType.
- **替換，非疊放**:只有堆疊頂之替身被呼叫,其下者不被呼叫(替身內之 `next()` 直達真 BrowserType).需要「各處皆生效、可疊放」之啟動後處理者用 `onBrowserCreated`(R-PW-HOOK),兩者正交.
- 測試:`unit-setBrowserTypeForTest`;`api-pwDrift`(next 真啟動);`unit-onBrowserCreated` R-PW-HOOK 05(正交,含兩層替身只呼叫頂層).變異 M10、M18、M25.

### R-PW-HOOK 啟動後鉤子(排程第 636 項,2026-11-26;入口 `src/onBrowserCreated.mjs`,唯一實作 `src/_launchCore.mjs` 之 `withHooks`、`getHooks`、`pushHook`、`removeHook`、`closeQuietly`)

- 背景:使用端須對每個啟動出之瀏覽器做同一件事(如掛路由),而 `setBrowserTypeForTest` 為替換非疊放,使用端只能各自在自己之替身內包裝 `launch`;本項提供可疊放之「瀏覽器建立後」鉤子,使用端一行掛上.
- 名稱與簽章依本庫風格定(草案之 `info.options` 不提供:鉤子無需,且合併後選項含執行檔路徑、代理等,要看另用 `getChromiumLaunchOptions`).

| 條 | 規則 | 測試 |
|---|---|---|
| 01 | `onBrowserCreated(hook)`:`hook` 非函數即同步 throw `E_ARG`(`invalid hook: must be a function`,工廠類);回傳還原函數 | `unit-onBrowserCreated` 01;變異 H09 |
| 02 | **套用點單一包裝**:`runLaunch`、`runLaunchPersistent` 各以唯一之 `return withHooks(go, hs, st, fn, kind)` 結束,涵蓋「真 BrowserType／替身」兩條路徑,共 4 條返回路徑皆經它;`target` 為最終回傳給呼叫端者(`Browser`／持久 `BrowserContext`),`info` 為凍結之 `{ fn, kind: 'browser'\|'persistent' }`;鉤子完成前啟動不 resolve | `unit-onBrowserCreated` 02;`api-onBrowserCreated`(真 launchChromium、真 launchChromiumPersistent 各一,路由效果作用於頁面);變異 H08a～H08e |
| 03 | **與 `setBrowserTypeForTest` 正交**:自設替身時鉤子仍生效;兩層替身只呼叫頂層(替換)而鉤子只一次(疊放);替身內 `next()`、`next(o)` 皆只套一次(內層 `runLaunch(o2, fn, false)` 之 `useOverride=false` 時 `hs=[]`) | `unit-onBrowserCreated` 05;`api-onBrowserCreated`(真 `next()`／`next(o)`);變異 H06a、H06b |
| 04 | **只對最終成功者套一次**:`withHooks` 包在 `launchWithInstall` 之外;啟動失敗、安裝失敗不呼叫鉤子;autoInstall 之「安裝後再啟動」失敗之嘗試不產生瀏覽器 | `unit-onBrowserCreated` 06、11;變異 H17 |
| 05 | **疊放且串行**:全部鉤子依註冊順序逐一 `await`(前一個完成後才開始下一個);鉤子回傳值忽略(不取代 `target`) | `unit-onBrowserCreated` 03、06;`api-onBrowserCreated` 疊放案;變異 H03、H04、H11 |
| 06 | **失敗**:鉤子拋錯或 reject(含非 Error 值)→ 先 `closeQuietly(target)`(關閉之錯誤吞掉、target 無 `close` 亦可)、**關閉完成後**才以固定詞彙 `E_LAUNCH_HOOK`('browser launch hook failed',無 cause,不附原錯誤)reject;後續鉤子不執行;已執行者不回滾;原錯誤與序號只交 `funLog('hook-error', { fn, index, code }, 原錯誤)` | `unit-onBrowserCreated` 07、08;`api-onBrowserCreated`(真瀏覽器 `isConnected()` 為 false、持久 context 已觸發 `close`);變異 H01、H02、H10、H12、H15 |
| 07 | **還原**:只移除自己那一份(以項目物件辨識,不論還原順序),重複呼叫無作用;同一函數註冊兩次呼叫兩次、各自還原 | `unit-onBrowserCreated` 04;變異 H07 |
| 08 | **快照**:每次啟動於**呼叫當下**(`runLaunch`／`runLaunchPersistent` 之首個敘述,先於 `prepare` 之任何 await 與呼叫端回調)取 `getHooks()`(陣列複本);啟動進行中(含 `onTrace` 回調內)才註冊／還原者不影響該次 | `unit-onBrowserCreated` 10、10b;變異 H05、H18 |
| 09 | **觀察**:每個鉤子完成後 `onTrace({ type: 'browser-hook', fn, index })`,失敗 `browser-hook-failed({ fn, index, code })`;凍結、未給 `onTrace` 不組事件、回調拋錯與 rejection 忽略 | `unit-onBrowserCreated` 09;變異 H14、H16 |
| 10 | 不為鉤子設時限(鉤子須會完成;失敗時 `closeQuietly` 亦無時限);鉤子內不得再觸發同一鉤子之啟動(清單為全域,會遞迴);`LAUNCH_HOOK_TIMEOUT_MS` 之餘裕涵蓋鉤子之合理耗時 | README、JSDoc(已知限制,無測試) |

- 站點全集與盤點:鉤子之套用只在 `withHooks`;盤點指令 `rg -n "withHooks\(" src`(命中須恰 2 處呼叫＋1 處定義:`runLaunch`、`runLaunchPersistent`)、`rg -n "getHooks\(" src`(須只在這兩處與定義);`launchWithInstall` 內不得出現鉤子(變異 H17).
- 變異清單(2026-11-26,於鏡像根逐一植入,須皆轉紅):H01 失敗不關閉;H02 失敗後後續鉤子仍執行;H03 倒序;H04 不 await;H05 `getHooks` 不回快照;H06a／b 內層 `next(o)` 亦套;H07 還原移除最後一項;H08a～e 各入口×路徑不套;H09 不檢型別;H10 訊息帶原錯誤;H11 回傳值取代 target;H12 關閉之錯誤不吞;H13 info 不凍結且 kind 恆 browser;H14 不發事件;H15 原錯誤不交 funLog;H16 index 錯位;H17 於 `launchWithInstall` 內套(每次嘗試皆套);H18 快照改於 `prepare` 之後取.

### R-PW-BUDGET 安裝預算與建議時限(排程第 636 項,2026-11-26;常數 `src/installBudget.mjs`,實作 `src/_install.mjs` 之 `budgetLeft`、`src/_launchCore.mjs` 之 `launchWithInstall`、`src/ensureChromium.mjs`)

- 背景:原 `ensureChromium` 之 `opt.timeout` 預設 0(不限)、`autoInstall` 之安裝無任何時限,使用端 `before` 遇首次下載時無可依據之時限.

| 條 | 規則 | 測試 |
|---|---|---|
| 01 | `INSTALL_BUDGET_MS`＝15 分鐘:單次安裝之整體上限;`LAUNCH_HOOK_TIMEOUT_MS`＝預算＋`KILL_WAIT_MAX`(10 秒)＋`LAUNCH_TIMEOUT_MS`(180 秒)＋`HOOK_MARGIN_MS`(60 秒)＝1150000;皆為 `src/installBudget.mjs` 之內部常數,主檔屬性只是匯出(改寫屬性不影響實際上限) | `unit-installBudget` 01、13;變異 B04、B08 |
| 02 | 取值與 Playwright 一致(靜態抽取 `coreBundle.js`,升版時轉紅):啟動逾時預設＝`LAUNCH_TIMEOUT_MS`;安裝目錄鎖退避(retries 20、factor 1.27579)之總和約 469.5 秒＜預算(後到者等候上限) | `unit-installBudget` 02 |
| 03 | `autoInstall` 之安裝受 `opt.installTimeout`(自用鍵;N2 `timer`,預設 `INSTALL_BUDGET_MS`,明確給 0 才不限)限制:`launchWithInstall` 以 `budgetLeft(budget, t0, now)` 交 `runInstall`;逾時即結束安裝子行程樹並 reject `E_INSTALL`('browser installation timed out',reject 於子行程樹結束之後) | `unit-installBudget` 04、06(假時鐘恰於 15 分鐘逾時、差 1 毫秒仍進行)、07(0 不限);`api-installBudget`(真子行程);變異 B01、B06、B09 |
| 04 | `ensureChromium` 之 `opt.timeout` 預設改為 `INSTALL_BUDGET_MS`(破壞性);明確給 0 才不限 | `unit-installBudget` 08;變異 B05 |
| 05 | 同一次呼叫之兩個安裝子行程(受管瀏覽器、Linux 系統相依)共用一個預算:第二個得剩餘毫秒;耗盡者得 1(逾時,而非 0＝不限);`t0` 自第一次安裝起算、不重置 | `unit-installBudget` 03、05、09;變異 B02、B03、B10、B11、B12 |
| 06 | **並行**:本套件無自己之跨行程鎖,只有 Playwright 之安裝目錄鎖(`registryDirectory/__dirlock`);後到者之等候發生於安裝子行程內,預算計時涵蓋整個子行程 → 後到者之等候已計入同一預算,最壞 1 倍(不乘 2);**有效上限＝「Playwright 鎖之等候上限約 7.8 分鐘」與預算之較小者**(先到者慢線下載逾 7.8 分鐘時後到者先 `E_INSTALL`,不自動重試).實測:持有中之鎖使安裝子行程停在等鎖、預算逾時被結束(`api-installBudget`);已過期之鎖被立即接手;後到者於 Playwright 之等候上限(實測 470.0 秒)後以離開碼 1 結束 | `api-installBudget`(live 與 stale 對照,launch、persistent、ensure 各一;`before` 靜態抽取守住「不下載」保險之前提);探測紀錄見 `sgud/exp/experience.md` 一之四 |
| 07 | `installTimeout` 為自用鍵:不轉傳給 Playwright;無效值依 K3 視為未給(預設)並以固定詞彙提示(不含值) | `unit-installBudget` 10～12;`unit-mergeFeatures` 第 10 步;變異 B07 |

- 變異清單(2026-11-26,須皆轉紅):B01 安裝不設上限(原缺陷);B02 系統相依安裝拿完整預算;B03 耗盡回 0;B04 預算改 10 分鐘;B05 `ensureChromium` 預設回 0;B06 `installTimeout` 預設 0;B07 `installTimeout` 不列自用鍵;B08 `LAUNCH_HOOK_TIMEOUT_MS` 缺等待項;B09 忽略 `st.installTimeout`;B10 系統相依安裝重新起算;B11 `ensureChromium` 第二個子行程拿完整預算;B12 不限變成 1 毫秒;B14 `budgetLeft` 不夾於預算以內(牆鐘倒退);備援(只跑真子行程測試仍須轉紅):B01b 同 B01、B13 `prepare` 不把 `installTimeout` 放進狀態(接線).
- 安全(測試不得下載):`api-installBudget` 之子行程一律設 `PLAYWRIGHT_DOWNLOAD_HOST` 與 `PLAYWRIGHT_CHROMIUM_DOWNLOAD_HOST`(後者優先)為本機不可連埠,且指向空的 `PLAYWRIGHT_BROWSERS_PATH`;萬一取得鎖亦只會下載失敗.

### R-PW-HIDE 子行程隱藏視窗(全域 §8.3)

- `src/` 內 `child_process` 全家(含本地別名 `sp`、`ef`)之每一處呼叫皆 `windowsHide: true`.盤點:`unit-pkg` 之最後一案(括號平衡取整個呼叫、防空集合 ≥3 處).

### R-PW-NOWSEMI 不依 wsemi(主控裁示 1;設計約束 1)

- `src`、`test`、`toolg` 不引用 `wsemi`、`playwright`(只用 `playwright-core`);`dependencies` 只有 `playwright-core` 精確版,dev 只有 `w-package-tools`.盤點:`unit-pkg`.

### R-PW-REAL 真瀏覽器之守門驗證(設計 §3.4、§8.3)

- `api-realChromeGuard` 常駐於全套:win32、有 Chrome、錯誤次數可讀且為 0 時,經本套件參數實際啟動真 Chrome 一次(無頭),`chrome://version` 之 `#variations-cmd-section`(base64 JSON)之 disable 集合 ⊇ 內附表 ∪ 守門、命令列恰一串、觀察窗內錯誤次數皆 0;不符條件即 skip(**略過不算通過**).同檔之對照(只起 headless shell)證明判準對未合併之命令列為 false.
- 完整 Chromium 與 Edge:一次性 `node test/tools/guardProbe.mjs real <chromium|msedge>`(不常駐);驗證紀錄於 `state.md`.
- 啟動語系之真瀏覽器驗證:`api-lang`(常駐;只起 headless shell,不觸發登入錯誤次數)見 R-PW-LANG 09.

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
| 合併(`getChromiumLaunchOptions.mjs`)、內附表 | `unit-mergeFeatures`、`unit-opt`、`unit-lang`、`api-pwDrift`、`api-lang`、`api-realChromeGuard` |
| 啟動語系(`getSystemLang`、`opt.lang`、`getPlaywrightInfo().systemLang`) | `unit-lang`、`api-lang`、`api-pwDrift`;既有三檔(`unit-mergeFeatures`、`unit-opt`、`unit-setBrowserTypeForTest`)以 `muteSysLang` 固定環境,須一併跑 |
| 啟動流程(`_launchCore.mjs`)、環境、版本 | `unit-env`、`unit-setBrowserTypeForTest`、`unit-logonGuard`、`api-pwDrift`、`unit-onBrowserCreated`、`unit-installBudget` |
| 啟動後鉤子(`onBrowserCreated.mjs`、`_launchCore.mjs` 之 `withHooks`) | `unit-onBrowserCreated`、`api-onBrowserCreated`(真 headless shell)、`unit-setBrowserTypeForTest`、`unit-pkg` |
| 輸入檢測(`_check.mjs`) | `unit-opt` 及全部 unit |
| 安裝(`_install.mjs`、`ensureChromium.mjs`) | `unit-ensureChromium`、`api-autoInstall`、`unit-installBudget`、`api-installBudget` |
| 安裝預算與建議時限(`installBudget.mjs`、`opt.installTimeout`、`getChromiumLaunchOptions.mjs` 之 `SELF_KEYS`) | `unit-installBudget`、`api-installBudget`、`unit-mergeFeatures`、`unit-ensureChromium`、`unit-pkg` |
| 登入守門(`_logonGuard.mjs`、`readBadPassword.wsf`) | `unit-logonGuard`、`api-realChromeGuard` |
| 系統 Chrome(`_findChrome.mjs`、`findSystemChrome.mjs`、`getPlaywrightInfo.mjs`) | `unit-findSystemChrome`、`unit-mergeFeatures` F19 |
| 依賴、匯出、子行程隱藏 | `unit-pkg` |
| Playwright 升版 | 全套(`api-pwDrift` 先紅) |

全套:`npm test`(`mocha --parallel "test/*.test.mjs" --timeout 180000`);`api-realChromeGuard` 會啟動真 Chrome 一次,跑前錯誤次數須為 0.

## 四、破壞性變更紀錄

- 1.0.0(新建):取代 w-package-tools-e2e 之 `launchChromium`／`launchChromiumCore`(由遷移輪移除;原則 14 不留相容層).
- 排程第 636 項(2026-11-26,未發布;版本由主控):①`ensureChromium` 之 `opt.timeout` 預設由 0(不限)改為 `INSTALL_BUDGET_MS`(15 分鐘),明確給 0 才不限;②`autoInstall` 之安裝由無時限改為受 `opt.installTimeout`(預設 15 分鐘)限制,逾時 `E_INSTALL`;③新增 `opt.installTimeout`(自用鍵,不轉傳;原先若有人給此鍵會被當未宣告之鍵原樣轉傳給 Playwright);④新增 `E_LAUNCH_HOOK`、`onBrowserCreated`、常數 `INSTALL_BUDGET_MS`、`LAUNCH_HOOK_TIMEOUT_MS`;主檔 default 匯出由 7 個函數增為 8 個函數＋2 個常數(`unit-pkg` 已改).自有套件不做向後相容.
