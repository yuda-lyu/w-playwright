import { isF1, makeErr } from './_check.mjs'
import { pushHook, removeHook } from './_launchCore.mjs'


/**
 * 註冊「瀏覽器建立後」之鉤子(可疊放), 回傳還原函數; 使用端以一行掛上, 不必各自包裝launch
 *
 * 鉤子於launchChromium／launchChromiumPersistent成功取得瀏覽器之後、回傳給呼叫端之前被呼叫(每次啟動各一次):
 * - hook(target, info): 可為async; target為最終回傳給呼叫端之物件(launchChromium為Browser、launchChromiumPersistent為持久之BrowserContext);
 *   info為凍結物件{ fn, kind }(fn為入口函數名; kind為'browser'或'persistent'); 回傳值忽略(鉤子就地對target動作, 如掛路由、包裝close; 不能以回傳值取代target)
 * - 疊放: 多個鉤子依註冊順序串行await(先註冊者先執行, 前一個完成後才執行下一個); 還原函數只移除自己這一份(不論還原順序), 重複呼叫無作用;
 *   同一函數註冊兩次即呼叫兩次, 各自之還原函數各移除各自那一份
 * - 與setBrowserTypeForTest正交: setBrowserTypeForTest為「替換」(只有堆疊頂之替身生效), 本函數為「疊放」(全部鉤子皆生效);
 *   鉤子套在最終回傳者上, 不論來自真BrowserType或替身(含替身內next()之結果), 使用端自設替身時鉤子仍生效
 * - 只對最終成功者套用一次: autoInstall之「安裝後再啟動」時失敗之嘗試不產生瀏覽器、不呼叫鉤子; 替身內next(o)之內層啟動亦不另外套用(由外層對最終回傳者套一次)
 * - 失敗: 鉤子拋錯或reject時, 先關閉該瀏覽器(關閉之錯誤吞掉), 後續鉤子不執行, 再以固定詞彙之錯誤reject(code為E_LAUNCH_HOOK, 訊息'browser launch hook failed', 不附原錯誤);
 *   原錯誤與鉤子序號只交opt.funLog('hook-error', { fn, index, code }, 原錯誤); 已執行之鉤子不回滾(鉤子自負冪等)
 * - 觀察: opt.onTrace增'browser-hook'(每個鉤子完成後, { fn, index })、'browser-hook-failed'({ fn, index, code })
 * - 快照: 每次啟動以「呼叫launchChromium／launchChromiumPersistent當下」已註冊者為準(與opt之快照同時); 啟動進行中(含onTrace等回調內)才註冊或還原者不影響該次啟動
 * - 限制: 鉤子須會完成, 本套件不為鉤子設時限, 失敗時關閉瀏覽器亦無時限(close卡住則啟動不會reject);
 *   鉤子內不要再呼叫會觸發同一鉤子之啟動(launchChromium、launchChromiumPersistent): 清單為全域, 會遞迴; 需要輔助瀏覽器者於鉤子內以info或旗標略過
 *
 * @param {Function} hook 輸入鉤子(函數(target, info)), 不符即同步throw code為E_ARG之Error(工廠類)
 * @returns {Function} 回傳還原函數
 * @example
 *
 * import wpw from 'w-playwright'
 *
 * //於測試之共用處一行掛上(例如以使用端自備之routeBrowser(target)對Browser或持久BrowserContext掛路由), 不論各處如何啟動(含自設setBrowserTypeForTest之替身)皆生效
 * let seen = []
 * let restore = wpw.onBrowserCreated(async (target, info) => {
 *     seen.push(info.kind) //'browser'(launchChromium)或'persistent'(launchChromiumPersistent)
 *     //await routeBrowser(target) //就地對target設定; 回傳值忽略
 * })
 * try {
 *     let browser = await wpw.launchChromium({ headless: true }) //回傳前已套鉤子
 *     await browser.close()
 * }
 * finally {
 *     restore()
 * }
 *
 */
function onBrowserCreated(hook) {
    if (!isF1(hook)) {
        throw makeErr('E_ARG', 'invalid hook: must be a function')
    }
    //以項目(物件)辨識自己這一份, 同一函數註冊兩次亦各自獨立
    let entry = Object.freeze({ hook })
    pushHook(entry)
    let restored = false
    return function restore() {
        if (restored) {
            return
        }
        restored = true
        removeHook(entry)
    }
}


export default onBrowserCreated
