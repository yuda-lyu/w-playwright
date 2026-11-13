import { makeErr, isS2 } from './_check.mjs'
import { runLaunchPersistent } from './_launchCore.mjs'


/**
 * 以Playwright啟動持久設定檔之Chromium系瀏覽器(經本套件之合併參數; 唯一之持久啟動入口), 順序與失敗通道同launchChromium
 *
 * @param {String} userDataDir 輸入設定檔資料夾(字串, 可為''表Playwright之暫存設定檔; 非空時須為絕對路徑, 由Playwright檢查), 非字串即reject E_ARG(先於任何副作用)
 * @param {Object} [opt={}] 輸入設定物件, 鍵同launchChromium, 另可給context選項(原樣轉傳)
 * @returns {Promise} 回傳Promise, resolve回傳Playwright之BrowserContext, reject回傳帶code之Error
 * @example
 *
 * import wpw from 'w-playwright'
 *
 * let context = await wpw.launchChromiumPersistent('', { headless: true })
 * let page = await context.newPage()
 * await page.setContent('<div>ok</div>')
 * await context.close()
 *
 */
async function launchChromiumPersistent(userDataDir, opt) {
    if (!isS2(userDataDir)) {
        throw makeErr('E_ARG', 'invalid userDataDir: must be a string')
    }
    return runLaunchPersistent(userDataDir, opt, 'launchChromiumPersistent')
}


export default launchChromiumPersistent
