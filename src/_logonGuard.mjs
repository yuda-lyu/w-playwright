import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { fileURLToPath } from 'url'
import { makeErr } from './_check.mjs'


//_logonGuard, 執行期登入守門(主控裁示4, 2026-11-13): 環境變數W_PLAYWRIGHT_LOGON_GUARD開啟時, 每次啟動非headless shell前讀目前使用者之BadPasswordAttempts, ≥1、帳號已鎖或讀不到即拒絕(E_LOGON_GUARD)
//讀法: WinNT ADSI經cscript執行本套件之src/readBadPassword.wsf(不用PowerShell; 子行程windowsHide)
//本檔不依playwright-core, 測試工具test/tools/readBadPassword.mjs亦經本檔讀取


//ENV_NAME, 開關之環境變數名
let ENV_NAME = 'W_PLAYWRIGHT_LOGON_GUARD'

//logonState, 內部狀態(測試以read注入讀取器, 測後還原為null)
let logonState = {
    read: null,
}

//reUser, Windows帳號名不可含之字元(防止組入ADSI路徑時改變語意)
let reUserBad = /[\\/[\]:;|=,+*?<>"\x00-\x1f]/ // eslint-disable-line no-control-regex


/**
 * 守門是否開啟: 未設、空字串、'0'、'false'(精確值, 不去空白)為關, 其餘一律為開(遇歧義收嚴, 原則3)
 */
function isLogonGuardOn(env = process.env) {
    let v = env[ENV_NAME]
    if (v === undefined || v === null) {
        return false
    }
    v = String(v)
    if (v === '' || v === '0' || v === 'false') {
        return false
    }
    return true
}


/**
 * 目前行程之帳號是否為本機帳號(USERDOMAIN與COMPUTERNAME皆有且相同, 不分大小寫); 網域帳號或無法判定者回false
 * (以帳號名查WinNT://./<名>只讀得到本機帳號; 網域使用者若有同名本機帳號會讀到另一個帳號, 故不查)
 */
function isLocalAccount(env = process.env) {
    let d = env.USERDOMAIN
    let c = env.COMPUTERNAME
    if (typeof d !== 'string' || typeof c !== 'string' || d === '' || c === '') {
        return false
    }
    return d.toUpperCase() === c.toUpperCase()
}


/**
 * 取本套件之readBadPassword.wsf路徑(src內執行時在同資料夾; dist內執行時在../src), 找不到回''
 */
function getWsfPath() {
    let here = ''
    try {
        here = path.dirname(fileURLToPath(import.meta.url))
    }
    catch (err) {
        return ''
    }
    let cands = [
        path.join(here, 'readBadPassword.wsf'),
        path.join(here, '..', 'src', 'readBadPassword.wsf'),
    ]
    for (let c of cands) {
        try {
            if (fs.statSync(c).isFile()) {
                return c
            }
        }
        catch (err) {}
    }
    return ''
}


/**
 * 取cscript之路徑(SystemRoot下之System32), 無SystemRoot時回'cscript'
 */
function getCscriptPath(env = process.env) {
    let root = env.SystemRoot || env.SYSTEMROOT || ''
    return root ? path.join(root, 'System32', 'cscript.exe') : 'cscript'
}


/**
 * 解析readBadPassword.wsf之輸出, 回{ ok, bad, locked }
 */
function parseOutput(stdout) {
    let line = String(stdout || '').trim().split(/\r?\n/).pop() || ''
    let j = null
    try {
        j = JSON.parse(line)
    }
    catch (err) {
        return { ok: false, bad: -1, locked: null }
    }
    if (!j || typeof j !== 'object') {
        return { ok: false, bad: -1, locked: null }
    }
    let bad = j.bad
    let locked = j.locked
    let okBad = typeof bad === 'number' && Number.isSafeInteger(bad) && bad >= 0
    let okLocked = locked === true || locked === false
    if (!okBad || !okLocked) {
        return { ok: false, bad: -1, locked: null }
    }
    return { ok: true, bad, locked }
}


/**
 * 讀取Windows本機帳號之錯誤密碼次數與鎖定狀態(唯讀; WinNT ADSI經cscript; 子行程隱藏視窗), 永不拋錯
 *
 * 非Windows、帳號名不合法、找不到wsf、cscript失敗或逾時、輸出不可解析時回{ ok:false }
 *
 * @param {Object} [opt={}] 輸入設定物件
 * @param {String} [opt.username] 輸入帳號名(非空字串), 預設為目前行程之使用者(os.userInfo().username)
 * @param {Number} [opt.timeout=15000] 輸入逾時毫秒
 * @param {Object} [deps] 內部: 測試注入{ platform, execFile, wsf, cscript, env }
 * @returns {Promise} 回傳Promise, resolve回傳{ ok, bad, locked }
 */
async function readBadPasswordAttempts(opt = {}, deps = {}) {
    let platform = deps.platform || process.platform
    if (platform !== 'win32') {
        return { ok: false, bad: -1, locked: null }
    }
    let username = ''
    try {
        if (opt && typeof opt.username === 'string' && opt.username !== '') {
            //明給之帳號名: 呼叫端指定本機帳號
            username = opt.username
        }
        else {
            //目前行程之帳號: 須為本機帳號, 網域帳號或無法判定者視為讀不到
            if (!isLocalAccount(deps.env || process.env)) {
                return { ok: false, bad: -1, locked: null }
            }
            username = os.userInfo().username
        }
    }
    catch (err) {
        return { ok: false, bad: -1, locked: null }
    }
    if (typeof username !== 'string' || username === '' || reUserBad.test(username)) {
        return { ok: false, bad: -1, locked: null }
    }
    let wsf = deps.wsf !== undefined ? deps.wsf : getWsfPath()
    if (!wsf) {
        return { ok: false, bad: -1, locked: null }
    }
    let ef = deps.execFile || execFile
    let cscript = deps.cscript || getCscriptPath()
    let timeout = (opt && typeof opt.timeout === 'number' && opt.timeout > 0) ? opt.timeout : 15000
    return new Promise((resolve) => {
        try {
            ef(cscript, ['//nologo', wsf, username], { windowsHide: true, timeout, encoding: 'utf8' }, (err, stdout) => {
                if (err) {
                    resolve({ ok: false, bad: -1, locked: null })
                    return
                }
                resolve(parseOutput(stdout))
            })
        }
        catch (err) {
            resolve({ ok: false, bad: -1, locked: null })
        }
    })
}


/**
 * 登入守門: 開啟時, 種類非headless shell之啟動前讀錯誤密碼次數, ≥1、已鎖定或讀不到即reject E_LOGON_GUARD
 *
 * @param {String} kind 輸入瀏覽器種類(browserKindOf之結果)
 * @param {Object} [deps] 內部: 測試注入{ env, read }
 * @returns {Promise} 回傳Promise, resolve回傳{ checked }; 拒絕時reject帶code之Error
 */
async function checkLogonGuard(kind, deps = {}) {
    let env = deps.env || process.env
    if (!isLogonGuardOn(env)) {
        return { checked: false }
    }
    if (kind === 'headless-shell') {
        return { checked: false }
    }
    let read = deps.read || logonState.read || readBadPasswordAttempts
    let r = null
    try {
        r = await read()
    }
    catch (err) {
        r = null
    }
    if (!r || r.ok !== true) {
        throw makeErr('E_LOGON_GUARD', 'logon guard: bad password attempts unreadable, launch refused')
    }
    if (r.locked === true || r.bad !== 0) {
        throw makeErr('E_LOGON_GUARD', 'logon guard: bad password attempts not zero, launch refused')
    }
    return { checked: true }
}


export {
    ENV_NAME,
    logonState,
    isLogonGuardOn,
    isLocalAccount,
    getWsfPath,
    getCscriptPath,
    parseOutput,
    readBadPasswordAttempts,
    checkLogonGuard
}
