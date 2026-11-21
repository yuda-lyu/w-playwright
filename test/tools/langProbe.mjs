import fs from 'fs'
import core from 'playwright-core/lib/coreBundle'
import wpw from '../../src/WPlaywright.mjs'


//langProbe, 供api-lang以子行程執行(真headless shell; 環境已刪除PWDEBUG、SELENIUM_*等, 須在載入playwright-core前)
//以經本套件之入口啟動headless shell(隱藏視窗; 無頭), 量: navigator.language、navigator.languages、sans-serif之拉丁字與中文字之實際字型(CDP CSS.getPlatformFontsForNode)與行高
//最後一行輸出'RESULT <json>'


let r = { ok: false, cases: {} }

//樣本: 14px之sans-serif拉丁字與中文字(各一個獨立元素)
let HTML = '<body style="margin:0"><div id="lat" style="font-family:sans-serif;font-size:14px;width:max-content">AND</div><div id="cjk" style="font-family:sans-serif;font-size:14px;width:max-content">中文字</div></body>'


async function measure(page, ctx) {
    await page.setContent(HTML)
    let o = await page.evaluate(() => {
        let h = (id) => {
            let b = document.getElementById(id).getBoundingClientRect()
            return [Math.round(b.width * 100) / 100, Math.round(b.height * 100) / 100]
        }
        return { language: navigator.language, languages: [...navigator.languages], lat: h('lat'), cjk: h('cjk') }
    })
    let cdp = await ctx.newCDPSession(page)
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    let { root } = await cdp.send('DOM.getDocument', { depth: -1 })
    for (let id of ['lat', 'cjk']) {
        let { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: `#${id}` })
        let pf = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
        o[id + 'Fonts'] = pf.fonts.map((x) => x.familyName)
    }
    return o
}


//run, 以launchChromium(opt)(或launchChromiumPersistent)啟動, 於預設context(或ctxOpt指定之context)量測後關閉
async function run(name, opt, ctxOpt, persistent = false) {
    let browser = null
    let ctx = null
    try {
        if (persistent) {
            ctx = await wpw.launchChromiumPersistent('', opt)
            let page = ctx.pages()[0] || await ctx.newPage()
            r.cases[name] = await measure(page, ctx)
        }
        else {
            browser = await wpw.launchChromium(opt)
            ctx = await browser.newContext(ctxOpt || {})
            let page = await ctx.newPage()
            r.cases[name] = await measure(page, ctx)
            r.version = browser.version()
        }
    }
    catch (err) {
        r.cases[name] = { error: String((err && err.code) || (err && err.message)).split('\n')[0] }
    }
    finally {
        if (ctx) {
            await ctx.close().catch(() => {})
        }
        if (browser) {
            await browser.close().catch(() => {})
        }
    }
}


async function main() {
    let shellExe = core.registry.registry.findExecutable('chromium-headless-shell').executablePath()
    if (!fs.existsSync(shellExe)) {
        await wpw.ensureChromium({ kind: 'headless-shell' })
    }
    r.hostLang = Intl.DateTimeFormat().resolvedOptions().locale
    r.platform = process.platform
    await run('default', {})
    await run('off', { lang: false })
    await run('optEn', { lang: 'en-US' })
    await run('optJa', { lang: 'ja-JP' })
    await run('callerArgs', { args: ['--lang=en-US'] })
    //呼叫端自給與主機系統語系相同之--lang(預設啟動應與之等價; Chromium可能將語系正規化, 如ja-JP → ja, 故不直接比對字串)
    if (/^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/.test(r.hostLang)) {
        await run('callerHost', { args: ['--lang=' + r.hostLang] })
    }
    await run('persistentDefault', {}, null, true)
    await run('persistentOff', { lang: false }, null, true)
    //context之locale只改navigator.language, 不改字型(預設啟動語系不變)
    await run('defaultCtxLocaleEn', {}, { locale: 'en-US' })
    r.ok = true
}


try {
    await main()
}
catch (err) {
    r.error = String(err && err.message).split('\n')[0]
}
console.log('RESULT ' + JSON.stringify(r))
