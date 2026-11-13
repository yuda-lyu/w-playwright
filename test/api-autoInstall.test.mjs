import fs from 'fs'
import path from 'path'
import assert from 'assert'
import { createRequire } from 'module'
import { runChild, cleanEnv } from './tools/runChild.mjs'


//api-autoInstall: 真實下載與啟動(自 w-package-tools-e2e test/e2e-launchChromium.test.mjs 移入; 設計§5.1)
//以子行程執行test/tools/runAutoInstall.mjs, 各以空的PLAYWRIGHT_BROWSERS_PATH模擬全新機器(不動本機既有之瀏覽器快取); 只起headless shell
//安裝次數以onTrace之install-*事件計(不靠stdout); 中介資料落test/_tmp/autoInstall, 測完刪除


let require = createRequire(import.meta.url)
let fdTmp = path.resolve('./test/_tmp/autoInstall')

//expected, 本套件所依之playwright-core指定之headless shell版本與目錄名
function getExpected() {
    let fp = require.resolve('playwright-core/package.json')
    let bs = JSON.parse(fs.readFileSync(path.join(path.dirname(fp), 'browsers.json'), 'utf8'))
    let b = bs.browsers.find((v) => v.name === 'chromium-headless-shell')
    return { version: b.browserVersion, dir: `chromium_headless_shell-${b.revision}` }
}

function run(fd, args = []) {
    //登入守門開啟: 萬一有非headless shell之啟動, 先讀錯誤次數
    return runChild('./test/tools/runAutoInstall.mjs', args, cleanEnv({ PLAYWRIGHT_BROWSERS_PATH: fd, W_PLAYWRIGHT_LOGON_GUARD: '1' }), 600000)
}

function count(evs, type) {
    return evs.filter((v) => v.startsWith(type)).length
}


describe('api-autoInstall', function() {

    let expected = null

    before(function() {
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

    it('§4: autoInstall預設關 → 全新環境即E_BROWSER_MISSING, 不下載', async function() {
        this.timeout(120000)
        let fd = path.join(fdTmp, 'noauto')
        let x = await run(fd, ['noauto'])
        assert.ok(x.result, x.out)
        assert.strict.deepStrictEqual(x.result.code, 'E_BROWSER_MISSING')
        assert.strict.deepStrictEqual(count(x.result.evs, 'install-start'), 0)
        assert.strict.deepStrictEqual(fs.existsSync(path.join(fd, expected.dir)), false)
    })

    it('全新環境autoInstall:true → 安裝Playwright指定版本之headless shell一次後啟動', async function() {
        this.timeout(600000)
        let fd = path.join(fdTmp, 'fresh')
        let x = await run(fd)
        assert.ok(x.result, x.out)
        assert.strict.deepStrictEqual(x.result.code, undefined, x.out)
        assert.strict.deepStrictEqual(x.result.evs.filter((v) => v.startsWith('install-')), ['install-start:headless-shell', 'install-done:headless-shell'])
        assert.strict.deepStrictEqual([x.result.version, x.result.width], [expected.version, 120])
        assert.strict.deepStrictEqual(fs.existsSync(path.join(fd, expected.dir)), true)
    })

    it('已安裝時不再安裝, 直接啟動', async function() {
        this.timeout(600000)
        let fd = path.join(fdTmp, 'fresh')
        let x = await run(fd)
        assert.ok(x.result, x.out)
        assert.strict.deepStrictEqual(count(x.result.evs, 'install-start'), 0)
        assert.strict.deepStrictEqual([x.result.version, x.result.width], [expected.version, 120])
    })

    it('多個程序同時首次啟動: 各至多安裝一次, 全部啟動成功(Playwright之安裝目錄鎖)', async function() {
        this.timeout(600000)
        let fd = path.join(fdTmp, 'parallel')
        let xs = await Promise.all([run(fd), run(fd), run(fd)])
        for (let x of xs) {
            assert.ok(x.result, x.out)
            assert.strict.deepStrictEqual(x.result.code, undefined, x.out)
            assert.ok(count(x.result.evs, 'install-start') <= 1)
            assert.strict.deepStrictEqual(count(x.result.evs, 'install-fail'), 0)
            assert.strict.deepStrictEqual([x.result.version, x.result.width], [expected.version, 120])
        }
        assert.strict.deepStrictEqual(fs.existsSync(path.join(fd, expected.dir)), true)
    })

})
