import path from 'path'
import pwDefaults from './pwDefaults.mjs'
import { getManagedShellPath } from './_pw.mjs'
import {
    isS1,
    readArray,
    warn,
    warnInvalid,
    parseCommon,
    getKey,
    optB1,
    optS1,
    optS3
} from './_check.mjs'


//本套件自用之鍵(不轉傳給Playwright)
let SELF_KEYS = ['debug', 'funLog', 'onTrace', 'autoInstall', 'installDeps']

//本套件宣告之鍵(其餘鍵原樣轉傳, V7、V8)
let DECL_KEYS = [...SELF_KEYS, 'args', 'ignoreDefaultArgs', 'headless', 'channel', 'executablePath', 'ignoreAllDefaultArgs']

//reCtrl, 控制字元(C0、DEL、C1)
//C1含U+0085(NEL): Chromium(Windows)以TrimWhitespace修剪每個引數, 其空白集合含NEL而JS之trim不含(其餘皆含),
//頭尾帶NEL之'--\u0085'於Chromium即成開關終止符'--'(2026-11-13以headless shell實測: 其後之開關失效、啟動失敗); 故C1一律無效
let reCtrl = /[\x00-\x1f\x7f-\x9f]/ // eslint-disable-line no-control-regex

//reItem, 功能開關之項目語法(ASCII): 可選前置*、功能名、可選<試驗或:參數
let reItem = /^\*?[A-Za-z0-9_]+(?:[<:][\x21-\x7e]*)?$/

//功能開關之開關名
let SW_DISABLE = 'disable-features'
let SW_ENABLE = 'enable-features'


/**
 * 開關名: 去前置-、ASCII轉小寫(Windows之Chromium不分大小寫)、取=之前
 */
function switchName(s) {
    let t = s.replace(/^-+/, '')
    let i = t.indexOf('=')
    if (i >= 0) {
        t = t.slice(0, i)
    }
    return t.replace(/[A-Z]/g, (c) => c.toLowerCase())
}


/**
 * 是否為功能開關(--disable-features或--enable-features之任一變體)
 */
function isFeatureSwitch(s) {
    if (typeof s !== 'string') {
        return false
    }
    let t = s.trim()
    if (!t.startsWith('-')) {
        return false
    }
    let n = switchName(t)
    return n === SW_DISABLE || n === SW_ENABLE
}


/**
 * 功能名: 去前置*後取<、:之前
 */
function featureName(item) {
    let t = item.replace(/^\*/, '')
    let m = t.search(/[<:]/)
    return m >= 0 ? t.slice(0, m) : t
}


/**
 * 切出功能開關之項目: 值取第一個=之後, 以,切、去空白、去空項; 任一項目不合語法回null
 */
function splitItems(s) {
    let i = s.indexOf('=')
    let v = i >= 0 ? s.slice(i + 1) : ''
    let items = v.split(',').map((t) => t.trim()).filter((t) => t !== '')
    for (let t of items) {
        if (!reItem.test(t)) {
            return null
        }
    }
    return items
}


/**
 * args之元素是否有效(§3.1第2步): 原始字串、頭尾無空白(含Chromium修剪之NEL)、以-開頭、不等於--、開關名不為single-argument、不含控制字元(C0、DEL、C1)
 */
function isValidArg(a) {
    if (typeof a !== 'string') {
        return false
    }
    if (a !== a.trim()) {
        return false
    }
    if (!a.startsWith('-')) {
        return false
    }
    if (a === '--') {
        return false
    }
    if (reCtrl.test(a)) {
        return false
    }
    if (switchName(a) === 'single-argument') {
        return false
    }
    return true
}


/**
 * 依序去重(保留首見)
 */
function dedupe(arr) {
    let r = []
    let s = new Set()
    for (let v of arr) {
        if (!s.has(v)) {
            s.add(v)
            r.push(v)
        }
    }
    return r
}


/**
 * 排序後去重(依完整字串, 決定論; 原則2)
 */
function sortUnique(arr) {
    return dedupe([...arr].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)))
}


/**
 * 依呼叫時之環境變數取得Playwright預設之enable項目(Playwright於每次啟動時讀取)
 */
function getDefaultEnableFeatures(env = process.env, tb = pwDefaults) {
    return env[tb.enableLegacyEnv] ? [] : [...tb.enableFeatures]
}


/**
 * 正規化路徑以供比對(絕對路徑; Windows不分大小寫)
 */
function normPath(p) {
    let r = path.resolve(String(p))
    return process.platform === 'win32' ? r.toLowerCase() : r
}


/**
 * 判斷啟動之瀏覽器種類: 'headless-shell'、'chromium'、通道名或'executable'(自訂執行檔)
 * executablePath只在等於Playwright受管之headless shell執行檔時視為headless shell(檔名相同之他檔不算)
 */
function browserKindOf(o) {
    if (o.executablePath) {
        let shell = getManagedShellPath()
        if (shell && normPath(o.executablePath) === normPath(shell)) {
            return 'headless-shell'
        }
        return 'executable'
    }
    if (o.channel) {
        return o.channel
    }
    return o.headless === false ? 'chromium' : 'headless-shell'
}


/**
 * 解析啟動入口之opt(快照, V11), 回傳狀態物件; 永不拋錯
 *
 * @param {*} opt 輸入opt
 * @param {String} fn 輸入函數名(提示用)
 * @returns {Object} 回傳狀態物件
 */
function parseLaunchOpt(opt, fn) {
    let st = parseCommon(opt, fn)

    //headless, B1, 預設true
    st.headless = optB1(st, 'headless', true)

    //channel, S3, 預設未給
    st.channel = optS3(st, 'channel', pwDefaults.channels, undefined)

    //executablePath, S1, 預設未給
    st.executablePath = optS1(st, 'executablePath')

    //autoInstall, installDeps, B1, 預設false
    st.autoInstall = optB1(st, 'autoInstall', false)
    st.installDeps = optB1(st, 'installDeps', false)

    //args, A3(元素規則於合併時判定), 預設[]
    let ea = getKey(st, 'args')
    st.argsRaw = []
    if (ea.given) {
        let r = ea.ok ? readArray(ea.v) : null
        if (r === null) {
            warnInvalid(st, fn, 'args', 'an array of valid switch strings', '[]')
        }
        else {
            st.argsRaw = r
        }
    }

    //ignoreDefaultArgs, A3(元素S1), true不收, 預設[]
    let ei = getKey(st, 'ignoreDefaultArgs')
    st.ignoreRaw = []
    if (ei.given) {
        let r = ei.ok ? readArray(ei.v) : null
        if (r === null || !r.every(isS1)) {
            warnInvalid(st, fn, 'ignoreDefaultArgs', 'an array of non-empty strings', '[]')
        }
        else {
            st.ignoreRaw = r
        }
    }

    //ignoreAllDefaultArgs, 一律刪除
    if (getKey(st, 'ignoreAllDefaultArgs').given) {
        warn(st, fn, 'ignoreAllDefaultArgs', 'opt.ignoreAllDefaultArgs is not supported and was removed')
    }

    //rest, 其餘鍵原樣轉傳; Playwright內部之__testHook*鍵刪除(其__testHookSeleniumRemoteURL會改走不經ignoreDefaultArgs之Selenium路徑, F15)
    st.rest = {}
    for (let k of Object.keys(st.snap.keys)) {
        if (DECL_KEYS.indexOf(k) >= 0) {
            continue
        }
        //提示為固定詞彙, 不含呼叫端之鍵名(K9)
        if (k.startsWith('__testHook')) {
            warn(st, fn, '__testHook', 'opt keys starting with __testHook are not supported and were removed')
            continue
        }
        let e = st.snap.keys[k]
        if (!e.ok) {
            warn(st, fn, '(unreadable)', 'an opt key that could not be read was removed')
            continue
        }
        st.rest[k] = e.v
    }

    return st
}


/**
 * 合併(設計§3.1之唯一實作): 輸出之命令列恰一個--disable-features(內附表預設＋守門功能＋呼叫端自給), 置於呼叫端args之末
 *
 * @param {Object} st 輸入parseLaunchOpt之狀態物件
 * @param {Object} [env=process.env] 輸入環境變數物件(決定預設enable)
 * @param {Object} [tb=pwDefaults] 輸入內附表(內部; 測試以假想之未來表驗證第7步之相等處理)
 * @returns {Object} 回傳{ out, info }; out為交給Playwright之新物件, info為事件用之統計(不含值)
 */
function mergeParsed(st, env = process.env, tb = pwDefaults) {
    let fn = st.fn

    //第2、3步: args之有效性與功能開關之辨識(任一元素無效即整鍵[]、守門照加)
    let other = []
    let dis = []
    let en = []
    let enGiven = false //呼叫端是否給了--enable-features(含無值)
    let argsOk = true
    for (let a of st.argsRaw) {
        if (!isValidArg(a)) {
            argsOk = false
            break
        }
        let n = switchName(a)
        if (n === SW_DISABLE || n === SW_ENABLE) {
            let items = splitItems(a)
            if (items === null) {
                argsOk = false
                break
            }
            if (n === SW_DISABLE) {
                dis.push(...items)
            }
            else {
                enGiven = true
                en.push(...items)
            }
        }
        else {
            other.push(a)
        }
    }
    if (!argsOk) {
        other = []
        dis = []
        en = []
        enGiven = false
        warnInvalid(st, fn, 'args', 'an array of valid switch strings', '[]')
    }

    //預設串
    let defDisStr = '--disable-features=' + tb.disableFeatures.join(',')
    let defEnList = getDefaultEnableFeatures(env, tb)
    let defEnStr = defEnList.length > 0 ? '--enable-features=' + defEnList.join(',') : ''

    //第4步: 呼叫端意圖(ignore含與預設串完全相同之項表示不要Playwright之預設清單); 其餘功能開關樣式之ignore項剔除(F7)
    let dropDefDis = st.ignoreRaw.indexOf(defDisStr) >= 0
    let dropDefEn = defEnStr !== '' && st.ignoreRaw.indexOf(defEnStr) >= 0
    let ignoreKept = []
    for (let s of st.ignoreRaw) {
        if (isFeatureSwitch(s)) {
            if (s !== defDisStr && s !== defEnStr) {
                warn(st, fn, 'ignoreDefaultArgs', 'feature switches in opt.ignoreDefaultArgs were removed')
            }
            continue
        }
        ignoreKept.push(s)
    }

    //第5步: disable＝〔內附表預設〕＋守門＋呼叫端項(排序、去重)
    let disList = dedupe([
        ...(dropDefDis ? [] : tb.disableFeatures),
        ...tb.guardFeatures,
        ...sortUnique(dis),
    ])

    //第6步: enable(呼叫端有給enable開關〔含無值〕、要去掉預設enable、或呼叫端disable與預設enable同名時才處理), 剔除守門功能與呼叫端disable之同名功能(原則3)
    let enList = null
    let disNames = new Set(dis.map(featureName))
    let defEnConflict = defEnList.some((it) => disNames.has(featureName(it)))
    if (enGiven || dropDefEn || defEnConflict) {
        let guardNames = new Set(tb.guardFeatures)
        let cand = dedupe([...(dropDefEn ? [] : defEnList), ...sortUnique(en)])
        enList = []
        let defDisNames = new Set(tb.disableFeatures.map(featureName))
        for (let it of cand) {
            let n = featureName(it)
            if (guardNames.has(n)) {
                warn(st, fn, 'args', 'enable-features items for guarded features were removed')
                continue
            }
            if (disNames.has(n)) {
                warn(st, fn, 'args', 'enable-features items also given in disable-features were removed')
                continue
            }
            if (defDisNames.has(n) && !dropDefDis) {
                //與Playwright預設disable同名: Chromium以停用為準, 啟用無效(不改行為, 只提示)
                warn(st, fn, 'args', 'enable-features items also in the default disable-features have no effect')
            }
            enList.push(it)
        }
    }

    //第7步: 合併串等於預設串者不加ignore、不另附
    let disStr = '--disable-features=' + disList.join(',')
    let addDis = disStr !== defDisStr
    let addEn = false
    let ignoreEn = false
    let enStr = ''
    if (enList !== null) {
        enStr = enList.length > 0 ? '--enable-features=' + enList.join(',') : ''
        if (enStr !== defEnStr) {
            addEn = enStr !== ''
            ignoreEn = defEnStr !== ''
        }
    }

    //第8步: args＝呼叫端其餘args(原序)＋〔enable〕＋disable(恆為最後一個元素)
    let args = [...other]
    if (addEn) {
        args.push(enStr)
    }
    if (addDis) {
        args.push(disStr)
    }

    //第9步: ignoreDefaultArgs＝呼叫端之陣列(剔除功能開關樣式之項)＋預設disable串〔＋預設enable串〕
    let ignoreDefaultArgs = dedupe([
        ...ignoreKept,
        ...(addDis ? [defDisStr] : []),
        ...(ignoreEn ? [defEnStr] : []),
    ])

    //第10步: 其餘鍵原樣轉傳; ignoreAllDefaultArgs與自用鍵不轉傳
    //channel、executablePath一律為自有鍵(未給時值為undefined): Playwright用戶端以{ ...全域預設啟動選項, ...options }合併, 須以本套件檢查過之值蓋過其全域預設
    let out = { ...st.rest }
    out.headless = st.headless
    out.channel = st.channel
    out.executablePath = st.executablePath
    out.args = args
    out.ignoreDefaultArgs = ignoreDefaultArgs

    let info = {
        nArgs: args.length,
        nDisable: disList.length,
        nEnable: enList === null ? -1 : enList.length,
        kind: browserKindOf(out),
    }
    return { out, info }
}


/**
 * 合併失敗(內部缺陷)時之保底輸出: 只含守門, 不含呼叫端之任何輸入
 */
function fallbackOptions() {
    let defDisStr = '--disable-features=' + pwDefaults.disableFeatures.join(',')
    let disStr = '--disable-features=' + [...pwDefaults.disableFeatures, ...pwDefaults.guardFeatures].join(',')
    return { headless: true, channel: undefined, executablePath: undefined, args: [disStr], ignoreDefaultArgs: [defDisStr] }
}


/**
 * 取得合併後之Chromium啟動選項(新物件; 供檢視與診斷); 永不拋錯
 *
 * 啟動請一律用launchChromium、launchChromiumPersistent: 環境檢查(E_ENV)、版本檢查(E_PW_VERSION)與登入守門只在兩個啟動入口執行,
 * 自行以本函數之結果呼叫playwright-core不在本套件之保證內
 *
 * 合併規則: 命令列恰一個--disable-features(Playwright預設＋AutofillAiWalletPrivatePasses＋呼叫端自給, 置於呼叫端args之末),
 * 並以ignoreDefaultArgs去掉Playwright預設之一串; 呼叫端之--disable-features、--enable-features一切變體(大小寫、單一連字號、無值)皆被吸收;
 * 呼叫端以--enable-features啟用守門功能或同時停用之功能者剔除(原則3; 呼叫端停用Playwright預設enable之功能時預設enable亦剔除);
 * args任一元素無效(非字串、頭尾空白〔含NEL〕、非-開頭、--、single-argument、控制字元〔C0、DEL、C1〕、功能項非ASCII語法、元素數逾10000)即整個args視為[](守門照加, 呼叫端其餘參數一併捨棄)
 * 輸出恆含channel、executablePath鍵(未給時為undefined, 以蓋過Playwright之全域預設啟動選項)
 *
 * 依呼叫時之環境變數PLAYWRIGHT_LEGACY_SCREENSHOT決定Playwright預設之enable, 故非純函數
 *
 * @param {Object} [opt={}] 輸入設定物件(一般物件; 其他型別視為未給), 為chromium.launch之選項加上本套件自用鍵
 * @param {Array} [opt.args=[]] 輸入瀏覽器參數陣列(選項陣列, 元素為以-開頭之開關字串), 無效時視為[]
 * @param {Array} [opt.ignoreDefaultArgs=[]] 輸入要去掉之Playwright預設參數陣列(選項陣列, 元素為非空字串; true不收), 無效時視為[]
 * @param {Boolean} [opt.headless=true] 輸入是否無頭(布林), 無效時用預設true
 * @param {String} [opt.channel] 輸入通道(列舉字串: 'chromium'、'chrome-for-testing'、'chrome'、'chrome-beta'、'chrome-dev'、'chrome-canary'、'msedge'、'msedge-beta'、'msedge-dev'、'msedge-canary'), 無效時視為未給
 * @param {String} [opt.executablePath] 輸入執行檔路徑(非空字串), 無效時視為未給
 * @param {Boolean} [opt.debug=false] 輸入是否提示非預期之輸入(布林)
 * @param {Function} [opt.funLog] 輸入提示出口函數(label, safe, detail), 未給時提示走console.warn
 * @returns {Object} 回傳合併後之新物件(不含autoInstall、installDeps、debug、funLog、onTrace、ignoreAllDefaultArgs與__testHook*鍵)
 * @example
 *
 * import wpw from 'w-playwright'
 *
 * let o = wpw.getChromiumLaunchOptions({ args: ['--disable-features=Translate', '--lang=en-US'] })
 * console.log(o.args)
 * // => ['--lang=en-US', '--disable-features=AvoidUnnecessaryBeforeUnloadCheckSync,...,AutofillAiWalletPrivatePasses']
 *
 */
function getChromiumLaunchOptions(opt) {
    try {
        let st = parseLaunchOpt(opt, 'getChromiumLaunchOptions')
        return mergeParsed(st).out
    }
    catch (err) {
        return fallbackOptions()
    }
}


export default getChromiumLaunchOptions
export {
    SELF_KEYS,
    switchName,
    isFeatureSwitch,
    featureName,
    splitItems,
    isValidArg,
    getDefaultEnableFeatures,
    browserKindOf,
    parseLaunchOpt,
    mergeParsed,
    fallbackOptions
}
