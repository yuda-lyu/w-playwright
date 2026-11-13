import fs from 'fs'
import path from 'path'
import { chromium } from 'playwright-core'
import core from 'playwright-core/lib/coreBundle'
import wpw from '../../src/WPlaywright.mjs'
import readBadPassword from './readBadPassword.mjs'


//guardProbe, 守門之實證(子行程; 環境已刪除PWDEBUG、SELENIUM_*等)
//用法: node test/tools/guardProbe.mjs control            只起headless shell: 未合併之對照與合併後之命令列(不啟動真Chrome)
//      node test/tools/guardProbe.mjs real <chrome|msedge|chromium>
//          經本套件合併參數啟動一次(無頭), 讀chrome://version之「指令列變化版本」(#variations-cmd-section, base64 JSON), 前後讀錯誤密碼次數
//          安全: 啟動前錯誤次數須可讀且為0, 否則不啟動(aborted); chromium(完整Chromium)未安裝時不安裝、不啟動
//最後一行輸出'RESULT <json>'


let SHELL_NAMES = ['chrome-headless-shell.exe', 'chrome-headless-shell']
let mode = process.argv[2]
let kind = process.argv[3]
let r = { ok: false, mode, kind: kind || '' }

function featureSet(arr) {
    //Chromium對同名開關只取最後一個
    let sws = arr.filter((a) => /^-+disable-features(=|$)/i.test(a))
    if (sws.length === 0) {
        return []
    }
    let last = sws[sws.length - 1]
    let i = last.indexOf('=')
    return (i >= 0 ? last.slice(i + 1) : '').split(',').map((t) => t.trim()).filter((t) => t !== '')
}

async function control() {
    let shellExe = core.registry.registry.findExecutable('chromium-headless-shell').executablePath()
    if (SHELL_NAMES.indexOf(path.basename(shellExe).toLowerCase()) < 0 || !fs.existsSync(shellExe)) {
        r.error = 'headless shell not found'
        return
    }
    let argsOf = async (o) => {
        let server = await chromium.launchServer({ ...o, executablePath: shellExe })
        let a = server.process().spawnargs.slice(1)
        await server.close()
        return a
    }
    //對照一: 不合併(Playwright預設)
    r.rawDefault = featureSet(await argsOf({}))
    //對照二: 不合併而只另給守門一串(事件紀錄試驗5之作法: 兩串只取最後一串)
    r.rawGuardOnly = featureSet(await argsOf({ args: ['--disable-features=AutofillAiWalletPrivatePasses'] }))
    //合併後
    r.merged = featureSet(await argsOf(wpw.getChromiumLaunchOptions({})))
    r.ok = true
}

function decodeVariations(html) {
    let b64s = String(html).match(/eyJ[A-Za-z0-9+/=]{10,}/g) || []
    for (let s of b64s) {
        try {
            let j = JSON.parse(Buffer.from(s, 'base64').toString('utf8'))
            if (j && typeof j === 'object') {
                return j
            }
        }
        catch (err) {}
    }
    return null
}

async function observeCounter(ms) {
    //否定斷言之觀察窗: 關閉後持續讀取(讀不到記-1), 讀到>0即停; 呼叫端須斷言至少一讀且每讀皆成功並為0
    let max = -1
    let reads = []
    let t0 = Date.now()
    while (Date.now() - t0 < ms) {
        let x = await readBadPassword()
        reads.push(x.ok ? x.bad : -1)
        if (x.ok && x.bad > max) {
            max = x.bad
        }
        if (x.ok && x.bad > 0) {
            break
        }
        await new Promise((resolve) => setTimeout(resolve, 1000))
    }
    return { max, reads, allOkZero: reads.length > 0 && reads.every((v) => v === 0) }
}

async function real() {
    let opt = { headless: true }
    if (kind === 'chrome') {
        opt.channel = 'chrome'
        r.exe = wpw.findSystemChrome({ channel: 'chrome' })
    }
    else if (kind === 'msedge') {
        opt.channel = 'msedge'
        r.exe = wpw.findSystemChrome({ channel: 'msedge' })
    }
    else if (kind === 'chromium') {
        opt.channel = 'chromium'
        r.exe = core.registry.registry.findExecutable('chromium').executablePath() || ''
    }
    else {
        r.error = 'unknown kind'
        return
    }
    if (!r.exe || !fs.existsSync(r.exe)) {
        r.error = 'browser not installed'
        return
    }

    let before = await readBadPassword()
    r.before = before
    if (!before.ok || before.bad !== 0 || before.locked !== false) {
        r.aborted = 'bad password attempts not zero or unreadable before launch'
        return
    }

    //啟動、開頁、關閉任一拋錯, 仍於finally讀取觀察窗(失敗之啟動亦可能已增加次數)
    let browser = null
    try {
        browser = await wpw.launchChromium(opt)
        r.browserVersion = browser.version()
        let page = await browser.newPage()
        let html = ''
        let cmd = ''
        for (let u of ['chrome://version', 'edge://version']) {
            try {
                await page.goto(u)
                html = await page.evaluate(() => (document.querySelector('#variations-cmd-section') || {}).outerHTML || '')
                cmd = await page.evaluate(() => (document.querySelector('#command_line') || {}).innerText || '')
                if (html) {
                    r.url = u
                    break
                }
            }
            catch (err) {}
        }
        let j = decodeVariations(html)
        r.variations = j
        r.variationsDisable = j && typeof j['disable-features'] === 'string' ? j['disable-features'].split(',').map((t) => t.trim()).filter((t) => t !== '') : null
        r.cmdDisableCount = (cmd.match(/--disable-features=/g) || []).length
    }
    catch (err) {
        r.error = (err && err.code ? err.code + ' ' : '') + String(err && err.message).split('\n')[0]
    }
    finally {
        if (browser) {
            try {
                await browser.close()
            }
            catch (err) {}
        }
        r.after = await observeCounter(8000)
    }
    if (r.error) {
        return
    }
    r.ok = true
}

try {
    if (mode === 'control') {
        await control()
    }
    else if (mode === 'real') {
        await real()
    }
    else {
        r.error = 'unknown mode'
    }
}
catch (err) {
    r.error = (err && err.code ? err.code + ' ' : '') + String(err && err.message).split('\n')[0]
}
console.log('RESULT ' + JSON.stringify(r))
