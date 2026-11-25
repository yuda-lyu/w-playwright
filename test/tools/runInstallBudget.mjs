import wpw from '../../src/WPlaywright.mjs'


//runInstallBudget, 供api-installBudget以子行程執行(各自之PLAYWRIGHT_BROWSERS_PATH, 須在載入前設定; 該目錄內由呼叫端預先放一個「他方持有中」之安裝目錄鎖, 使安裝子行程停在等鎖而不下載)
//用法: node test/tools/runInstallBudget.mjs <毫秒> [launch|persistent|ensure]
//  launch(預設): launchChromium({ autoInstall: true, installTimeout: <毫秒> }); persistent: launchChromiumPersistent('', { autoInstall: true, installTimeout: <毫秒> }); ensure: ensureChromium({ timeout: <毫秒> })
//最後一行輸出'RESULT <json>': { code, message, evs(事件字串: type[:kind][:exitCode]), ms(自呼叫至結束之毫秒) }
//安全: 呼叫端須同時設PLAYWRIGHT_DOWNLOAD_HOST為不可連之位址, 萬一取得鎖亦只會下載失敗而不會真的下載

let ms = Number(process.argv[2])
let mode = ['ensure', 'persistent'].includes(process.argv[3]) ? process.argv[3] : 'launch'
let evs = []
let r = { evs }
let t0 = Date.now()
let onTrace = (e) => evs.push(e.type + (e.kind ? ':' + e.kind : '') + (e.exitCode !== undefined ? ':' + e.exitCode : ''))
let browser = null
try {
    if (mode === 'ensure') {
        await wpw.ensureChromium({ timeout: ms, onTrace })
    }
    else if (mode === 'persistent') {
        browser = await wpw.launchChromiumPersistent('', { headless: true, autoInstall: true, installTimeout: ms, onTrace })
    }
    else {
        browser = await wpw.launchChromium({ headless: true, autoInstall: true, installTimeout: ms, onTrace })
    }
    r.code = 'OK'
}
catch (err) {
    r.code = err.code || 'NOCODE'
    r.message = err.message
}
finally {
    if (browser) {
        await browser.close()
    }
}
r.ms = Date.now() - t0
console.log('RESULT ' + JSON.stringify(r))
