import path from 'path'
import { spawn } from 'child_process'
import { cliPath, registryDirectoryAtLoad } from './_pw.mjs'
import { callTrace, callFunLog, makeErr } from './_check.mjs'


//_install, 以本套件所依之playwright-core之CLI安裝受管瀏覽器(內部)
//子行程: process.execPath執行playwright-core/cli.js, windowsHide:true; PLAYWRIGHT_BROWSERS_PATH固定為本模組載入時Playwright之瀏覽器目錄(F22)
//--no-remove: 不移除本機其他Playwright版本所用之瀏覽器(Playwright之install預設會移除未被連結之瀏覽器)


/**
 * 各種類之CLI參數
 */
function getInstallArgs(kind) {
    if (kind === 'headless-shell') {
        return ['install', '--no-remove', '--only-shell', 'chromium']
    }
    if (kind === 'chromium') {
        return ['install', '--no-remove', '--no-shell', 'chromium']
    }
    if (kind === 'deps') {
        return ['install-deps', 'chromium']
    }
    return null
}


/**
 * 子行程之環境: 繼承行程環境, PLAYWRIGHT_BROWSERS_PATH固定為載入時之瀏覽器目錄
 */
function getInstallEnv(env = process.env, dir = registryDirectoryAtLoad) {
    let e = { ...env }
    if (dir) {
        e.PLAYWRIGHT_BROWSERS_PATH = dir
    }
    return e
}


//KILL_WAIT_MAX, 等待結束子行程樹之上限毫秒
let KILL_WAIT_MAX = 10000


/**
 * 結束子行程樹並等待其完成(Windows以taskkill /T /F並等其結束; 其餘以行程群組SIGKILL, 子行程以detached起而為群組之首); 永不reject
 */
function killTree(cp, platform, sp, kill) {
    return new Promise((resolve) => {
        let ended = false
        let end = () => {
            if (ended) {
                return
            }
            ended = true
            clearTimeout(t)
            resolve()
        }
        let t = setTimeout(end, KILL_WAIT_MAX)
        try {
            if (!cp || !cp.pid) {
                end()
                return
            }
            if (platform === 'win32') {
                let tk = process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'taskkill.exe') : 'taskkill'
                let k = sp(tk, ['/pid', String(cp.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
                if (k && typeof k.on === 'function') {
                    k.on('error', end)
                    k.on('close', end)
                }
                else {
                    end()
                }
            }
            else {
                try {
                    kill(-cp.pid, 'SIGKILL')
                }
                catch (err) {
                    try {
                        cp.kill('SIGKILL')
                    }
                    catch (err2) {}
                }
                end()
            }
        }
        catch (err) {
            end()
        }
    })
}


/**
 * 執行一次安裝子行程
 *
 * @param {String} kind 輸入種類('headless-shell'、'chromium'、'deps')
 * @param {Object} st 輸入狀態物件(取onTrace、funLog)
 * @param {Number} timeout 輸入逾時毫秒, 0表不限
 * @param {Object} [deps] 內部: 測試注入{ spawn, platform, execPath, cliPath, env, kill }
 * @returns {Promise} 回傳Promise, resolve回傳{ kind }, reject回傳E_INSTALL之Error(逾時者於子行程樹結束後才reject)
 */
function runInstall(kind, st, timeout = 0, deps = {}) {
    let sp = deps.spawn || spawn
    let platform = deps.platform || process.platform
    let kill = deps.kill || ((pid, sig) => process.kill(pid, sig))
    let execPath = deps.execPath || process.execPath
    let cli = deps.cliPath || cliPath
    let env = deps.env || getInstallEnv()
    let args = getInstallArgs(kind)

    return new Promise((resolve, reject) => {
        let done = false
        let timedOut = false
        let timer = null
        let finish = (err, exitCode) => {
            if (done) {
                return
            }
            done = true
            if (timer) {
                clearTimeout(timer)
            }
            if (err) {
                if (st.onTrace) {
                    callTrace(st.onTrace, { type: 'install-fail', kind, exitCode })
                }
                reject(err)
            }
            else {
                if (st.onTrace) {
                    callTrace(st.onTrace, { type: 'install-done', kind })
                }
                resolve({ kind })
            }
        }

        if (st.onTrace) {
            callTrace(st.onTrace, { type: 'install-start', kind })
        }

        let cp = null
        try {
            //非Windows以detached起, 使其為行程群組之首, 逾時可結束整個群組(install-deps等再起之子行程)
            cp = sp(execPath, [cli, ...args], { windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'], detached: platform !== 'win32' })
        }
        catch (err) {
            callFunLog(st.funLog, 'install-error', Object.freeze({ kind, exitCode: -1 }), err)
            finish(makeErr('E_INSTALL', 'browser installation failed to start'), -1)
            return
        }

        let onData = (d) => {
            if (st.funLog) {
                callFunLog(st.funLog, 'install-output', Object.freeze({ kind }), String(d))
            }
        }
        if (cp.stdout && typeof cp.stdout.on === 'function') {
            cp.stdout.on('data', onData)
        }
        if (cp.stderr && typeof cp.stderr.on === 'function') {
            cp.stderr.on('data', onData)
        }
        cp.on('error', (err) => {
            if (timedOut) {
                return
            }
            callFunLog(st.funLog, 'install-error', Object.freeze({ kind, exitCode: -1 }), err)
            finish(makeErr('E_INSTALL', 'browser installation failed to start'), -1)
        })
        cp.on('close', (code) => {
            if (timedOut) {
                return
            }
            if (code === 0) {
                finish(null)
            }
            else {
                let c = typeof code === 'number' ? code : -1
                finish(makeErr('E_INSTALL', `browser installation failed with exit code ${c}`), c)
            }
        })

        if (timeout > 0) {
            timer = setTimeout(() => {
                if (done) {
                    return
                }
                timedOut = true
                killTree(cp, platform, sp, kill).then(() => {
                    finish(makeErr('E_INSTALL', 'browser installation timed out'), -1)
                })
            }, timeout)
        }
    })
}


export {
    getInstallArgs,
    getInstallEnv,
    runInstall
}
