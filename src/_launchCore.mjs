import pwDefaults from './pwDefaults.mjs'
import {
    chromium,
    pwState,
    getEnvLikePw,
    isInspectorValue,
    pwdebugAtLoad,
    getPwDebugMode,
    isTableMatch
} from './_pw.mjs'
import { callTrace, callFunLog, makeErr, isOwnErr, isO1 } from './_check.mjs'
import { parseLaunchOpt, mergeParsed, browserKindOf } from './getChromiumLaunchOptions.mjs'
import { runInstall } from './_install.mjs'
import { checkLogonGuard, isLogonGuardOn } from './_logonGuard.mjs'


//_launchCore, 兩個啟動入口之共同流程(內部; 原則4兩入口同一順序):
//①快照opt → ②環境檢查(E_ENV) → ③版本檢查(E_PW_VERSION) → ④登入守門(E_LOGON_GUARD) → ⑤合併 → ⑥呼叫BrowserType(或測試替身) → ⑦缺檔時依autoInstall安裝一次再啟動一次
//⑥之前另做最後檢查(同步): 環境再檢、預設enable之環境變數變動即重新合併; 真BrowserType之每次呼叫(含安裝後重試、替身之next())皆先重讀登入守門


//overrides, setBrowserTypeForTest設定之替身堆疊(空表用playwright-core之chromium; 生效者為堆疊頂)
let overrides = []

//reMissing, 受管瀏覽器缺執行檔(playwright-core之executablePathOrDie)
let reMissing = /Executable doesn't exist at/

//reDeps, Linux缺系統相依
let reDeps = /Host system is missing dependencies|Missing system dependencies/


/**
 * 取得、加入、移除替身(內部, setBrowserTypeForTest用); 替身項為{ launch, launchPersistentContext, self }
 */
function getOverride() {
    return overrides.length > 0 ? overrides[overrides.length - 1] : null
}
function pushOverride(entry) {
    overrides.push(entry)
}
function removeOverride(entry) {
    let i = overrides.lastIndexOf(entry)
    if (i >= 0) {
        overrides.splice(i, 1)
    }
}


/**
 * 環境檢查: 會使守門失效之環境回其名, 否則回''
 * PWDEBUG(inspector模式另起未合併之Inspector瀏覽器並強制有頭): 本模組載入時之值、呼叫時之值、Playwright實際採用之debugMode任一為inspector即擋
 * SELENIUM_REMOTE_URL(改走不經ignoreDefaultArgs之Selenium路徑): 呼叫時有值即擋
 */
function checkEnv(env = process.env) {
    if (isInspectorValue(pwdebugAtLoad) || isInspectorValue(getEnvLikePw('PWDEBUG', env)) || getPwDebugMode() === 'inspector') {
        return 'PWDEBUG'
    }
    let s = env.SELENIUM_REMOTE_URL
    if (s !== undefined && s !== null && String(s) !== '') {
        return 'SELENIUM_REMOTE_URL'
    }
    return ''
}


/**
 * 是否為Playwright受管之瀏覽器(可自動安裝): 未給executablePath, 且通道未給或為chromium、chrome-for-testing
 */
function isManaged(o) {
    return !o.executablePath && (!o.channel || o.channel === 'chromium' || o.channel === 'chrome-for-testing')
}


/**
 * 受管瀏覽器之安裝種類: 無頭且未給通道為headless shell, 其餘為完整chromium
 */
function managedKind(o) {
    return (o.headless !== false && !o.channel) ? 'headless-shell' : 'chromium'
}


/**
 * 錯誤訊息(取不到回'')
 */
function errMsg(err) {
    try {
        return String(err && err.message)
    }
    catch (e) {
        return ''
    }
}


/**
 * 將Playwright之啟動錯誤轉為本套件之固定詞彙錯誤; 原錯誤只交funLog
 */
function toLaunchErr(err, st) {
    let name = ''
    try {
        name = String(err && err.name)
    }
    catch (e) {}
    let code = name === 'TimeoutError' ? 'E_LAUNCH_TIMEOUT' : 'E_LAUNCH'
    callFunLog(st.funLog, 'launch-error', Object.freeze({ fn: st.fn, code }), err)
    return code === 'E_LAUNCH_TIMEOUT' ? makeErr(code, 'browser launch timed out') : makeErr(code, 'browser launch failed')
}


/**
 * 啟動並於缺檔時依autoInstall安裝一次再啟動一次; Linux缺系統相依且installDeps時安裝相依一次再啟動一次
 *
 * @param {Object} o 輸入合併後之選項
 * @param {Object} st 輸入狀態物件(autoInstall、installDeps、onTrace、funLog、fn)
 * @param {Function} launch 輸入啟動函數, 傳入o, 回傳Promise
 * @param {Object} [deps] 內部: 測試注入{ runInstall, platform }; noInstall為true時不安裝(替身層: 缺檔一律E_BROWSER_MISSING, 測試接縫不產生真下載)
 * @returns {Promise} 回傳Promise, resolve回傳launch之結果, reject回傳帶code之Error
 */
async function launchWithInstall(o, st, launch, deps = {}) {
    let ri = deps.runInstall || runInstall
    let platform = deps.platform || process.platform
    let noInstall = deps.noInstall === true
    let installedBrowser = false
    let installedDeps = false
    while (true) {
        try {
            return await launch(o)
        }
        catch (err) {
            //本套件已正規化之錯誤(如next(o)內層之E_ENV、E_LOGON_GUARD)原樣往外, 不再包裝
            if (isOwnErr(err)) {
                throw err
            }
            let msg = errMsg(err)
            if (isManaged(o) && reMissing.test(msg)) {
                if (!st.autoInstall || noInstall) {
                    callFunLog(st.funLog, 'launch-error', Object.freeze({ fn: st.fn, code: 'E_BROWSER_MISSING' }), err)
                    let k = managedKind(o)
                    throw makeErr('E_BROWSER_MISSING', `managed browser (${k}) is not installed: call ensureChromium({ kind: '${k}' }) or set opt.autoInstall to true`)
                }
                if (!installedBrowser) {
                    installedBrowser = true
                    await ri(managedKind(o), st, 0)
                    continue
                }
            }
            if (!noInstall && isManaged(o) && platform === 'linux' && st.installDeps && !installedDeps && reDeps.test(msg)) {
                installedDeps = true
                await ri('deps', st, 0)
                continue
            }
            throw toLaunchErr(err, st)
        }
    }
}


/**
 * 前置檢查(②~④)並合併(⑤), 回傳{ st, merged, info }; 拒絕時拋帶code之Error
 */
async function prepare(fn, opt) {

    //①快照
    let st = parseLaunchOpt(opt, fn)

    //②環境
    let envBad = checkEnv()
    if (envBad) {
        if (st.onTrace) {
            callTrace(st.onTrace, { type: 'env-reject', fn, env: envBad })
        }
        throw makeErr('E_ENV', `unsupported environment: ${envBad}`)
    }

    //③版本
    if (!isTableMatch()) {
        if (st.onTrace) {
            callTrace(st.onTrace, { type: 'version-reject', fn, coreVersion: pwState.coreVersion, tableVersion: pwDefaults.version })
        }
        throw makeErr('E_PW_VERSION', `playwright-core version ${pwState.coreVersion} does not match the bundled defaults table ${pwDefaults.version}`)
    }

    //④登入守門(種類只依解析後之headless、channel、executablePath)
    let kind = browserKindOf({ headless: st.headless, channel: st.channel, executablePath: st.executablePath })
    try {
        await checkLogonGuard(kind)
    }
    catch (err) {
        if (st.onTrace) {
            callTrace(st.onTrace, { type: 'logon-reject', fn, kind })
        }
        throw err
    }

    //⑤合併(內部缺陷時以固定詞彙E_LAUNCH失敗, 原錯誤只交funLog)
    let legacyAtMerge = legacyOf()
    let merged = null
    let info = null
    try {
        let r = mergeParsed(st)
        merged = r.out
        info = r.info
    }
    catch (err) {
        throw toLaunchErr(err, st)
    }

    if (st.onTrace) {
        callTrace(st.onTrace, { type: 'launch-options', fn, nArgs: info.nArgs, nDisable: info.nDisable, nEnable: info.nEnable, tableMatch: true, kind: info.kind })
    }

    return { st, merged, info, kind, legacyAtMerge }
}


/**
 * 呼叫時之PLAYWRIGHT_LEGACY_SCREENSHOT真假(Playwright於每次啟動時讀取)
 */
function legacyOf(env = process.env) {
    return !!env[pwDefaults.enableLegacyEnv]
}


/**
 * 實際呼叫BrowserType(真或替身)前之最後檢查, 同步執行, 其後至呼叫之間不再執行任何呼叫端回調(onTrace等):
 * 環境再檢一次(合併後之回調或其他程式改了SELENIUM_REMOTE_URL、PWDEBUG即E_ENV); 預設enable之環境變數若於合併後改變, 依現值重新合併
 */
function finalGate(st, o, legacyAtMerge) {
    let envBad = checkEnv()
    if (envBad) {
        throw makeErr('E_ENV', `unsupported environment: ${envBad}`)
    }
    if (legacyOf() !== legacyAtMerge) {
        return mergeParsed(st).out
    }
    return o
}


//logonChain, 登入守門開啟時, 非headless shell之真啟動於行程內依序進行(讀錯誤次數至瀏覽器啟動完成為一段), 使後一個啟動讀到前一個造成之增量
let logonChain = Promise.resolve()

function withLogonLock(kind, fn) {
    if (!isLogonGuardOn() || kind === 'headless-shell') {
        return fn()
    }
    let run = logonChain.then(fn, fn)
    logonChain = run.then(() => {}, () => {})
    return run
}


/**
 * 呼叫真BrowserType: 每次(含自動安裝後之重試、替身之每次next())皆先重讀登入守門, 再做最後檢查, 然後立即呼叫
 */
function callReal(st, kind, legacyAtMerge, invoke) {
    return (o) => withLogonLock(kind, async () => {
        await checkLogonGuard(kind)
        let o2 = finalGate(st, o, legacyAtMerge)
        return invoke(o2)
    })
}


/**
 * 深複製選項之一般物件與陣列(替身與真BrowserType各拿各的, 替身改寫其收到之物件〔含巢狀〕不影響next()); 函數與其他物件以參照保留
 */
function cloneOpt(v, depth = 0) {
    try {
        if (depth > 20) {
            return v
        }
        if (Array.isArray(v)) {
            return v.map((x) => cloneOpt(x, depth + 1))
        }
        if (isO1(v)) {
            let r = {}
            for (let k of Object.keys(v)) {
                r[k] = cloneOpt(v[k], depth + 1)
            }
            return r
        }
        return v
    }
    catch (err) {
        return v
    }
}


/**
 * launchChromium之本體
 */
async function runLaunch(opt, fn = 'launchChromium', useOverride = true) {
    let { st, merged, kind, legacyAtMerge } = await prepare(fn, opt)
    let real = callReal(st, kind, legacyAtMerge, (o) => chromium.launch(o))
    let fake = useOverride ? getOverride() : null
    if (fake) {
        //next: 無參數時以已合併之選項(複本)呼叫真BrowserType; 有參數時對其重走完整流程(檢查與合併)後呼叫真BrowserType
        let base = cloneOpt(merged)
        let next = (o2) => {
            if (o2 === undefined) {
                return launchWithInstall(cloneOpt(base), st, real)
            }
            return runLaunch(o2, fn, false)
        }
        //替身層不自動安裝(測試接縫不產生真下載); 替身以原fake為this呼叫
        return launchWithInstall(cloneOpt(merged), st, (o) => fake.launch.call(fake.self, finalGate(st, o, legacyAtMerge), next), { noInstall: true })
    }
    return launchWithInstall(merged, st, real)
}


/**
 * launchChromiumPersistent之本體
 */
async function runLaunchPersistent(userDataDir, opt, fn = 'launchChromiumPersistent', useOverride = true) {
    let { st, merged, kind, legacyAtMerge } = await prepare(fn, opt)
    let real = callReal(st, kind, legacyAtMerge, (o) => chromium.launchPersistentContext(userDataDir, o))
    let fake = useOverride ? getOverride() : null
    if (fake) {
        let base = cloneOpt(merged)
        let next = (o2) => {
            if (o2 === undefined) {
                return launchWithInstall(cloneOpt(base), st, real)
            }
            return runLaunchPersistent(userDataDir, o2, fn, false)
        }
        return launchWithInstall(cloneOpt(merged), st, (o) => {
            if (typeof fake.launchPersistentContext !== 'function') {
                throw new Error('fake BrowserType has no launchPersistentContext')
            }
            return fake.launchPersistentContext.call(fake.self, userDataDir, finalGate(st, o, legacyAtMerge), next)
        }, { noInstall: true })
    }
    return launchWithInstall(merged, st, real)
}


export {
    getOverride,
    pushOverride,
    removeOverride,
    checkEnv,
    isManaged,
    managedKind,
    toLaunchErr,
    launchWithInstall,
    prepare,
    finalGate,
    cloneOpt,
    withLogonLock,
    callReal,
    runLaunch,
    runLaunchPersistent
}
