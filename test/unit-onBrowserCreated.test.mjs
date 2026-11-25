import assert from 'assert'
import wpw from '../src/WPlaywright.mjs'
import { getHooks, withHooks, launchWithInstall } from '../src/_launchCore.mjs'
import { isOwnErr } from '../src/_check.mjs'
import { muteSysLang } from './tools/sysLang.mjs'


//unit-onBrowserCreated: 啟動後鉤子(R-PW-HOOK)之介面與行為; 以setBrowserTypeForTest之替身回傳哨兵物件, 不啟動瀏覽器
//真瀏覽器(兩個入口各一, 失敗時已關閉)於api-onBrowserCreated
//同步一律以事件(deferred)為準, 不以延時: 「鉤子未完成前啟動不resolve」「前一個鉤子未完成前下一個不開始」之否定斷言前僅讓出一次事件迴圈(setImmediate)


function defer() {
    let doResolve = null
    let doReject = null
    let p = new Promise((resolve, reject) => {
        doResolve = resolve
        doReject = reject
    })
    return { p, resolve: doResolve, reject: doReject }
}

//flush, 讓出一次事件迴圈(使已可進行之microtask與I/O回調先跑完, 供否定斷言)
function flush() {
    return new Promise((resolve) => setImmediate(resolve))
}

//mkTarget, 哨兵瀏覽器: close記錄呼叫並可延後
function mkTarget(name, log, closeDelay = false) {
    let t = {
        name,
        closeCalls: 0,
        close: async () => {
            t.closeCalls++
            if (log) {
                log.push(name + ':close-start')
            }
            if (closeDelay) {
                await flush()
            }
            if (log) {
                log.push(name + ':close-end')
            }
        },
    }
    return t
}

//errMissing, Playwright 1.65.1原文(缺少瀏覽器執行檔)
let errMissing = () => new Error('Executable doesn\'t exist at C:\\ms-playwright\\chromium_headless_shell-1255\\chrome-headless-shell.exe\nLooks like Playwright was just installed or updated.')


describe('unit-onBrowserCreated', function() {

    let saveGuard
    let restoreLang
    let restores = []
    before(function() {
        restoreLang = muteSysLang()
        saveGuard = process.env.W_PLAYWRIGHT_LOGON_GUARD
        delete process.env.W_PLAYWRIGHT_LOGON_GUARD
    })
    after(function() {
        restoreLang()
        if (saveGuard !== undefined) {
            process.env.W_PLAYWRIGHT_LOGON_GUARD = saveGuard
        }
    })
    afterEach(function() {
        //各案自行還原; 此處為保險, 並斷言無鉤子殘留(殘留會污染其他案)
        for (let r of restores) {
            r()
        }
        restores = []
        assert.strict.deepStrictEqual(getHooks().length, 0)
    })

    //reg, 註冊並記錄還原函數(afterEach保險用)
    function reg(hook) {
        let r = wpw.onBrowserCreated(hook)
        restores.push(r)
        return r
    }

    it('R-PW-HOOK 01: hook須為函數, 否則同步throw E_ARG(固定詞彙); 函數(含async)回還原函數, 無殘留', function() {
        class C {
            run() {}
        }
        let bads = [undefined, null, 1, 'x', true, [], {}, { hook: () => {} }, Symbol('s'), new C()]
        for (let b of bads) {
            assert.throws(() => wpw.onBrowserCreated(b), (err) => err.code === 'E_ARG' && err.message === 'invalid hook: must be a function' && isOwnErr(err))
        }
        let rv = Proxy.revocable({}, {})
        rv.revoke()
        assert.throws(() => wpw.onBrowserCreated(rv.proxy), (err) => err.code === 'E_ARG')
        assert.strict.deepStrictEqual(getHooks().length, 0)
        for (let f of [() => {}, async () => {}, function() {}, async function() {}]) {
            let r = wpw.onBrowserCreated(f)
            assert.strict.deepStrictEqual(typeof r, 'function')
            assert.strict.deepStrictEqual(getHooks().length, 1)
            r()
            assert.strict.deepStrictEqual(getHooks().length, 0)
        }
    })

    it('R-PW-HOOK 02: 兩個入口皆於回傳前對最終回傳者呼叫一次(target為同一物件, info凍結為{ fn, kind }), 啟動不早於鉤子完成', async function() {
        let t1 = mkTarget('b')
        let t2 = mkTarget('c')
        let restoreFake = wpw.setBrowserTypeForTest({
            launch: async () => t1,
            launchPersistentContext: async () => t2,
        })
        try {
            let seen = []
            let gate = defer()
            let started = defer()
            reg(async (target, info) => {
                seen.push({ target, info })
                started.resolve()
                await gate.p
            })
            let settled = false
            let pr = wpw.launchChromium({ headless: true }).then((v) => {
                settled = true
                return v
            })
            await started.p
            await flush()
            assert.strict.deepStrictEqual(settled, false, '鉤子未完成前啟動不得resolve')
            gate.resolve()
            assert.ok((await pr) === t1)
            assert.ok((await wpw.launchChromiumPersistent('', { headless: true })) === t2)
            assert.strict.deepStrictEqual(seen.length, 2)
            assert.ok(seen[0].target === t1)
            assert.ok(seen[1].target === t2)
            assert.strict.deepStrictEqual({ ...seen[0].info }, { fn: 'launchChromium', kind: 'browser' })
            assert.strict.deepStrictEqual({ ...seen[1].info }, { fn: 'launchChromiumPersistent', kind: 'persistent' })
            assert.ok(Object.isFrozen(seen[0].info))
        }
        finally {
            restoreFake()
        }
    })

    it('R-PW-HOOK 03: 疊放: 依註冊順序串行(前一個完成後才開始下一個), 全部皆生效', async function() {
        let t = mkTarget('b')
        let restoreFake = wpw.setBrowserTypeForTest({ launch: async () => t })
        try {
            let order = []
            let gateA = defer()
            let startedA = defer()
            reg(async () => {
                order.push('A-start')
                startedA.resolve()
                await gateA.p
                order.push('A-end')
            })
            reg(async () => {
                order.push('B-start')
            })
            reg(() => {
                order.push('C-start')
            })
            let pr = wpw.launchChromium()
            await startedA.p
            await flush()
            assert.strict.deepStrictEqual(order, ['A-start'], 'A完成前B不得開始')
            gateA.resolve()
            await pr
            assert.strict.deepStrictEqual(order, ['A-start', 'A-end', 'B-start', 'C-start'])
        }
        finally {
            restoreFake()
        }
    })

    it('R-PW-HOOK 04: 還原函數只移除自己那一份(不論還原順序), 重複呼叫無作用; 同一函數註冊兩次呼叫兩次', async function() {
        let t = mkTarget('b')
        let restoreFake = wpw.setBrowserTypeForTest({ launch: async () => t })
        try {
            let calls = []
            let ra = wpw.onBrowserCreated(() => calls.push('a'))
            let rb = wpw.onBrowserCreated(() => calls.push('b'))
            let rc = wpw.onBrowserCreated(() => calls.push('c'))
            //不依序還原: 先還原中間者
            rb()
            rb() //重複呼叫無作用(不得誤移除他人)
            await wpw.launchChromium()
            assert.strict.deepStrictEqual(calls, ['a', 'c'])
            calls.length = 0
            ra()
            await wpw.launchChromium()
            assert.strict.deepStrictEqual(calls, ['c'])
            rc()
            calls.length = 0
            await wpw.launchChromium()
            assert.strict.deepStrictEqual(calls, [])
            assert.strict.deepStrictEqual(getHooks().length, 0)
            //同一函數註冊兩次
            let f = () => calls.push('f')
            let r1 = wpw.onBrowserCreated(f)
            let r2 = wpw.onBrowserCreated(f)
            await wpw.launchChromium()
            assert.strict.deepStrictEqual(calls, ['f', 'f'])
            r1()
            r1()
            calls.length = 0
            await wpw.launchChromium()
            assert.strict.deepStrictEqual(calls, ['f'])
            r2()
        }
        finally {
            restoreFake()
        }
    })

    it('R-PW-HOOK 05: 與setBrowserTypeForTest正交: 自設替身時鉤子仍生效; 兩層替身只有頂層被呼叫(替換)而鉤子只一次(疊放); 還原替身後鉤子仍在', async function() {
        let calls = []
        let tb = mkTarget('bottom')
        let tt = mkTarget('top')
        reg((target) => calls.push(target.name))
        let r1 = wpw.setBrowserTypeForTest({
            launch: async () => {
                calls.push('fake-bottom')
                return tb
            },
        })
        let r2 = wpw.setBrowserTypeForTest({
            launch: async () => {
                calls.push('fake-top')
                return tt
            },
        })
        try {
            assert.ok((await wpw.launchChromium()) === tt)
            assert.strict.deepStrictEqual(calls, ['fake-top', 'top'])
            calls.length = 0
            r2()
            assert.ok((await wpw.launchChromium()) === tb)
            assert.strict.deepStrictEqual(calls, ['fake-bottom', 'bottom'])
        }
        finally {
            r2()
            r1()
        }
    })

    it('R-PW-HOOK 06: 鉤子之回傳值忽略(不取代target); 無鉤子時回傳與錯誤不變; 啟動失敗時不呼叫鉤子', async function() {
        let t = mkTarget('b')
        let other = mkTarget('other')
        let n = 0
        let restoreFake = wpw.setBrowserTypeForTest({
            launch: async () => {
                if (n++ === 0) {
                    return t
                }
                throw new Error('boom')
            },
        })
        try {
            //無鉤子
            assert.ok((await wpw.launchChromium()) === t)
            let called = 0
            reg(async () => {
                called++
                return other
            })
            //啟動失敗(第2次): E_LAUNCH原樣、鉤子不呼叫
            await assert.rejects(wpw.launchChromium(), (err) => err.code === 'E_LAUNCH')
            assert.strict.deepStrictEqual(called, 0)
            n = 0
            assert.ok((await wpw.launchChromium()) === t, '鉤子回傳另一物件亦不取代target')
            assert.strict.deepStrictEqual(called, 1)
        }
        finally {
            restoreFake()
        }
    })

    it('R-PW-HOOK 07: 鉤子拋錯或reject: 先關閉瀏覽器(關閉完成後才reject)、後續鉤子不執行、E_LAUNCH_HOOK固定詞彙(無cause)、原錯誤與序號只交funLog、已執行者不回滾', async function() {
        let forms = [
            ['同步throw', () => {
                throw new Error('SECRET-HOOK-1')
            }],
            ['async reject', async () => {
                throw new Error('SECRET-HOOK-2')
            }],
            ['throw非Error', () => {
                throw 'SECRET-HOOK-3' // eslint-disable-line no-throw-literal
            }],
            ['reject非Error', () => Promise.reject(undefined)],
        ]
        for (let [name, bad] of forms) {
            let log = []
            let t = mkTarget('b', log, true)
            let restoreFake = wpw.setBrowserTypeForTest({ launch: async () => t })
            try {
                let logs = []
                let ran = []
                reg(() => {
                    ran.push('first')
                })
                reg(bad)
                reg(() => {
                    ran.push('third')
                })
                await assert.rejects(wpw.launchChromium({ funLog: (label, safe, detail) => logs.push({ label, safe, detail }) }).catch((err) => {
                    log.push('rejected')
                    throw err
                }), (err) => {
                    assert.strict.deepStrictEqual(err.code, 'E_LAUNCH_HOOK', name)
                    assert.strict.deepStrictEqual(err.message, 'browser launch hook failed', name)
                    assert.strict.deepStrictEqual(err.cause, undefined, name)
                    assert.ok(isOwnErr(err), name)
                    assert.ok(!String(err.message).includes('SECRET'), name)
                    return true
                })
                assert.strict.deepStrictEqual(t.closeCalls, 1, name)
                assert.strict.deepStrictEqual(log, ['b:close-start', 'b:close-end', 'rejected'], name + ': reject須在關閉完成之後')
                assert.strict.deepStrictEqual(ran, ['first'], name + ': 前一個已執行不回滾、後一個不執行')
                assert.strict.deepStrictEqual(logs.length, 1, name)
                assert.strict.deepStrictEqual(logs[0].label, 'hook-error')
                assert.strict.deepStrictEqual({ ...logs[0].safe }, { fn: 'launchChromium', index: 1, code: 'E_LAUNCH_HOOK' })
                assert.ok(Object.isFrozen(logs[0].safe))
                if (name === '同步throw' || name === 'async reject') {
                    assert.ok(logs[0].detail instanceof Error && logs[0].detail.message.startsWith('SECRET-HOOK-'), name)
                }
                else if (name === 'throw非Error') {
                    assert.strict.deepStrictEqual(logs[0].detail, 'SECRET-HOOK-3')
                }
                else {
                    assert.strict.deepStrictEqual(logs[0].detail, undefined)
                }
            }
            finally {
                restoreFake()
                for (let r of restores) {
                    r()
                }
                restores = []
            }
        }
    })

    it('R-PW-HOOK 08: 關閉時拋錯、target無close(非瀏覽器之替身回傳)皆不影響E_LAUNCH_HOOK; 持久入口同樣先關閉', async function() {
        let t = mkTarget('c')
        t.close = async () => {
            t.closeCalls++
            throw new Error('close failed')
        }
        let restoreFake = wpw.setBrowserTypeForTest({
            launch: async () => 'no-close-string',
            launchPersistentContext: async () => t,
        })
        try {
            reg(() => {
                throw new Error('x')
            })
            await assert.rejects(wpw.launchChromium(), (err) => err.code === 'E_LAUNCH_HOOK')
            await assert.rejects(wpw.launchChromiumPersistent(''), (err) => err.code === 'E_LAUNCH_HOOK')
            assert.strict.deepStrictEqual(t.closeCalls, 1)
        }
        finally {
            restoreFake()
        }
    })

    it('R-PW-HOOK 09: onTrace: 每個鉤子完成後browser-hook({ fn, index }), 失敗browser-hook-failed({ fn, index, code }); 事件凍結; 回調拋錯與rejection不影響', async function() {
        let t = mkTarget('b')
        let restoreFake = wpw.setBrowserTypeForTest({ launch: async () => t, launchPersistentContext: async () => t })
        try {
            let evs = []
            reg(() => {})
            reg(async () => {})
            await wpw.launchChromium({ onTrace: (e) => evs.push(e) })
            await wpw.launchChromiumPersistent('', { onTrace: (e) => evs.push(e) })
            let hookEvs = evs.filter((e) => e.type.startsWith('browser-hook'))
            assert.strict.deepStrictEqual(hookEvs.map((e) => ({ ...e })), [
                { type: 'browser-hook', fn: 'launchChromium', index: 0 },
                { type: 'browser-hook', fn: 'launchChromium', index: 1 },
                { type: 'browser-hook', fn: 'launchChromiumPersistent', index: 0 },
                { type: 'browser-hook', fn: 'launchChromiumPersistent', index: 1 },
            ])
            assert.ok(hookEvs.every((e) => Object.isFrozen(e)))
            //回調拋錯與rejection不影響
            assert.ok((await wpw.launchChromium({
                onTrace: () => {
                    throw new Error('x')
                }
            })) === t)
            assert.ok((await wpw.launchChromium({
                onTrace: async () => {
                    throw new Error('y')
                }
            })) === t)
            //失敗事件
            for (let r of restores) {
                r()
            }
            restores = []
            let evs2 = []
            reg(() => {})
            reg(() => {
                throw new Error('z')
            })
            await assert.rejects(wpw.launchChromium({ onTrace: (e) => evs2.push(e) }), (err) => err.code === 'E_LAUNCH_HOOK')
            let h2 = evs2.filter((e) => e.type.startsWith('browser-hook'))
            assert.strict.deepStrictEqual(h2.map((e) => ({ ...e })), [
                { type: 'browser-hook', fn: 'launchChromium', index: 0 },
                { type: 'browser-hook-failed', fn: 'launchChromium', index: 1, code: 'E_LAUNCH_HOOK' },
            ])
        }
        finally {
            restoreFake()
        }
    })

    it('R-PW-HOOK 10: 啟動之快照: 啟動進行中(替身內)才註冊者不影響該次、才還原者該次仍執行; 下一次啟動依新狀態', async function() {
        let t = mkTarget('b')
        let calls = []
        let restoreY = null
        let restoreX = null
        let restoreFake = wpw.setBrowserTypeForTest({
            launch: async () => {
                if (restoreX === null) {
                    restoreX = reg(() => calls.push('X'))
                    restoreY()
                }
                return t
            },
        })
        try {
            restoreY = reg(() => calls.push('Y'))
            await wpw.launchChromium()
            assert.strict.deepStrictEqual(calls, ['Y'], '該次只執行啟動開始時已註冊者')
            calls.length = 0
            await wpw.launchChromium()
            assert.strict.deepStrictEqual(calls, ['X'], '下一次依新狀態: Y已還原、X已註冊')
        }
        finally {
            restoreFake()
        }
    })

    it('R-PW-HOOK 10b: 快照於呼叫當下(兩個入口各自驗): 於prepare內之回調(onTrace)才註冊者不影響該次、才還原者該次仍執行', async function() {
        let t = mkTarget('b')
        let restoreFake = wpw.setBrowserTypeForTest({ launch: async () => t, launchPersistentContext: async () => t })
        try {
            for (let persistent of [false, true]) {
                let calls = []
                let restoreX = null
                let restoreY = reg(() => calls.push('Y'))
                let go = (onTrace) => (persistent ? wpw.launchChromiumPersistent('', { onTrace }) : wpw.launchChromium({ onTrace }))
                await go((e) => {
                    if (e.type === 'launch-options' && restoreX === null) {
                        restoreX = reg(() => calls.push('X'))
                        restoreY()
                    }
                })
                assert.strict.deepStrictEqual(calls, ['Y'], '該次以呼叫當下之快照為準: ' + persistent)
                calls.length = 0
                await go(undefined)
                assert.strict.deepStrictEqual(calls, ['X'], String(persistent))
                for (let r of restores) {
                    r()
                }
                restores = []
            }
        }
        finally {
            restoreFake()
        }
    })

    it('R-PW-HOOK 11: autoInstall安裝後再啟動: 失敗之嘗試不呼叫鉤子、對最終成功者只一次; 安裝失敗則不呼叫(withHooks包住launchWithInstall)', async function() {
        let installs = []
        let mkRun = (seq, installFail) => {
            let i = 0
            let launch = async () => {
                let r = seq[Math.min(i, seq.length - 1)]
                i++
                if (r instanceof Error) {
                    throw r
                }
                return r
            }
            let deps = {
                platform: 'win32',
                runInstall: async (kind) => {
                    installs.push(kind)
                    if (installFail) {
                        let e = new Error('browser installation failed with exit code 1')
                        e.code = 'E_INSTALL'
                        throw e
                    }
                    return { kind }
                },
            }
            return () => launchWithInstall({ headless: true }, { fn: 'launchChromium', autoInstall: true, installDeps: false, funLog: null, onTrace: null }, launch, deps)
        }
        let seen = []
        reg((target) => seen.push(target))
        let st = { fn: 'launchChromium', funLog: null, onTrace: null }
        let tgt = mkTarget('b')
        let out = await withHooks(mkRun([errMissing(), tgt], false), getHooks(), st, 'launchChromium', 'browser')
        assert.ok(out === tgt)
        assert.strict.deepStrictEqual(installs, ['headless-shell'])
        assert.strict.deepStrictEqual(seen.length, 1, '失敗之嘗試不產生瀏覽器, 鉤子對最終成功者只一次')
        assert.ok(seen[0] === tgt)
        //安裝失敗: 啟動未成功, 鉤子不呼叫
        seen.length = 0
        await assert.rejects(withHooks(mkRun([errMissing(), tgt], true), getHooks(), st, 'launchChromium', 'browser'), (err) => err.code === 'E_INSTALL')
        assert.strict.deepStrictEqual(seen.length, 0)
    })

    it('R-PW-HOOK 12: 兩個入口與主檔匯出: onBrowserCreated為函數, 與setBrowserTypeForTest同為主檔屬性', function() {
        assert.strict.deepStrictEqual(typeof wpw.onBrowserCreated, 'function')
        assert.strict.deepStrictEqual(typeof wpw.setBrowserTypeForTest, 'function')
    })

})
