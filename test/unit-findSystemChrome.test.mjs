import fs from 'fs'
import path from 'path'
import assert from 'assert'
import wpw from '../src/WPlaywright.mjs'
import { findChromeCore, readVersionDir } from '../src/_findChrome.mjs'


//unit-findSystemChrome: 以test/_tmp之假目錄樹模擬Windows五種前綴與版本資料夾(設計§8.1); 不呼叫任何launch
//路徑表同playwright-core 1.64.1 registry(chrome: \Google\Chrome\Application\chrome.exe, msedge: \Microsoft\Edge\Application\msedge.exe)


let fdTmp = path.resolve('./test/_tmp/findSystemChrome')

function touch(fp) {
    fs.mkdirSync(path.dirname(fp), { recursive: true })
    fs.writeFileSync(fp, '')
}


describe('unit-findSystemChrome', function() {

    let env = null
    let restore = null
    let launches = 0

    before(function() {
        fs.rmSync(fdTmp, { recursive: true, force: true })
        let pre = (n) => path.join(fdTmp, n)
        env = {
            'LOCALAPPDATA': pre('local'),
            'PROGRAMFILES': pre('pf'),
            'PROGRAMFILES(X86)': pre('pf86'),
            'HOMEDRIVE': pre('hd'),
        }
        restore = wpw.setBrowserTypeForTest({
            launch: async () => {
                launches++
            },
        })
    })

    after(function() {
        restore()
        fs.rmSync(fdTmp, { recursive: true, force: true })
        let fdParent = path.dirname(fdTmp)
        if (fs.existsSync(fdParent) && fs.readdirSync(fdParent).length === 0) {
            fs.rmdirSync(fdParent)
        }
        //只判存在, 不啟動瀏覽器
        assert.strict.deepStrictEqual(launches, 0)
    })

    it('五種前綴各自命中(依Playwright之順序: LOCALAPPDATA、PROGRAMFILES、PROGRAMFILES(X86)、HOMEDRIVE\\Program Files、HOMEDRIVE\\Program Files (x86))', function() {
        if (process.platform !== 'win32') {
            this.skip() //假目錄樹須以Windows之路徑建立於本機檔案系統
        }
        let sfx = path.join('Google', 'Chrome', 'Application', 'chrome.exe')
        let pres = [env.LOCALAPPDATA, env.PROGRAMFILES, env['PROGRAMFILES(X86)'], path.join(env.HOMEDRIVE, 'Program Files'), path.join(env.HOMEDRIVE, 'Program Files (x86)')]
        //由後往前逐一建立, 每次應命中最前面已存在者
        for (let i = pres.length - 1; i >= 0; i--) {
            touch(path.join(pres[i], sfx))
            assert.strict.deepStrictEqual(findChromeCore({ channel: 'chrome' }, { env, platform: 'win32' }), path.join(pres[i], sfx), String(i))
        }
        fs.rmSync(fdTmp, { recursive: true, force: true })
    })

    it('msedge之路徑; 找不到回\'\'', function() {
        if (process.platform !== 'win32') {
            this.skip() //同上
        }
        assert.strict.deepStrictEqual(findChromeCore({ channel: 'msedge' }, { env, platform: 'win32' }), '')
        let fp = path.join(env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe')
        touch(fp)
        assert.strict.deepStrictEqual(findChromeCore({ channel: 'msedge' }, { env, platform: 'win32' }), fp)
        //同名為資料夾者不算
        let fd2 = path.join(env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
        fs.mkdirSync(fd2, { recursive: true })
        assert.strict.deepStrictEqual(findChromeCore({ channel: 'msedge' }, { env, platform: 'win32' }), fp)
        fs.rmSync(fdTmp, { recursive: true, force: true })
    })

    it('HOMEDRIVE未設時略過其兩處; 前綴皆未設回\'\'', function() {
        assert.strict.deepStrictEqual(findChromeCore({ channel: 'chrome' }, { env: {}, platform: 'win32' }), '')
    })

    it('executablePath: 給了即只認它(存在回絕對路徑、不存在回\'\', 不改找他處)', function() {
        let sys = path.join(env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')
        touch(sys)
        let mine = path.join(fdTmp, 'mine', 'chrome.exe')
        touch(mine)
        assert.strict.deepStrictEqual(findChromeCore({ channel: 'chrome', executablePath: mine }, { env, platform: 'win32' }), mine)
        let rel = path.relative(process.cwd(), mine)
        assert.strict.deepStrictEqual(findChromeCore({ channel: 'chrome', executablePath: rel }, { env, platform: 'win32' }), mine)
        assert.strict.deepStrictEqual(findChromeCore({ channel: 'chrome', executablePath: path.join(fdTmp, 'nope.exe') }, { env, platform: 'win32' }), '')
        fs.rmSync(fdTmp, { recursive: true, force: true })
    })

    it('非Windows之路徑為絕對路徑一處; 不支援之平台回\'\'', function() {
        assert.strict.deepStrictEqual(typeof findChromeCore({ channel: 'chrome' }, { env, platform: 'linux' }), 'string')
        assert.strict.deepStrictEqual(findChromeCore({ channel: 'chrome' }, { env, platform: 'aix' }), '')
    })

    it('版本取執行檔旁之版本資料夾名(最大者, 只認資料夾)', function() {
        let fd = path.join(fdTmp, 'ver', 'Application')
        let exe = path.join(fd, 'chrome.exe')
        touch(exe)
        fs.mkdirSync(path.join(fd, '157.0.1.2'))
        fs.mkdirSync(path.join(fd, '99.0.0.1'))
        fs.mkdirSync(path.join(fd, '157.0.10.0'))
        fs.mkdirSync(path.join(fd, 'SetupMetrics'))
        touch(path.join(fd, '200.0.0.0'))
        assert.strict.deepStrictEqual(readVersionDir(exe), '157.0.10.0')
        assert.strict.deepStrictEqual(readVersionDir(''), '')
        assert.strict.deepStrictEqual(readVersionDir(path.join(fdTmp, 'none', 'chrome.exe')), '')
        fs.rmSync(fdTmp, { recursive: true, force: true })
    })

    it('公開函數: 回字串, 永不拋錯; executablePath無效視為未給', function() {
        for (let v of [undefined, null, 1, {}, { channel: 1 }, { executablePath: 1 }]) {
            assert.strict.deepStrictEqual(typeof wpw.findSystemChrome(v), 'string')
        }
        assert.strict.deepStrictEqual(wpw.findSystemChrome({ executablePath: '' }), wpw.findSystemChrome())
        assert.strict.deepStrictEqual(wpw.getPlaywrightInfo().systemChrome.path, wpw.findSystemChrome())
    })

})
