import assert from 'assert'
import wpw from '../src/WPlaywright.mjs'
import { defDisStr, findSwitches } from './tools/cmdline.mjs'
import pwDefaults from '../src/pwDefaults.mjs'
import { pwState } from '../src/_pw.mjs'
import { cloneOpt, getOverride } from '../src/_launchCore.mjs'


//unit-setBrowserTypeForTest: 測試接縫之介面(F20)與兩入口之接線(替身收到合併後之選項)、錯誤契約(§2.3); 不啟動瀏覽器
//next()之真啟動於api-pwDrift以headless shell驗證


let GUARD = pwDefaults.guardFeatures[0]


describe('unit-setBrowserTypeForTest', function() {

    let saveGuard
    before(function() {
        saveGuard = process.env.W_PLAYWRIGHT_LOGON_GUARD
        delete process.env.W_PLAYWRIGHT_LOGON_GUARD
    })
    after(function() {
        if (saveGuard !== undefined) {
            process.env.W_PLAYWRIGHT_LOGON_GUARD = saveGuard
        }
    })

    it('fake不符即同步throw E_ARG(§2.2工廠類)', function() {
        class C {
            launch() {}
        }
        let bads = [undefined, null, 1, 'x', [], () => {}, {}, { launch: 1 }, { launch: () => {}, launchPersistentContext: 1 }, new C()]
        for (let b of bads) {
            assert.throws(() => wpw.setBrowserTypeForTest(b), (err) => err.code === 'E_ARG' && err.message === 'invalid fake: must be a plain object with a launch function')
        }
        let p = new Proxy({}, {})
        let rv = Proxy.revocable({ launch: () => {} }, {})
        rv.revoke()
        assert.throws(() => wpw.setBrowserTypeForTest(rv.proxy), (err) => err.code === 'E_ARG')
        assert.throws(() => wpw.setBrowserTypeForTest(p), (err) => err.code === 'E_ARG')
    })

    it('F20: 兩入口之替身收到合併後之選項(恰一串disable居末、ignore含預設串、無自用鍵)', async function() {
        let seen = []
        let restore = wpw.setBrowserTypeForTest({
            launch: async (o, next) => {
                seen.push({ o, next })
                return 'b'
            },
            launchPersistentContext: async (dir, o, next) => {
                seen.push({ dir, o, next })
                return 'c'
            },
        })
        try {
            let opt = { args: ['--disable-features=Foo', '--lang=en-US'], autoInstall: false, debug: false, timeout: 99 }
            assert.strict.deepStrictEqual(await wpw.launchChromium(opt), 'b')
            assert.strict.deepStrictEqual(await wpw.launchChromiumPersistent('', opt), 'c')
        }
        finally {
            restore()
        }
        assert.strict.deepStrictEqual(seen.length, 2)
        assert.strict.deepStrictEqual(seen[1].dir, '')
        for (let s of seen) {
            let dis = findSwitches(s.o.args, 'disable-features')
            assert.strict.deepStrictEqual(dis.length, 1)
            assert.strict.deepStrictEqual(s.o.args[s.o.args.length - 1], '--disable-features=' + [...pwDefaults.disableFeatures, GUARD, 'Foo'].join(','))
            assert.strict.deepStrictEqual(s.o.ignoreDefaultArgs, [defDisStr()])
            assert.strict.deepStrictEqual(s.o.timeout, 99)
            assert.strict.deepStrictEqual('autoInstall' in s.o, false)
            assert.strict.deepStrictEqual(typeof s.next, 'function')
        }
    })

    it('還原函數恢復呼叫前之狀態(巢狀), 重複呼叫無作用', async function() {
        let r1 = wpw.setBrowserTypeForTest({ launch: async () => 'one' })
        let r2 = wpw.setBrowserTypeForTest({ launch: async () => 'two' })
        assert.strict.deepStrictEqual(await wpw.launchChromium(), 'two')
        r2()
        assert.strict.deepStrictEqual(await wpw.launchChromium(), 'one')
        r2()
        assert.strict.deepStrictEqual(await wpw.launchChromium(), 'one')
        r1()
    })

    it('設定後改寫原fake物件之方法不影響已設定之替身(快照)', async function() {
        let fake = { launch: async () => 'orig' }
        let restore = wpw.setBrowserTypeForTest(fake)
        try {
            fake.launch = async () => 'changed'
            assert.strict.deepStrictEqual(await wpw.launchChromium(), 'orig')
        }
        finally {
            restore()
        }
    })

    it('§2.3: 替身之一般錯誤 → E_LAUNCH(固定詞彙、無cause), 原錯誤只交funLog', async function() {
        let logs = []
        let restore = wpw.setBrowserTypeForTest({
            launch: async () => {
                throw new Error('<launching> C:\\secret\\chrome.exe --proxy-server=http://user:pw@h')
            },
        })
        try {
            await assert.rejects(wpw.launchChromium({ funLog: (label, safe, detail) => logs.push({ label, safe, detail }) }), (err) => {
                assert.strict.deepStrictEqual(err.code, 'E_LAUNCH')
                assert.strict.deepStrictEqual(err.message, 'browser launch failed')
                assert.strict.deepStrictEqual(err.cause, undefined)
                return true
            })
        }
        finally {
            restore()
        }
        assert.strict.deepStrictEqual(logs.length, 1)
        assert.strict.deepStrictEqual(logs[0].label, 'launch-error')
        assert.strict.deepStrictEqual({ ...logs[0].safe }, { fn: 'launchChromium', code: 'E_LAUNCH' })
        assert.ok(String(logs[0].detail.message).includes('<launching>'))
    })

    it('§2.3: 逾時(TimeoutError) → E_LAUNCH_TIMEOUT', async function() {
        let restore = wpw.setBrowserTypeForTest({
            launch: async () => {
                let e = new Error('Timeout 30000ms exceeded.')
                e.name = 'TimeoutError'
                throw e
            },
        })
        try {
            await assert.rejects(wpw.launchChromium(), (err) => err.code === 'E_LAUNCH_TIMEOUT' && err.message === 'browser launch timed out')
        }
        finally {
            restore()
        }
    })

    it('§2.3: 受管瀏覽器缺檔且未autoInstall → E_BROWSER_MISSING(附ensureChromium提示, 不含路徑)', async function() {
        let restore = wpw.setBrowserTypeForTest({
            launch: async () => {
                throw new Error('Executable doesn\'t exist at C:\\Users\\x\\ms-playwright\\chromium_headless_shell-1248\\chrome-headless-shell.exe')
            },
        })
        try {
            await assert.rejects(wpw.launchChromium(), (err) => {
                assert.strict.deepStrictEqual(err.code, 'E_BROWSER_MISSING')
                assert.strict.deepStrictEqual(err.message, 'managed browser (headless-shell) is not installed: call ensureChromium({ kind: \'headless-shell\' }) or set opt.autoInstall to true')
                return true
            })
            await assert.rejects(wpw.launchChromium({ headless: false }), (err) => err.code === 'E_BROWSER_MISSING' && err.message.includes('(chromium)'))
            //通道chrome(非受管)缺檔 → E_LAUNCH
            await assert.rejects(wpw.launchChromium({ channel: 'chrome' }), (err) => err.code === 'E_LAUNCH')
        }
        finally {
            restore()
        }
    })

    it('替身未提供launchPersistentContext時launchChromiumPersistent → E_LAUNCH', async function() {
        let restore = wpw.setBrowserTypeForTest({ launch: async () => 'b' })
        try {
            await assert.rejects(wpw.launchChromiumPersistent('', {}), (err) => err.code === 'E_LAUNCH')
        }
        finally {
            restore()
        }
    })

    it('替身層缺檔(Executable doesn\'t exist)即使autoInstall:true亦不安裝 → E_BROWSER_MISSING(測試接縫不產生真下載)', async function() {
        let calls = 0
        let restore = wpw.setBrowserTypeForTest({
            launch: async () => {
                calls++
                throw new Error('Executable doesn\'t exist at C:\\x\\chrome-headless-shell.exe')
            },
        })
        try {
            await assert.rejects(wpw.launchChromium({ autoInstall: true }), (err) => err.code === 'E_BROWSER_MISSING')
        }
        finally {
            restore()
        }
        assert.strict.deepStrictEqual(calls, 1)
    })

    it('替身之方法以原fake物件為this呼叫', async function() {
        let fake = {
            calls: [],
            async launch(o) {
                this.calls.push(o.args.length)
                return 'self'
            },
        }
        let restore = wpw.setBrowserTypeForTest(fake)
        try {
            assert.strict.deepStrictEqual(await wpw.launchChromium(), 'self')
        }
        finally {
            restore()
        }
        assert.strict.deepStrictEqual(fake.calls, [1])
    })

    it('還原不依LIFO順序時亦不留過期替身(堆疊: 生效者為最後設定且未還原者)', async function() {
        let r1 = wpw.setBrowserTypeForTest({ launch: async () => 'one' })
        let r2 = wpw.setBrowserTypeForTest({ launch: async () => 'two' })
        r1()
        assert.strict.deepStrictEqual(await wpw.launchChromium(), 'two')
        r2()
        //全部還原後無替身(回到真BrowserType)
        assert.strict.deepStrictEqual(getOverride(), null)
        let r3 = wpw.setBrowserTypeForTest({ launch: async () => 'three' })
        assert.strict.deepStrictEqual(await wpw.launchChromium(), 'three')
        r3()
    })

    it('fake之方法只讀一次(存取器讀次數＝1), 驗證與保存同一份', async function() {
        let n = 0
        let fake = {
            get launch() {
                n++
                return async () => 'once'
            },
        }
        let restore = wpw.setBrowserTypeForTest(fake)
        try {
            assert.strict.deepStrictEqual(await wpw.launchChromium(), 'once')
        }
        finally {
            restore()
        }
        assert.strict.deepStrictEqual(n, 1)
        let m = 0
        let bad = {
            get launch() {
                m++
                if (m > 1) {
                    throw new Error('second read')
                }
                return async () => 'x'
            },
        }
        let r2 = wpw.setBrowserTypeForTest(bad)
        r2()
        assert.strict.deepStrictEqual(m, 1)
    })

    it('next(o)之內層拒絕(E_ENV、E_PW_VERSION)原樣往外, 不被包成E_LAUNCH', async function() {
        let save = process.env.SELENIUM_REMOTE_URL
        let restore = wpw.setBrowserTypeForTest({
            launch: async (o, next) => {
                process.env.SELENIUM_REMOTE_URL = 'http://127.0.0.1:1'
                try {
                    return await next({ headless: true })
                }
                finally {
                    delete process.env.SELENIUM_REMOTE_URL
                }
            },
        })
        let logs = []
        try {
            await assert.rejects(wpw.launchChromium({ funLog: (l) => logs.push(l) }), (err) => err.code === 'E_ENV')
        }
        finally {
            restore()
            if (save !== undefined) {
                process.env.SELENIUM_REMOTE_URL = save
            }
        }
        //外層不再以launch-error重報(已正規化之錯誤原樣往外)
        assert.strict.deepStrictEqual(logs.filter((l) => l === 'launch-error'), [])
        let saveVer = pwState.coreVersion
        let restore2 = wpw.setBrowserTypeForTest({
            launch: async (o, next) => {
                pwState.coreVersion = '9.9.9'
                try {
                    return await next({})
                }
                finally {
                    pwState.coreVersion = saveVer
                }
            },
        })
        try {
            await assert.rejects(wpw.launchChromium(), (err) => err.code === 'E_PW_VERSION')
        }
        finally {
            restore2()
            pwState.coreVersion = saveVer
        }
    })

    it('合併後之回調(onTrace)改了SELENIUM_REMOTE_URL → 最後檢查E_ENV, 替身0次', async function() {
        let calls = 0
        let restore = wpw.setBrowserTypeForTest({
            launch: async () => {
                calls++
                return 'b'
            },
        })
        try {
            await assert.rejects(wpw.launchChromium({
                onTrace: (e) => {
                    if (e.type === 'launch-options') {
                        process.env.SELENIUM_REMOTE_URL = 'http://127.0.0.1:1'
                    }
                }
            }), (err) => err.code === 'E_ENV')
        }
        finally {
            delete process.env.SELENIUM_REMOTE_URL
            restore()
        }
        assert.strict.deepStrictEqual(calls, 0)
    })

    it('合併後之回調改了PLAYWRIGHT_LEGACY_SCREENSHOT → 依現值重新合併後才交給替身', async function() {
        let save = process.env.PLAYWRIGHT_LEGACY_SCREENSHOT
        delete process.env.PLAYWRIGHT_LEGACY_SCREENSHOT
        let seen = null
        let restore = wpw.setBrowserTypeForTest({
            launch: async (o) => {
                seen = o
                return 'b'
            },
        })
        try {
            await wpw.launchChromium({
                args: ['--enable-features=Foo'],
                onTrace: (e) => {
                    if (e.type === 'launch-options') {
                        process.env.PLAYWRIGHT_LEGACY_SCREENSHOT = '1'
                    }
                }
            })
        }
        finally {
            restore()
            if (save === undefined) {
                delete process.env.PLAYWRIGHT_LEGACY_SCREENSHOT
            }
            else {
                process.env.PLAYWRIGHT_LEGACY_SCREENSHOT = save
            }
        }
        //legacy時Playwright不給預設enable: 合併結果只有呼叫端之Foo, 且不ignore預設enable串
        assert.strict.deepStrictEqual(findSwitches(seen.args, 'enable-features'), ['--enable-features=Foo'])
        assert.strict.deepStrictEqual(seen.ignoreDefaultArgs, [defDisStr()])
    })

    it('cloneOpt: 一般物件與陣列深複製(替身改寫巢狀值不影響next()之選項), 函數以參照保留', function() {
        let f = () => {}
        let src = { args: ['--a'], env: { A: '1', nested: { B: [1, 2] } }, proxy: { server: 'x' }, logger: { log: f } }
        let c = cloneOpt(src)
        c.env.A = '2'
        c.env.nested.B.push(3)
        c.proxy.server = 'y'
        assert.strict.deepStrictEqual(src.env.A, '1')
        assert.strict.deepStrictEqual(src.env.nested.B, [1, 2])
        assert.strict.deepStrictEqual(src.proxy.server, 'x')
        assert.strict.deepStrictEqual(c.logger.log, f)
    })

    it('onTrace: launch-options事件(不含值)', async function() {
        let evs = []
        let restore = wpw.setBrowserTypeForTest({ launch: async () => 'b' })
        try {
            await wpw.launchChromium({ args: ['--lang=en-US'], onTrace: (e) => evs.push(e) })
            await wpw.launchChromium({
                channel: 'msedge',
                onTrace: () => {
                    throw new Error('trace error')
                }
            })
            await wpw.launchChromium({
                onTrace: async () => {
                    throw new Error('trace rejection')
                }
            })
        }
        finally {
            restore()
        }
        assert.strict.deepStrictEqual(evs.length, 1)
        assert.strict.deepStrictEqual(Object.isFrozen(evs[0]), true)
        assert.strict.deepStrictEqual({ ...evs[0] }, { type: 'launch-options', fn: 'launchChromium', nArgs: 2, nDisable: pwDefaults.disableFeatures.length + 1, nEnable: -1, tableMatch: true, kind: 'headless-shell' })
    })

})
