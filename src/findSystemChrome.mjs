import { parseCommon, optS3, optS1 } from './_check.mjs'
import { findChromeCore } from './_findChrome.mjs'


/**
 * 以檔案存在判定系統Chrome或Edge之執行檔(路徑表同playwright-core); 不啟動瀏覽器; 永不拋錯
 *
 * 只判存在, 不代表可啟動(Linux無DISPLAY、權限、系統相依不在判斷內)
 *
 * @param {Object} [opt={}] 輸入設定物件(一般物件; 其他型別視為未給)
 * @param {String} [opt.channel='chrome'] 輸入通道(列舉字串: 'chrome'、'msedge'), 無效時用預設
 * @param {String} [opt.executablePath] 輸入執行檔路徑(非空字串, 如process.env.CHROME_PATH); 給了即只認它: 存在回其絕對路徑, 不存在回'', 無效時視為未給
 * @param {Boolean} [opt.debug=false] 輸入是否提示非預期之輸入(布林)
 * @param {Function} [opt.funLog] 輸入提示出口函數
 * @returns {String} 回傳執行檔之絕對路徑, 找不到回''
 * @example
 *
 * import wpw from 'w-playwright'
 *
 * let fp = wpw.findSystemChrome()
 * // => 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' 或 ''
 *
 */
function findSystemChrome(opt) {
    try {
        let st = parseCommon(opt, 'findSystemChrome')
        st.fn = 'findSystemChrome'
        let channel = optS3(st, 'channel', ['chrome', 'msedge'], 'chrome')
        let executablePath = optS1(st, 'executablePath')
        return findChromeCore({ channel, executablePath })
    }
    catch (err) {
        return ''
    }
}


export default findSystemChrome
