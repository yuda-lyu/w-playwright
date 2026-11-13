import path from 'path'
import { spawn, spawnSync } from 'child_process'


//runChild, 以子行程執行node腳本(隱藏視窗), 收集輸出, 解析最後一行'RESULT <json>'


//ENV_DROP, 會使守門失效或改變Playwright行為之環境變數(子行程一律刪除; 須在載入playwright-core前)
let ENV_DROP = [
    'PWDEBUG',
    'npm_config_pwdebug',
    'npm_package_config_pwdebug',
    'SELENIUM_REMOTE_URL',
    'SELENIUM_REMOTE_CAPABILITIES',
    'PW_VERSION_OVERRIDE',
    'PWTEST_UNDER_TEST',
    'PLAYWRIGHT_LEGACY_SCREENSHOT', //基準命令列依其值而變; 需要之案以extra給
    'W_PLAYWRIGHT_LOGON_GUARD', //預設關; 需要之案以extra開啟
]


/**
 * 乾淨之環境: 複製process.env並刪除ENV_DROP(Windows之環境變數不分大小寫, 故以大寫比對鍵名), 再套extra(值為undefined者刪除)
 */
function cleanEnv(extra = {}) {
    let env = { ...process.env }
    let drop = new Set(ENV_DROP.map((k) => k.toUpperCase()))
    for (let k of Object.keys(env)) {
        if (drop.has(k.toUpperCase())) {
            delete env[k]
        }
    }
    for (let k of Object.keys(extra)) {
        if (extra[k] === undefined) {
            delete env[k]
        }
        else {
            env[k] = extra[k]
        }
    }
    return env
}


/**
 * 結束子行程樹(Windows以taskkill /T /F, 等其結束; 其餘SIGKILL)
 */
function killTree(cp) {
    try {
        if (process.platform === 'win32' && cp.pid) {
            let tk = process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'taskkill.exe') : 'taskkill'
            spawnSync(tk, ['/pid', String(cp.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 15000 })
        }
        else {
            cp.kill('SIGKILL')
        }
    }
    catch (err) {}
}


/**
 * 執行子行程, 回Promise{ code, out, result, timedOut }; 逾時即結束整個子行程樹(含其瀏覽器)
 */
function runChild(script, args = [], env = cleanEnv(), timeoutMs = 300000) {
    return new Promise((resolve) => {
        let out = ''
        let timedOut = false
        let cp = spawn(process.execPath, [path.resolve(script), ...args], {
            env,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
        })
        let timer = setTimeout(() => {
            timedOut = true
            killTree(cp)
        }, timeoutMs)
        cp.stdout.on('data', (d) => {
            out += d
        })
        cp.stderr.on('data', (d) => {
            out += d
        })
        cp.on('close', (code) => {
            clearTimeout(timer)
            let lines = out.split(/\r?\n/).filter((v) => v.startsWith('RESULT '))
            let result = null
            if (lines.length > 0) {
                try {
                    result = JSON.parse(lines[lines.length - 1].slice(7))
                }
                catch (err) {}
            }
            resolve({ code, out, result, timedOut })
        })
    })
}


export {
    ENV_DROP,
    cleanEnv,
    killTree,
    runChild
}
