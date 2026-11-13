import { parseCommon, optS3, optB1, optTimer } from './_check.mjs'
import { runInstall } from './_install.mjs'


//KINDS, 可安裝之受管瀏覽器種類
let KINDS = ['headless-shell', 'chromium']


/**
 * ensureChromium之本體(內部; deps供測試注入{ spawn, platform, execPath, cliPath, env })
 */
async function ensureChromiumCore(opt, deps = {}) {
    let st = parseCommon(opt, 'ensureChromium')
    st.fn = 'ensureChromium'
    let kind = optS3(st, 'kind', KINDS, 'headless-shell')
    let installDeps = optB1(st, 'installDeps', false)
    let timeout = optTimer(st, 'timeout', 0)
    let platform = deps.platform || process.platform

    let t0 = Date.now()
    await runInstall(kind, st, timeout, deps)

    if (installDeps && platform === 'linux') {
        let remain = 0
        if (timeout > 0) {
            remain = Math.max(1, timeout - (Date.now() - t0))
        }
        await runInstall('deps', st, remain, deps)
    }

    return { kind }
}


/**
 * 安裝Playwright受管之瀏覽器(本套件所依之playwright-core指定之版本), 已安裝者Playwright不重複下載
 *
 * 以process.execPath執行本套件所依之playwright-core之cli.js(install --no-remove --only-shell|--no-shell chromium), 子行程隱藏視窗;
 * 瀏覽器目錄固定為本模組載入時Playwright所採用者(PLAYWRIGHT_BROWSERS_PATH須於載入前設定, 執行期改動不生效);
 * 不移除本機其他Playwright版本之瀏覽器(--no-remove); 下載由Playwright自CDN取得, 其完整性檢查為檔案大小(Content-Length)、解壓與標記檔, 無雜湊校驗
 *
 * @param {Object} [opt={}] 輸入設定物件(一般物件; 其他型別視為未給)
 * @param {String} [opt.kind='headless-shell'] 輸入種類(列舉字串: 'headless-shell'為無頭預設所用、'chromium'為有頭或channel:'chromium'所用之完整Chromium), 無效時用預設
 * @param {Boolean} [opt.installDeps=false] 輸入是否另安裝Linux系統相依(布林; install-deps, 可能需sudo; 非Linux不執行), 無效時用預設false
 * @param {Number|String} [opt.timeout=0] 輸入逾時毫秒(有效數字, 0~2147483647, 數字字串轉值後使用; 0表不限), 逾時即結束安裝子行程樹並reject, 無效時用預設0
 * @param {Boolean} [opt.debug=false] 輸入是否提示非預期之輸入(布林)
 * @param {Function} [opt.funLog] 輸入診斷出口函數(label, safe, detail): 'warn'、'install-output'(子行程輸出)、'install-error'
 * @param {Function} [opt.onTrace] 輸入觀察回調, 事件{ type }: 'install-start'、'install-done'、'install-fail'(皆帶kind; fail另帶exitCode)
 * @returns {Promise} 回傳Promise, resolve回傳{ kind }, reject回傳code為E_INSTALL之Error(含離開碼, 不附子行程輸出)
 * @example
 *
 * import wpw from 'w-playwright'
 *
 * await wpw.ensureChromium() //安裝headless shell
 * await wpw.ensureChromium({ kind: 'chromium' }) //安裝完整Chromium(有頭或channel:'chromium')
 *
 */
async function ensureChromium(opt) {
    return ensureChromiumCore(opt)
}


export default ensureChromium
export {
    KINDS,
    ensureChromiumCore
}
