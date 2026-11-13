import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { chromium } from 'playwright-core'
import core from 'playwright-core/lib/coreBundle'
import wpw from '../../src/WPlaywright.mjs'
import pwDefaults from '../../src/pwDefaults.mjs'


//pwDriftProbe, 供api-pwDrift以子行程執行(環境已刪除PWDEBUG、SELENIUM_*等, 須在載入playwright-core前; 並設DEBUG=pw:browser)
//安全: 基準與矩陣之每次啟動皆以executablePath釘在headless shell之執行檔, 啟動前先斷言檔名為chrome-headless-shell(.exe);
//接線案之預設(無頭、未給通道)Playwright亦選headless shell, 父測試另以<launching>紀錄之執行檔斷言
//最後一行輸出'RESULT <json>'


let require = createRequire(import.meta.url)
let SHELL_NAMES = ['chrome-headless-shell.exe', 'chrome-headless-shell']

//launching, 收Playwright之<launching>紀錄(PW164 :10025): Playwright之debugLogger(DEBUG=pw:browser)寫至stderr, 於此攔截
//(1.64.1之logger選項於持久啟動收不到此紀錄; CDP Browser.getBrowserCommandLine須--enable-automation, Playwright未給)
let launching = []
let stderrWrite = process.stderr.write.bind(process.stderr)
process.stderr.write = (chunk, ...rest) => {
    let s = String(chunk)
    let i = s.indexOf('<launching> ')
    if (i >= 0) {
        launching.push(s.slice(i + 12).trim())
    }
    return stderrWrite(chunk, ...rest)
}

//capture, 執行fn並回其間之第一筆<launching>紀錄
async function capture(fn) {
    let n = launching.length
    await fn()
    return launching.length > n ? launching[n] : ''
}

let r = { ok: false }

//staticTable, 自coreBundle.js原始碼文字抽出disabledFeatures陣列(只用於比對與失敗時印出)
function staticTable() {
    let fp = path.join(path.dirname(require.resolve('playwright-core/package.json')), 'lib', 'coreBundle.js')
    let s = fs.readFileSync(fp, 'utf8')
    let m = s.match(/disabledFeatures = \[([\s\S]*?)\]\.filter\(Boolean\)/)
    if (!m) {
        return null
    }
    return (m[1].match(/"([^"]+)"/g) || []).map((v) => v.slice(1, -1))
}

function assertShell(fp) {
    if (SHELL_NAMES.indexOf(path.basename(String(fp)).toLowerCase()) < 0) {
        throw new Error('executablePath is not headless shell')
    }
}

async function main() {
    let shellExe = core.registry.registry.findExecutable('chromium-headless-shell').executablePath()
    r.shellExe = shellExe
    assertShell(shellExe)
    if (!fs.existsSync(shellExe)) {
        //未安裝headless shell時先安裝(不啟動瀏覽器)
        await wpw.ensureChromium({ kind: 'headless-shell' })
    }
    if (!fs.existsSync(shellExe)) {
        r.error = 'headless shell executable not found'
        return
    }
    r.staticDisable = staticTable()

    //未合併之基準: launchServer讀spawnargs(只起headless shell)
    {
        let server = await chromium.launchServer({ executablePath: shellExe })
        r.baseline = server.process().spawnargs.slice(1)
        await server.close()
    }

    //合併後之矩陣: headless × 非持久/持久 × channel
    r.matrix = []
    for (let headless of [true, false]) {
        for (let persistent of [false, true]) {
            for (let channel of [undefined, 'chrome', 'msedge', 'chromium']) {
                let o = wpw.getChromiumLaunchOptions({ headless, channel, executablePath: shellExe })
                assertShell(o.executablePath)
                let args = null
                if (!persistent) {
                    let server = await chromium.launchServer(o)
                    args = server.process().spawnargs.slice(1)
                    await server.close()
                }
                else {
                    let line = await capture(async () => {
                        let ctx = await chromium.launchPersistentContext('', o)
                        await ctx.close()
                    })
                    if (!line.startsWith(shellExe)) {
                        throw new Error('launching line does not start with the headless shell executable')
                    }
                    args = line.slice(shellExe.length).trim().split(' ').filter((v) => v !== '')
                }
                r.matrix.push({ headless, persistent, channel: channel || '', expected: o.args[o.args.length - 1], args })
            }
        }
    }

    //呼叫端給功能開關與「不要預設enable」之ignore時之真命令列(合併與第4步意圖以實際Playwright驗證)
    {
        let defEn = '--enable-features=' + pwDefaults.enableFeatures.join(',')
        let o = wpw.getChromiumLaunchOptions({ executablePath: shellExe, args: ['--disable-features=WpwX', '--enable-features=WpwY', '--lang=en-US'], ignoreDefaultArgs: [defEn] })
        assertShell(o.executablePath)
        let server = await chromium.launchServer(o)
        r.callerCase = { args: server.process().spawnargs.slice(1), expectedDis: o.args[o.args.length - 1] }
        await server.close()
    }

    //Playwright全域預設啟動選項(_defaultLaunchOptions)帶executablePath時不得蓋過本套件之選項: 預設指向不存在之檔(安全: 若被採用即於啟動前失敗, 不起任何瀏覽器)
    {
        let pw = chromium._playwright
        if (pw && typeof pw === 'object') {
            let save = pw._defaultLaunchOptions
            pw._defaultLaunchOptions = { executablePath: 'C:\\nonexistent-wpw\\chrome.exe' }
            try {
                let line = await capture(async () => {
                    let b = await wpw.launchChromium()
                    await b.close()
                })
                r.defaultsCase = { line }
            }
            catch (err) {
                r.defaultsCase = { error: (err && err.code) || 'NOCODE' }
            }
            finally {
                pw._defaultLaunchOptions = save
            }
        }
        else {
            r.defaultsCase = { error: 'unavailable' }
        }
    }

    //接線(接縫不用替身): wpw.launchChromium()與wpw.launchChromiumPersistent('')真啟動(預設無頭、未給通道 → headless shell)各一次
    r.wiring = []
    {
        let width = null
        let line = await capture(async () => {
            let b = await wpw.launchChromium()
            let page = await b.newPage()
            await page.setContent('<div id="a" style="width:120px">ok</div>')
            width = await page.evaluate(() => document.getElementById('a').offsetWidth)
            await b.close()
        })
        r.wiring.push({ fn: 'launchChromium', line, width })
    }
    {
        let line = await capture(async () => {
            let ctx = await wpw.launchChromiumPersistent('', {})
            await ctx.close()
        })
        r.wiring.push({ fn: 'launchChromiumPersistent', line })
    }

    //setBrowserTypeForTest之next(): 替身包裝真BrowserType, next()以同一份合併後選項真啟動; next(o)重走完整流程
    {
        let seen = []
        let restore = wpw.setBrowserTypeForTest({
            launch: async (o, next) => {
                seen.push(o.args[o.args.length - 1])
                o.args = [] //替身改寫其收到之物件不影響next()
                return next()
            },
        })
        let line1 = ''
        try {
            line1 = await capture(async () => {
                let b = await wpw.launchChromium()
                await b.close()
            })
        }
        finally {
            restore()
        }
        let restore2 = wpw.setBrowserTypeForTest({
            launch: async (o, next) => next({ args: ['--disable-features=WpwNextProbe'] }),
        })
        let line2 = ''
        try {
            line2 = await capture(async () => {
                let b = await wpw.launchChromium()
                await b.close()
            })
        }
        finally {
            restore2()
        }
        r.next = { seen, line1, line2 }
    }

    r.ok = true
}

//legacy: 子行程設PLAYWRIGHT_LEGACY_SCREENSHOT時, Playwright不給預設enable; 呼叫端enable單獨一串、disable恰一串
async function legacy() {
    let shellExe = core.registry.registry.findExecutable('chromium-headless-shell').executablePath()
    assertShell(shellExe)
    r.shellExe = shellExe
    let server = await chromium.launchServer({ executablePath: shellExe })
    r.baseline = server.process().spawnargs.slice(1)
    await server.close()
    let o = wpw.getChromiumLaunchOptions({ executablePath: shellExe, args: ['--enable-features=WpwY'] })
    assertShell(o.executablePath)
    let s2 = await chromium.launchServer(o)
    r.merged = s2.process().spawnargs.slice(1)
    r.expectedDis = o.args[o.args.length - 1]
    await s2.close()
    r.ok = true
}

try {
    if (process.argv[2] === 'legacy') {
        await legacy()
    }
    else {
        await main()
    }
}
catch (err) {
    r.error = String(err && err.message).split('\n')[0]
}
console.log('RESULT ' + JSON.stringify(r))
