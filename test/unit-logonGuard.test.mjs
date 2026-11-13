import assert from 'assert'
import wpw from '../src/WPlaywright.mjs'
import { isLogonGuardOn, isLocalAccount, checkLogonGuard, parseOutput, readBadPasswordAttempts, logonState, getWsfPath } from '../src/_logonGuard.mjs'
import { getManagedShellPath } from '../src/_pw.mjs'
import { withLogonLock } from '../src/_launchCore.mjs'


//unit-logonGuard: 執行期登入守門(主控裁示4: W_PLAYWRIGHT_LOGON_GUARD開啟時, 每次啟動非headless shell前讀BadPasswordAttempts, ≥1或讀不到即拒絕E_LOGON_GUARD)
//讀取器以注入替身驗判斷; 真讀取(唯讀, cscript)一案驗接縫; 不啟動瀏覽器


describe('unit-logonGuard', function() {

    let saveEnv
    beforeEach(function() {
        saveEnv = process.env.W_PLAYWRIGHT_LOGON_GUARD
        delete process.env.W_PLAYWRIGHT_LOGON_GUARD
        logonState.read = null
    })
    afterEach(function() {
        if (saveEnv === undefined) {
            delete process.env.W_PLAYWRIGHT_LOGON_GUARD
        }
        else {
            process.env.W_PLAYWRIGHT_LOGON_GUARD = saveEnv
        }
        logonState.read = null
    })

    it('開關: 未設、空字串、0、false(精確值)為關; 1與其他值(含前後空白之0、false)為開(原則3遇歧義收嚴)', function() {
        let off = [undefined, '', '0', 'false']
        let on = ['1', 'true', 'yes', '2', 'TRUE', ' 0 ', 'false ', ' ', 'FALSE']
        for (let v of off) {
            assert.strict.deepStrictEqual(isLogonGuardOn(v === undefined ? {} : { W_PLAYWRIGHT_LOGON_GUARD: v }), false, String(v))
        }
        for (let v of on) {
            assert.strict.deepStrictEqual(isLogonGuardOn({ W_PLAYWRIGHT_LOGON_GUARD: v }), true, v)
        }
    })

    it('checkLogonGuard: 關→不讀; headless shell→不讀; 其餘種類讀取, 0放行, ≥1、已鎖、讀不到、讀取拋錯→E_LOGON_GUARD', async function() {
        let n = 0
        let mk = (r) => async () => {
            n++
            if (r instanceof Error) {
                throw r
            }
            return r
        }
        let envOn = { W_PLAYWRIGHT_LOGON_GUARD: '1' }
        n = 0
        assert.strict.deepStrictEqual(await checkLogonGuard('chrome', { env: {}, read: mk({ ok: true, bad: 5, locked: false }) }), { checked: false })
        assert.strict.deepStrictEqual(n, 0)
        assert.strict.deepStrictEqual(await checkLogonGuard('headless-shell', { env: envOn, read: mk({ ok: true, bad: 5, locked: false }) }), { checked: false })
        assert.strict.deepStrictEqual(n, 0)
        for (let kind of ['chrome', 'chromium', 'msedge', 'executable', 'chrome-for-testing']) {
            assert.strict.deepStrictEqual(await checkLogonGuard(kind, { env: envOn, read: mk({ ok: true, bad: 0, locked: false }) }), { checked: true })
        }
        let rejects = [
            [{ ok: true, bad: 1, locked: false }, 'logon guard: bad password attempts not zero, launch refused'],
            [{ ok: true, bad: 0, locked: true }, 'logon guard: bad password attempts not zero, launch refused'],
            [{ ok: false, bad: -1, locked: null }, 'logon guard: bad password attempts unreadable, launch refused'],
            [null, 'logon guard: bad password attempts unreadable, launch refused'],
            [new Error('x'), 'logon guard: bad password attempts unreadable, launch refused'],
        ]
        for (let [r, msg] of rejects) {
            await assert.rejects(checkLogonGuard('chrome', { env: envOn, read: mk(r) }), (err) => err.code === 'E_LOGON_GUARD' && err.message === msg)
        }
    })

    it('接線: 兩入口於開啟時依種類讀取; 拒絕時替身0次並發logon-reject', async function() {
        process.env.W_PLAYWRIGHT_LOGON_GUARD = '1'
        let reads = 0
        let bad = 1
        logonState.read = async () => {
            reads++
            return { ok: true, bad, locked: false }
        }
        let calls = 0
        let restore = wpw.setBrowserTypeForTest({
            launch: async () => {
                calls++
                return 'b'
            },
            launchPersistentContext: async () => {
                calls++
                return 'c'
            },
        })
        try {
            //headless shell(預設無頭、未給通道; 或executablePath為Playwright受管之shell)不讀
            assert.strict.deepStrictEqual(await wpw.launchChromium(), 'b')
            assert.ok(getManagedShellPath().length > 0)
            assert.strict.deepStrictEqual(await wpw.launchChromium({ executablePath: getManagedShellPath() }), 'b')
            assert.strict.deepStrictEqual(reads, 0)
            //非headless shell: chrome、msedge、chromium(有頭)、自訂執行檔(含檔名同為chrome-headless-shell之他檔) → 讀到1即拒絕
            let evs = []
            let cases = [
                () => wpw.launchChromium({ channel: 'chrome', onTrace: (e) => evs.push(e) }),
                () => wpw.launchChromium({ channel: 'msedge' }),
                () => wpw.launchChromium({ headless: false }),
                () => wpw.launchChromium({ executablePath: 'C:\\x\\chrome.exe' }),
                () => wpw.launchChromium({ executablePath: 'C:\\renamed\\chrome-headless-shell.exe' }),
                () => wpw.launchChromiumPersistent('', { channel: 'chrome' }),
                () => wpw.launchChromiumPersistent('', { headless: false }),
            ]
            for (let f of cases) {
                await assert.rejects(f(), (err) => err.code === 'E_LOGON_GUARD')
            }
            assert.strict.deepStrictEqual(reads, cases.length)
            assert.strict.deepStrictEqual(calls, 2)
            assert.strict.deepStrictEqual(evs.map((e) => e.type), ['logon-reject'])
            assert.strict.deepStrictEqual(evs[0].kind, 'chrome')
            //讀到0即放行
            bad = 0
            assert.strict.deepStrictEqual(await wpw.launchChromium({ channel: 'chrome' }), 'b')
            assert.strict.deepStrictEqual(await wpw.launchChromiumPersistent('', { channel: 'chrome' }), 'c')
        }
        finally {
            restore()
        }
    })

    it('每次真啟動前重讀(替身之next()): 第一次讀0放行替身, next()時讀到1即E_LOGON_GUARD, 不呼叫真BrowserType', async function() {
        process.env.W_PLAYWRIGHT_LOGON_GUARD = '1'
        let seq = [0, 1]
        let reads = 0
        logonState.read = async () => {
            let b = seq[Math.min(reads, seq.length - 1)]
            reads++
            return { ok: true, bad: b, locked: false }
        }
        let fakeCalls = 0
        let restore = wpw.setBrowserTypeForTest({
            launch: async (o, next) => {
                fakeCalls++
                return next()
            },
        })
        try {
            //安全: executablePath指向不存在之檔, 即使守門失效, Playwright亦於啟動前以缺檔失敗, 不起任何瀏覽器
            await assert.rejects(wpw.launchChromium({ executablePath: 'C:\\nonexistent-wpw\\chrome.exe' }), (err) => err.code === 'E_LOGON_GUARD')
        }
        finally {
            restore()
        }
        assert.strict.deepStrictEqual(fakeCalls, 1)
        assert.strict.deepStrictEqual(reads, 2)
    })

    it('行程內序列化: 開啟且非headless shell時, 後一個啟動待前一個結束才開始; headless shell或關閉時不序列化', async function() {
        let order = []
        let gate = null
        let mk = (name) => () => new Promise((resolve) => {
            order.push(name + '-start')
            gate = () => {
                order.push(name + '-end')
                resolve(name)
            }
        })
        process.env.W_PLAYWRIGHT_LOGON_GUARD = '1'
        let p1 = withLogonLock('chrome', mk('a'))
        let p2 = withLogonLock('msedge', mk('b'))
        await new Promise((resolve) => setImmediate(resolve))
        assert.strict.deepStrictEqual(order, ['a-start'])
        gate()
        await p1
        await new Promise((resolve) => setImmediate(resolve))
        assert.strict.deepStrictEqual(order, ['a-start', 'a-end', 'b-start'])
        gate()
        await p2
        //headless shell不序列化
        order = []
        let gates = []
        let mk2 = (name) => () => new Promise((resolve) => {
            order.push(name)
            gates.push(resolve)
        })
        let q1 = withLogonLock('headless-shell', mk2('x'))
        let q2 = withLogonLock('headless-shell', mk2('y'))
        assert.strict.deepStrictEqual(order, ['x', 'y'])
        gates.forEach((g) => g())
        await Promise.all([q1, q2])
    })

    it('目前行程之帳號須為本機帳號(USERDOMAIN＝COMPUTERNAME), 網域帳號或無法判定者讀不到(不執行cscript)', async function() {
        assert.strict.deepStrictEqual(isLocalAccount({ USERDOMAIN: 'pc1', COMPUTERNAME: 'PC1' }), true)
        for (let env of [{ USERDOMAIN: 'CORP', COMPUTERNAME: 'PC1' }, { COMPUTERNAME: 'PC1' }, { USERDOMAIN: 'PC1' }, {}, { USERDOMAIN: '', COMPUTERNAME: '' }]) {
            assert.strict.deepStrictEqual(isLocalAccount(env), false, JSON.stringify(env))
            let n = 0
            let ef = (file, args, opt, cb) => {
                n++
                cb(null, '{"bad":0,"locked":false}')
            }
            let r = await readBadPasswordAttempts({}, { platform: 'win32', execFile: ef, wsf: 'C:\\w.wsf', env })
            assert.strict.deepStrictEqual(r.ok, false)
            assert.strict.deepStrictEqual(n, 0)
        }
    })

    it('parseOutput: 只收非負安全整數與布林', function() {
        assert.strict.deepStrictEqual(parseOutput('{"bad":0,"locked":false}\r\n'), { ok: true, bad: 0, locked: false })
        assert.strict.deepStrictEqual(parseOutput('x\n{"bad":2,"locked":true}'), { ok: true, bad: 2, locked: true })
        for (let s of ['', 'x', '{"bad":-1,"locked":-1}', '{"bad":"0","locked":false}', '{"bad":0.5,"locked":false}', '{"bad":0,"locked":"false"}', 'null', '[]']) {
            assert.strict.deepStrictEqual(parseOutput(s).ok, false, s)
        }
    })

    it('readBadPasswordAttempts: 參數、windowsHide與失敗時ok為false(注入execFile)', async function() {
        let seen = []
        let ef = (file, args, opt, cb) => {
            seen.push({ file, args, opt })
            cb(null, '{"bad":0,"locked":false}\r\n')
        }
        let r = await readBadPasswordAttempts({ username: 'alice' }, { platform: 'win32', execFile: ef, wsf: 'C:\\w.wsf', cscript: 'C:\\cscript.exe' })
        assert.strict.deepStrictEqual(r, { ok: true, bad: 0, locked: false })
        assert.strict.deepStrictEqual(seen[0].file, 'C:\\cscript.exe')
        assert.strict.deepStrictEqual(seen[0].args, ['//nologo', 'C:\\w.wsf', 'alice'])
        assert.strict.deepStrictEqual(seen[0].opt.windowsHide, true)
        //非Windows、帳號名含ADSI路徑字元、找不到wsf、子行程失敗 → ok false且不執行(前三者)
        seen = []
        assert.strict.deepStrictEqual((await readBadPasswordAttempts({ username: 'alice' }, { platform: 'linux', execFile: ef, wsf: 'C:\\w.wsf' })).ok, false)
        for (let u of ['a,b', 'a/b', 'a\\b', 'a:b', 'a\nb']) {
            assert.strict.deepStrictEqual((await readBadPasswordAttempts({ username: u }, { platform: 'win32', execFile: ef, wsf: 'C:\\w.wsf' })).ok, false, u)
        }
        assert.strict.deepStrictEqual((await readBadPasswordAttempts({ username: 'alice' }, { platform: 'win32', execFile: ef, wsf: '' })).ok, false)
        assert.strict.deepStrictEqual(seen.length, 0)
        let efErr = (file, args, opt, cb) => cb(new Error('fail'), '')
        assert.strict.deepStrictEqual((await readBadPasswordAttempts({ username: 'alice' }, { platform: 'win32', execFile: efErr, wsf: 'C:\\w.wsf' })).ok, false)
    })

    it('readBadPassword.wsf存在且可找到(src內執行)', function() {
        assert.ok(getWsfPath().endsWith('readBadPassword.wsf'))
    })

    it('真讀取(唯讀, Windows): 目前使用者之錯誤次數為非負整數', async function() {
        if (process.platform !== 'win32') {
            this.skip()
        }
        this.timeout(30000)
        let r = await readBadPasswordAttempts()
        assert.strict.deepStrictEqual(r.ok, true, JSON.stringify(r))
        assert.ok(Number.isSafeInteger(r.bad) && r.bad >= 0)
        assert.ok(r.locked === true || r.locked === false)
    })

})
