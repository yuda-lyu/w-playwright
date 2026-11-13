import wpw from '../../src/WPlaywright.mjs'


//runAutoInstall, 供api-autoInstall以子行程執行(各自之PLAYWRIGHT_BROWSERS_PATH, 須在載入前設定); 啟動headless shell(無頭、未給通道)後開一頁量測
//自 w-package-tools-e2e test/tools/runLaunchChromium.mjs 移入; 安裝次數改以onTrace之install-*事件計(不靠stdout)
//用法: node test/tools/runAutoInstall.mjs [noauto] ; 最後一行輸出'RESULT <json>'

let auto = process.argv[2] !== 'noauto'
let evs = []
let r = { evs }
let browser = null
try {
    browser = await wpw.launchChromium({ headless: true, autoInstall: auto, onTrace: (e) => evs.push(e.type + (e.kind ? ':' + e.kind : '')) })
    let page = await browser.newPage()
    await page.setContent('<div id="a" style="width:120px; height:30px;">ok</div>')
    r.width = await page.evaluate(() => document.getElementById('a').offsetWidth)
    r.version = browser.version()
}
catch (err) {
    r.code = err.code || 'NOCODE'
}
finally {
    if (browser) {
        await browser.close()
    }
}
console.log('RESULT ' + JSON.stringify(r))
