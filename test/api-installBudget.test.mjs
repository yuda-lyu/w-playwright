import fs from 'fs'
import path from 'path'
import assert from 'assert'
import { createRequire } from 'module'
import { runChild, cleanEnv } from './tools/runChild.mjs'


//api-installBudget: autoInstall與ensureChromium之整體上限(R-PW-BUDGET)於真實安裝子行程之驗證——不下載
//做法: 以子行程(test/tools/runInstallBudget.mjs)各自指向一個空的PLAYWRIGHT_BROWSERS_PATH, 並預先在其內放Playwright之安裝目錄鎖(__dirlock)模擬「他方正在安裝」:
//  - 鎖之修改時間設在一小時後(未過期, 於Playwright視為持有中): 真安裝子行程停在等鎖(此即「多行程並行時後到者等先到者」之情形), 於預算逾時被結束 → E_INSTALL('browser installation timed out')
//  - 鎖之修改時間設在一小時前(已過期之殘留): 子行程立即接手, 進入下載; 下載主機設為不可連位址, 故只會下載失敗(離開碼1)而不會真的下載(對照: 證明上一案之逾時確由「等鎖」造成)
//萬一取得鎖亦不會下載: PLAYWRIGHT_DOWNLOAD_HOST與PLAYWRIGHT_CHROMIUM_DOWNLOAD_HOST皆指向本機不可連之埠(後者優先於前者, 兩者皆設以免使用者環境之鏡像設定生效)
//中介資料落test/_tmp/installBudget, 測完刪除


let require = createRequire(import.meta.url)
let fdTmp = path.resolve('./test/_tmp/installBudget')
let DEAD = 'http://127.0.0.1:9'

//getExpected, 本套件所依之playwright-core指定之headless shell目錄名(用以斷言未下載)
function getExpected() {
    let fp = require.resolve('playwright-core/package.json')
    let bs = JSON.parse(fs.readFileSync(path.join(path.dirname(fp), 'browsers.json'), 'utf8'))
    let b = bs.browsers.find((v) => v.name === 'chromium-headless-shell')
    return { dir: `chromium_headless_shell-${b.revision}` }
}

//mkLock, 建立空的瀏覽器目錄並放入安裝目錄鎖(holder: 'live'為持有中、'stale'為已過期之殘留)
function mkLock(name, holder) {
    let fd = path.join(fdTmp, name)
    fs.rmSync(fd, { recursive: true, force: true })
    fs.mkdirSync(path.join(fd, '__dirlock'), { recursive: true })
    let t = new Date(Date.now() + (holder === 'live' ? 1 : -1) * 3600 * 1000)
    fs.utimesSync(path.join(fd, '__dirlock'), t, t)
    return fd
}

//PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT: 下載每次嘗試之連線逾時(毫秒); 於丟棄回送封包而不回RST之環境, 5次嘗試不致拖過斷言之時限
function run(fd, ms, mode) {
    return runChild('./test/tools/runInstallBudget.mjs', [String(ms), mode], cleanEnv({
        PLAYWRIGHT_BROWSERS_PATH: fd,
        PLAYWRIGHT_DOWNLOAD_HOST: DEAD,
        PLAYWRIGHT_CHROMIUM_DOWNLOAD_HOST: DEAD,
        PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT: '2000',
    }), 120000)
}


describe('api-installBudget', function() {

    this.timeout(180000)

    let expected = null
    before(function() {
        //保險之前提(Playwright升版時若寫法改變即在任何子行程之前失敗, 不讓「不得下載」之保險靜默失效):
        //自訂下載主機之環境變數存在、優先序(CHROMIUM專用者先於通用者)、設了即取代全部鏡像、連線逾時之環境變數
        let core = fs.readFileSync(path.join(path.dirname(require.resolve('playwright-core/package.json')), 'lib', 'coreBundle.js'), 'utf8')
        assert.ok(/downloadHostEnv = "PLAYWRIGHT_CHROMIUM_DOWNLOAD_HOST"/.test(core), 'Playwright已改變自訂下載主機之環境變數, 須重新設計不下載之保險')
        assert.ok(/customHostOverride = downloadHostEnv && getFromENV\(downloadHostEnv\) \|\| getFromENV\("PLAYWRIGHT_DOWNLOAD_HOST"\)/.test(core), 'Playwright已改變自訂下載主機之優先序, 須重新設計不下載之保險')
        assert.ok(/if \(customHostOverride\)\s*mirrors = \[customHostOverride\];/.test(core), 'Playwright已改變自訂下載主機之取代規則, 須重新設計不下載之保險')
        assert.ok(/getFromENV\("PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT"\)/.test(core), 'Playwright已改變下載連線逾時之環境變數')
        fs.rmSync(fdTmp, { recursive: true, force: true })
        fs.mkdirSync(fdTmp, { recursive: true })
        expected = getExpected()
    })

    after(function() {
        fs.rmSync(fdTmp, { recursive: true, force: true })
        let fdParent = path.dirname(fdTmp)
        if (fs.existsSync(fdParent) && fs.readdirSync(fdParent).length === 0) {
            fs.rmdirSync(fdParent)
        }
    })

    //三個入口各自經真安裝子行程(launchChromiumPersistent與launchChromium共用同一預算實作, 仍逐點接線)
    for (let mode of ['launch', 'persistent', 'ensure']) {
        let label = { launch: 'launchChromium({ autoInstall: true, installTimeout })', persistent: 'launchChromiumPersistent(\'\', { autoInstall: true, installTimeout })', ensure: 'ensureChromium({ timeout })' }[mode]

        it(`R-PW-BUDGET 真子行程(${mode}): 他方持有安裝目錄鎖時, ${label}於預算逾時: 結束子行程樹、E_INSTALL('browser installation timed out')、未下載`, async function() {
            let ms = 3000
            let fd = mkLock('live-' + mode, 'live')
            let x = await run(fd, ms, mode)
            assert.ok(x.result, x.out)
            assert.strict.deepStrictEqual(x.result.code, 'E_INSTALL', x.out)
            assert.strict.deepStrictEqual(x.result.message, 'browser installation timed out', x.out)
            assert.strict.deepStrictEqual(x.result.evs.filter((v) => v.startsWith('install-')), ['install-start:headless-shell', 'install-fail:headless-shell:-1'])
            //不早於預算, 且於預算加結束子行程樹之等待上限(10秒)與餘裕內結束(未懸置)
            assert.ok(x.result.ms >= ms - 100 && x.result.ms < ms + 30000, String(x.result.ms))
            assert.strict.deepStrictEqual(fs.existsSync(path.join(fd, expected.dir)), false)
            assert.strict.deepStrictEqual(x.timedOut, false)
        })

        it(`R-PW-BUDGET 真子行程(${mode}, 對照): 殘留(已過期)之鎖被立即接手, 不逾時(進入下載, 下載被擋而離開碼1)——證明上一案之逾時確由等鎖造成`, async function() {
            let fd = mkLock('stale-' + mode, 'stale')
            let x = await run(fd, 60000, mode)
            assert.ok(x.result, x.out)
            assert.strict.deepStrictEqual(x.result.code, 'E_INSTALL', x.out)
            assert.strict.deepStrictEqual(x.result.message, 'browser installation failed with exit code 1', x.out)
            assert.strict.deepStrictEqual(x.result.evs.filter((v) => v.startsWith('install-')), ['install-start:headless-shell', 'install-fail:headless-shell:1'])
            assert.ok(x.result.ms < 55000, String(x.result.ms))
            assert.strict.deepStrictEqual(fs.existsSync(path.join(fd, expected.dir)), false)
        })
    }

})
