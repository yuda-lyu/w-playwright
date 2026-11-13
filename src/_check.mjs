//_check, 本套件之輸入檢測最小實作(不依wsemi; dspec輸入參數之檢測機制§7之例外), 種類之語意與處置依該規格(K1~K9、V4~V11、V19、V20)
//另含: opt.debug之提示出口、onTrace與funLog之呼叫(同步、拋錯與rejection皆忽略)、帶code之固定詞彙錯誤


//reNumStr, 數字字串(dspec §3.1): 去頭尾空白後之十進位寫法, 線性之正規式
let reNumStr = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/

//TIMER_MAX, 計時毫秒之上限(dspec §3.2 N2範圍子型)
let TIMER_MAX = 2147483647

//warned, 同函數同鍵同原因每行程只提示一次
let warned = new Set()


/**
 * 判斷一般物件(O1): 原型為Object.prototype或null; 存取拋錯(已撤銷之Proxy)視為否
 */
function isO1(v) {
    if (v === null || typeof v !== 'object') {
        return false
    }
    try {
        if (Array.isArray(v)) {
            return false
        }
        let p = Object.getPrototypeOf(v)
        return p === Object.prototype || p === null
    }
    catch (err) {
        return false
    }
}


/**
 * 判斷布林(B1): 只收true、false
 */
function isB1(v) {
    return v === true || v === false
}


/**
 * 判斷非空字串(S1): 長度大於0之原始字串
 */
function isS1(v) {
    return typeof v === 'string' && v.length > 0
}


/**
 * 判斷字串(S2): 原始字串(可空)
 */
function isS2(v) {
    return typeof v === 'string'
}


/**
 * 判斷列舉字串(S3)
 */
function isS3(v, list) {
    return typeof v === 'string' && list.indexOf(v) >= 0
}


/**
 * 判斷函數(F1)
 */
function isF1(v) {
    return typeof v === 'function'
}


/**
 * 解析計時毫秒(N2範圍子型'timer'): 有限number或數字字串(轉值後使用, K4), 範圍0~2147483647; 回{ok, v}
 */
function parseTimer(v) {
    let n = null
    if (typeof v === 'number') {
        n = v
    }
    else if (typeof v === 'string') {
        let t = v.trim()
        if (reNumStr.test(t)) {
            n = Number(t)
        }
    }
    if (n === null || !Number.isFinite(n) || n < 0 || n > TIMER_MAX) {
        return { ok: false, v: null }
    }
    return { ok: true, v: n }
}


//ARRAY_MAX, 陣列鍵(args、ignoreDefaultArgs)之元素數上限(有界; 超過或長度非安全整數即整鍵無效)
let ARRAY_MAX = 10000


/**
 * 讀取陣列之元素(各讀一次), 讀取拋錯、長度非0~ARRAY_MAX之整數回null
 */
function readArray(v) {
    try {
        if (!Array.isArray(v)) {
            return null
        }
        let n = v.length
        if (!Number.isSafeInteger(n) || n < 0 || n > ARRAY_MAX) {
            return null
        }
        let r = []
        for (let i = 0; i < n; i++) {
            r.push(v[i])
        }
        return r
    }
    catch (err) {
        return null
    }
}


/**
 * 快照opt(V11): 每個自有可列舉字串鍵只讀一次, 讀取拋錯之鍵記為無效
 *
 * @param {*} opt 輸入opt
 * @returns {Object} 回傳{ given, ok, keys }; given為是否有給(undefined、null視為未給), ok為opt本身是否為一般物件, keys為各鍵之{ ok, v }
 */
function snapshotOpt(opt) {
    if (opt === undefined || opt === null) {
        return { given: false, ok: true, keys: {} }
    }
    if (!isO1(opt)) {
        return { given: true, ok: false, keys: {} }
    }
    let names = null
    try {
        names = Reflect.ownKeys(opt)
    }
    catch (err) {
        return { given: true, ok: false, keys: {} }
    }
    let keys = {}
    for (let k of names) {
        if (typeof k !== 'string') {
            continue
        }
        let enumerable = false
        try {
            let d = Object.getOwnPropertyDescriptor(opt, k)
            enumerable = !!(d && d.enumerable)
        }
        catch (err) {
            keys[k] = { ok: false, v: undefined }
            continue
        }
        if (!enumerable) {
            continue
        }
        try {
            keys[k] = { ok: true, v: opt[k] }
        }
        catch (err) {
            keys[k] = { ok: false, v: undefined }
        }
    }
    return { given: true, ok: true, keys }
}


/**
 * 呼叫觀察回調(dspec計時器§2): 同步、不帶接收者、拋錯與rejection皆忽略、回傳值不用; 事件物件凍結
 */
function callTrace(onTrace, ev) {
    if (typeof onTrace !== 'function') {
        return
    }
    try {
        let r = onTrace(Object.freeze(ev)) //區域變數之一般呼叫, 不帶接收者
        if (r && typeof r.then === 'function') {
            r.then(null, () => {})
        }
    }
    catch (err) {}
}


/**
 * 呼叫呼叫端自給之funLog(label, safe, detail): 拋錯與rejection皆忽略
 */
function callFunLog(funLog, label, safe, detail) {
    if (typeof funLog !== 'function') {
        return
    }
    try {
        let r = funLog(label, safe, detail)
        if (r && typeof r.then === 'function') {
            r.then(null, () => {})
        }
    }
    catch (err) {}
}


/**
 * 提示(opt.debug為true時): 固定詞彙、不含傳入之值(K9、V20); 有funLog交funLog('warn', msg), 否則console.warn; 同函數同鍵同原因每行程一次
 */
function warn(st, fn, key, msg) {
    if (!st || st.debug !== true) {
        return
    }
    let id = `${fn}|${key}|${msg}`
    if (warned.has(id)) {
        return
    }
    warned.add(id)
    let s = `[w-playwright ${fn}] ${msg}`
    if (typeof st.funLog === 'function') {
        callFunLog(st.funLog, 'warn', s, undefined)
        return
    }
    try {
        console.warn(s)
    }
    catch (err) {}
}


/**
 * 提示無效之鍵改用預設(V19格式: invalid opt.<鍵>: must be <種類描述>, using default <預設>)
 */
function warnInvalid(st, fn, key, desc, defDesc) {
    warn(st, fn, key, `invalid ${key === '' ? 'opt' : 'opt.' + key}: must be ${desc}, using default ${defDesc}`)
}


/**
 * 解析opt之共通鍵(debug、funLog、onTrace), 回傳狀態物件{ debug, funLog, onTrace, snap }
 *
 * @param {*} opt 輸入opt
 * @param {String} fn 輸入函數名(提示用)
 * @returns {Object} 回傳狀態物件
 */
function parseCommon(opt, fn) {
    let snap = snapshotOpt(opt)
    let st = { debug: false, funLog: null, onTrace: null, snap, fn }
    let ks = snap.keys

    //debug, B1, 非布林視為false(無法提示)
    if (ks.debug && ks.debug.ok && isB1(ks.debug.v)) {
        st.debug = ks.debug.v
    }

    //funLog, F1
    if (ks.funLog) {
        if (ks.funLog.ok && isF1(ks.funLog.v)) {
            st.funLog = ks.funLog.v
        }
        else if (ks.funLog.ok && (ks.funLog.v === undefined || ks.funLog.v === null)) {
            //未給
        }
        else {
            warnInvalid(st, fn, 'funLog', 'a function', 'none')
        }
    }

    //onTrace, F1
    if (ks.onTrace) {
        if (ks.onTrace.ok && isF1(ks.onTrace.v)) {
            st.onTrace = ks.onTrace.v
        }
        else if (ks.onTrace.ok && (ks.onTrace.v === undefined || ks.onTrace.v === null)) {
            //未給
        }
        else {
            warnInvalid(st, fn, 'onTrace', 'a function', 'none')
        }
    }

    //debug無效之提示(只在debug為true時可見, 故debug本身無效時無從提示)
    if (ks.debug && !(ks.debug.ok && (isB1(ks.debug.v) || ks.debug.v === undefined || ks.debug.v === null))) {
        warnInvalid(st, fn, 'debug', 'a boolean', 'false')
    }

    //opt本身無效
    if (snap.given && !snap.ok) {
        warnInvalid(st, fn, '', 'a plain object', '{}')
    }

    return st
}


/**
 * 取鍵值: 未給(undefined、null)回{ given:false }; 讀取拋錯回{ given:true, ok:false }; 否則{ given:true, ok:true, v }
 */
function getKey(st, key) {
    let e = st.snap.keys[key]
    if (!e) {
        return { given: false }
    }
    if (!e.ok) {
        return { given: true, ok: false }
    }
    if (e.v === undefined || e.v === null) {
        return { given: false }
    }
    return { given: true, ok: true, v: e.v }
}


/**
 * 解析B1之鍵: 無效改用預設並提示
 */
function optB1(st, key, def) {
    let e = getKey(st, key)
    if (!e.given) {
        return def
    }
    if (e.ok && isB1(e.v)) {
        return e.v
    }
    warnInvalid(st, st.fn, key, 'a boolean', String(def))
    return def
}


/**
 * 解析S1之鍵: 無效視為未給並提示, 回undefined表未給
 */
function optS1(st, key) {
    let e = getKey(st, key)
    if (!e.given) {
        return undefined
    }
    if (e.ok && isS1(e.v)) {
        return e.v
    }
    warnInvalid(st, st.fn, key, 'a non-empty string', 'none')
    return undefined
}


/**
 * 解析S3之鍵: 無效改用預設(def可為undefined表未給)並提示
 */
function optS3(st, key, list, def) {
    let e = getKey(st, key)
    if (!e.given) {
        return def
    }
    if (e.ok && isS3(e.v, list)) {
        return e.v
    }
    let ls = list.map((v) => `'${v}'`).join(', ')
    warnInvalid(st, st.fn, key, `one of ${ls}`, def === undefined ? 'none' : `'${def}'`)
    return def
}


/**
 * 解析N2範圍子型'timer'之鍵: 無效改用預設並提示
 */
function optTimer(st, key, def) {
    let e = getKey(st, key)
    if (!e.given) {
        return def
    }
    if (e.ok) {
        let r = parseTimer(e.v)
        if (r.ok) {
            return r.v
        }
    }
    warnInvalid(st, st.fn, key, 'a valid number from 0 to 2147483647', String(def))
    return def
}


/**
 * 產生帶code之固定詞彙錯誤(不附外部原錯誤, dspec診斷輸出與遮罩D1例外、D3)
 */
function makeErr(code, msg) {
    let e = new Error(msg)
    e.code = code
    ownErrs.add(e)
    return e
}

//ownErrs, 本套件產生之錯誤(已正規化; 外層不得再包裝)
let ownErrs = new WeakSet()


/**
 * 是否為本套件產生之錯誤
 */
function isOwnErr(e) {
    try {
        return e !== null && typeof e === 'object' && ownErrs.has(e)
    }
    catch (err) {
        return false
    }
}


/**
 * 測試用: 清除提示之去重紀錄(內部)
 */
function _resetWarned() {
    warned.clear()
}


export {
    reNumStr,
    TIMER_MAX,
    isO1,
    isB1,
    isS1,
    isS2,
    isS3,
    isF1,
    parseTimer,
    readArray,
    snapshotOpt,
    callTrace,
    callFunLog,
    warn,
    warnInvalid,
    parseCommon,
    getKey,
    optB1,
    optS1,
    optS3,
    optTimer,
    makeErr,
    isOwnErr,
    ARRAY_MAX,
    _resetWarned
}
