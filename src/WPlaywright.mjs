import launchChromium from './launchChromium.mjs'
import launchChromiumPersistent from './launchChromiumPersistent.mjs'
import getChromiumLaunchOptions from './getChromiumLaunchOptions.mjs'
import ensureChromium from './ensureChromium.mjs'
import findSystemChrome from './findSystemChrome.mjs'
import getPlaywrightInfo from './getPlaywrightInfo.mjs'
import setBrowserTypeForTest from './setBrowserTypeForTest.mjs'


/**
 * 統一以Playwright啟動Chromium系瀏覽器之工具(啟動參數、瀏覽器之取得與檢查)
 *
 * 使用端一律 import wpw from 'w-playwright', 不深層匯入src
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
}


export default WPlaywright
