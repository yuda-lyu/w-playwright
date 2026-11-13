import { runLaunch } from './_launchCore.mjs'


/**
 * 以Playwright啟動Chromium系瀏覽器(經本套件之合併參數; 唯一之非持久啟動入口)
 *
 * 順序: 快照opt → 環境檢查(PWDEBUG為inspector模式、SELENIUM_REMOTE_URL有值即E_ENV) → playwright-core實裝版本≠內附表即E_PW_VERSION →
 * 登入守門(環境變數W_PLAYWRIGHT_LOGON_GUARD開啟且種類非headless shell時) → 合併(getChromiumLaunchOptions之同一實作) → chromium.launch(或setBrowserTypeForTest之替身) →
 * 受管瀏覽器缺檔時: autoInstall為true則安裝一次再啟動一次, 否則E_BROWSER_MISSING
 *
 * 失敗一律reject固定詞彙之Error並帶code(E_ENV、E_PW_VERSION、E_LOGON_GUARD、E_BROWSER_MISSING、E_LAUNCH_TIMEOUT、E_LAUNCH、E_INSTALL);
 * Playwright之原錯誤(含完整命令列)不附於對外錯誤, 只交opt.funLog('launch-error', { fn, code }, 原錯誤)
 *
 * @param {Object} [opt={}] 輸入設定物件(一般物件; 其他型別視為未給), 為chromium.launch之選項加上本套件自用鍵; 未宣告之鍵原樣轉傳由Playwright檢查(其拒絕經E_LAUNCH)
 * @param {Array} [opt.args=[]] 輸入瀏覽器參數陣列(選項陣列, 元素為以-開頭之開關字串; 規則見getChromiumLaunchOptions), 無效時視為[]
 * @param {Array} [opt.ignoreDefaultArgs=[]] 輸入要去掉之Playwright預設參數陣列(選項陣列, 元素為非空字串; true不收), 無效時視為[]
 * @param {Boolean} [opt.headless=true] 輸入是否無頭(布林), 無效時用預設true; 無頭且未給通道與執行檔時使用headless shell
 * @param {String} [opt.channel] 輸入通道(列舉字串: 'chromium'、'chrome-for-testing'、'chrome'、'chrome-beta'、'chrome-dev'、'chrome-canary'、'msedge'、'msedge-beta'、'msedge-dev'、'msedge-canary'), 無效時視為未給
 * @param {String} [opt.executablePath] 輸入執行檔路徑(非空字串), 無效時視為未給
 * @param {Boolean} [opt.autoInstall=false] 輸入受管瀏覽器缺檔時是否自動安裝一次(布林), 無效時用預設false
 * @param {Boolean} [opt.installDeps=false] 輸入Linux缺系統相依時是否安裝相依一次(布林; 可能需sudo), 無效時用預設false
 * @param {Boolean} [opt.debug=false] 輸入是否提示非預期之輸入(布林)
 * @param {Function} [opt.funLog] 輸入診斷出口函數(label, safe, detail): 'warn'(提示)、'launch-error'(原錯誤)、'install-output'、'install-error'
 * @param {Function} [opt.onTrace] 輸入觀察回調(同步呼叫, 拋錯與rejection皆忽略), 事件{ type }: 'launch-options'、'env-reject'、'version-reject'、'logon-reject'、'install-start'、'install-done'、'install-fail'
 * @returns {Promise} 回傳Promise, resolve回傳Playwright之Browser, reject回傳帶code之Error
 * @example
 *
 * import wpw from 'w-playwright'
 *
 * let browser = await wpw.launchChromium({ headless: true })
 * let page = await browser.newPage()
 * await page.setContent('<div>ok</div>')
 * await browser.close()
 *
 */
async function launchChromium(opt) {
    return runLaunch(opt, 'launchChromium')
}


export default launchChromium
