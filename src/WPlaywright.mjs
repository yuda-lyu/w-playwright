import launchChromium from './launchChromium.mjs'
import launchChromiumPersistent from './launchChromiumPersistent.mjs'
import getChromiumLaunchOptions from './getChromiumLaunchOptions.mjs'
import ensureChromium from './ensureChromium.mjs'
import findSystemChrome from './findSystemChrome.mjs'
import getPlaywrightInfo from './getPlaywrightInfo.mjs'
import setBrowserTypeForTest from './setBrowserTypeForTest.mjs'
import onBrowserCreated from './onBrowserCreated.mjs'
import { INSTALL_BUDGET_MS, LAUNCH_HOOK_TIMEOUT_MS } from './installBudget.mjs'


/**
 * 統一以Playwright啟動Chromium系瀏覽器之工具(啟動參數、瀏覽器之取得與檢查)
 *
 * 使用端一律 import wpw from 'w-playwright', 不深層匯入src
 *
 * 另有兩個常數(毫秒; 唯讀之值, 改寫其屬性不影響實際上限):
 * - INSTALL_BUDGET_MS: 單次安裝(autoInstall之整體、ensureChromium一次呼叫)之預算, 15分鐘, 為autoInstall與ensureChromium實際採用之預設上限(opt.installTimeout、opt.timeout可改, 0表不限)
 * - LAUNCH_HOOK_TIMEOUT_MS: 使用端於測試之before(內含啟動, 可能遇首次安裝)建議掛之時限, 約19.2分鐘, 不沿用測試框架之全域逾時(如mocha之180秒)
 *
 * @example
 *
 * import wpw from 'w-playwright'
 *
 * let browser = await wpw.launchChromium()
 * await browser.close()
 *
 */
let WPlaywright = {
    launchChromium,
    launchChromiumPersistent,
    getChromiumLaunchOptions,
    ensureChromium,
    findSystemChrome,
    getPlaywrightInfo,
    setBrowserTypeForTest,
    onBrowserCreated,
    INSTALL_BUDGET_MS,
    LAUNCH_HOOK_TIMEOUT_MS,
}


export default WPlaywright
