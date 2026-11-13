import { isO1, isF1, makeErr } from './_check.mjs'
import { pushOverride, removeOverride } from './_launchCore.mjs'


/**
 * 測試接縫: 以替身取代本套件所呼叫之BrowserType, 回傳還原函數; 不對外提供原始BrowserType
 *
 * 替身收到的是合併後之選項(與真啟動相同, 含守門)與next:
 * - fake.launch(mergedOpt, next): next()以同一份合併後選項呼叫真chromium.launch; next(o)對o重走完整流程(環境、版本、登入守門、合併)後呼叫真chromium.launch
 * - fake.launchPersistentContext(userDataDir, mergedOpt, next): 同上, 對應真chromium.launchPersistentContext(未提供此方法時, launchChromiumPersistent以E_LAUNCH失敗)
 * 替身之拋錯依真啟動之規則轉為固定詞彙錯誤(訊息含"Executable doesn't exist at"者視為受管瀏覽器缺檔)
 *
 * 同一行程內使用端之src與測試取同一個主檔模組, 替換對兩者同時有效(依賴樹有兩份本套件時只作用於呼叫者那一份, 使用端之接線測試須斷言替身確被呼叫);
 * 多次設定時以最後設定且未還原者生效; 還原函數只移除自己這一份(不論還原順序), 重複呼叫無作用; 替身之方法以原fake物件為this呼叫
 *
 * @param {Object} fake 輸入替身(一般物件, launch為函數, launchPersistentContext可省略但給了須為函數), 不符即同步throw code為E_ARG之Error(工廠類)
 * @returns {Function} 回傳還原函數
 * @example
 *
 * import wpw from 'w-playwright'
 *
 * let seen = []
 * let restore = wpw.setBrowserTypeForTest({
 *     launch: async (o, next) => {
 *         seen.push(o.args) //合併後之args, 最後一個元素為--disable-features=...
 *         return next() //以同一份合併後選項真啟動
 *     },
 * })
 * try {
 *     let browser = await wpw.launchChromium({ headless: true })
 *     await browser.close()
 * }
 * finally {
 *     restore()
 * }
 *
 */
function setBrowserTypeForTest(fake) {
    //各方法只讀一次(快照), 驗證與保存同一份
    let ok = false
    let launch
    let lpc
    try {
        if (isO1(fake)) {
            launch = fake.launch
            lpc = fake.launchPersistentContext
            ok = isF1(launch) && (lpc === undefined || isF1(lpc))
        }
    }
    catch (err) {
        ok = false
    }
    if (!ok) {
        throw makeErr('E_ARG', 'invalid fake: must be a plain object with a launch function')
    }
    //快照: 方法只讀一次; 呼叫時以原fake為接收者(替身內可用this)
    let entry = Object.freeze({ launch, launchPersistentContext: lpc, self: fake })
    pushOverride(entry)
    let restored = false
    return function restore() {
        if (restored) {
            return
        }
        restored = true
        //堆疊: 移除自身之項(不論還原順序), 生效者恆為堆疊頂
        removeOverride(entry)
    }
}


export default setBrowserTypeForTest
