//pwDefaults, 內附表: playwright-core(精確版本)之Chromium預設--disable-features與--enable-features, 以及本套件一律加入之守門功能
//來源: playwright-core 1.64.1 之 lib/coreBundle.js 內 chromiumSwitches.ts 段(disabledFeatures陣列與chromiumSwitches之--enable-features組成)
//升版流程(如第440項): 改package.json之playwright-core精確版本 → 本套件api-pwDrift轉紅並印出新清單 → 人工更新本檔 → 全套測試綠(含api-realChromeGuard實際通過) → 發布
//本檔不由腳本產生(dspec自有套件之發布與建置腳本規則1)

let pwDefaults = {

    //version, 本表對應之playwright-core精確版本, 執行期實裝版本不同即拒絕啟動(E_PW_VERSION)
    version: '1.64.1',

    //disableFeatures, Playwright預設之--disable-features項目(依原順序)
    disableFeatures: [
        'AvoidUnnecessaryBeforeUnloadCheckSync',
        'DestroyProfileOnBrowserClose',
        'DialMediaRouteProvider',
        'GlobalMediaControls',
        'HttpsUpgrades',
        'LensOverlay',
        'MediaRouter',
        'PaintHolding',
        'ThirdPartyStoragePartitioning',
        'BlockOriginHeaderModificationOnRedirect',
        'AvoidCorsURLLoaderRestartOnRedirect',
        'Translate',
        'AutoDeElevate',
        'OptimizationHints',
        'NetworkTimeServiceQuerying',
        'AimEnabled',
        'msForceBrowserSignIn',
        'msEdgeUpdateLaunchServicesPreferredVersion',
    ],

    //enableFeatures, Playwright預設之--enable-features項目; 行程環境變數enableLegacyEnv為真值(非空字串)時Playwright不給此串
    enableFeatures: [
        'CDPScreenshotNewSurface',
    ],

    //enableLegacyEnv, 決定是否省略預設--enable-features之環境變數名(Playwright於每次啟動時讀取)
    enableLegacyEnv: 'PLAYWRIGHT_LEGACY_SCREENSHOT',

    //guardFeatures, 本套件一律加入--disable-features之守門功能
    //AutofillAiWalletPrivatePasses: Chromium 153起每啟動一個新瀏覽器根行程即以無效密碼替目前使用者呼叫一次LogonUser(Windows安全性紀錄4625、錯誤密碼次數+1), 停用此功能即不再發生
    guardFeatures: [
        'AutofillAiWalletPrivatePasses',
    ],

    //channels, playwright-core 1.64.1可用之Chromium系通道全集(registry之chromium、chrome*、msedge*與別名chrome-for-testing)
    channels: [
        'chromium',
        'chrome-for-testing',
        'chrome',
        'chrome-beta',
        'chrome-dev',
        'chrome-canary',
        'msedge',
        'msedge-beta',
        'msedge-dev',
        'msedge-canary',
    ],

}


//deepFreeze, 內附表不可被改寫
function deepFreeze(o) {
    for (let k of Object.keys(o)) {
        let v = o[k]
        if (v !== null && typeof v === 'object') {
            deepFreeze(v)
        }
    }
    return Object.freeze(o)
}
deepFreeze(pwDefaults)


export default pwDefaults
