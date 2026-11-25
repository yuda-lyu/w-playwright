import fs from 'fs'
import path from 'path'
import assert from 'assert'
import { createRequire } from 'module'
import { mock } from 'node:test'
import wpw from '../src/WPlaywright.mjs'
import { INSTALL_BUDGET_MS, LAUNCH_TIMEOUT_MS, HOOK_MARGIN_MS, LAUNCH_HOOK_TIMEOUT_MS } from '../src/installBudget.mjs'
import { launchWithInstall } from '../src/_launchCore.mjs'
import { runInstall, budgetLeft, KILL_WAIT_MAX } from '../src/_install.mjs'
import { ensureChromiumCore } from '../src/ensureChromium.mjs'
import { parseLaunchOpt } from '../src/getChromiumLaunchOptions.mjs'
import { coreRoot } from '../src/_pw.mjs'
import { TIMER_MAX, _resetWarned } from '../src/_check.mjs'
import { fakeSpawn } from './tools/fakeSpawn.mjs'


//unit-installBudget: 安裝之整體預算(R-PW-BUDGET)——常數之取值與其依據(與Playwright原始碼一致)、autoInstall與ensureChromium之真實上限、兩次安裝共用預算、opt.installTimeout之檢測
//計時以node:test之mock.timers(假時鐘)驗證「恰於預算毫秒逾時」, 不以真實等待; 真實之安裝子行程(含他方持鎖時之等候)於api-installBudget
//不啟動瀏覽器、不下載


let require = createRequire(import.meta.url)

//errMissing、errDeps, Playwright 1.65.1原文(缺少瀏覽器執行檔、Linux缺少系統相依)
let errMissing = () => new Error('Executable doesn\'t exist at C:\\ms-playwright\\chromium_headless_shell-1255\\chrome-headless-shell.exe\nLooks like Playwright was just installed or updated.')
let errDeps = () => new Error('Host system is missing dependencies to run browsers.\nPlease install them with the following command:')

//flush, 讓出一次事件迴圈(setImmediate不受mock.timers影響)
function flush() {
    return new Promise((resolve) => setImmediate(resolve))
}

//until, 等到條件成立(以setImmediate輪流讓出, 不計時; 條件由被測物之事件決定, 不成立即永遠等, 由mocha逾時收掉)
async function until(fn) {
    while (!fn()) {
        await flush()
    }
}


describe('unit-installBudget', function() {

    afterEach(function() {
        mock.timers.reset()
    })

    describe('常數', function() {

        it('R-PW-BUDGET 01: INSTALL_BUDGET_MS＝15分鐘; LAUNCH_HOOK_TIMEOUT_MS＝預算＋結束子行程樹之等待上限＋啟動逾時＋餘裕(各項皆數字); 主檔匯出與內部同值', function() {
            assert.strict.deepStrictEqual(INSTALL_BUDGET_MS, 15 * 60 * 1000)
            assert.strict.deepStrictEqual(KILL_WAIT_MAX, 10000)
            assert.strict.deepStrictEqual(LAUNCH_TIMEOUT_MS, 180000)
            assert.strict.deepStrictEqual(HOOK_MARGIN_MS, 60000)
            assert.strict.deepStrictEqual(LAUNCH_HOOK_TIMEOUT_MS, INSTALL_BUDGET_MS + KILL_WAIT_MAX + LAUNCH_TIMEOUT_MS + HOOK_MARGIN_MS)
            assert.strict.deepStrictEqual(LAUNCH_HOOK_TIMEOUT_MS, 1150000)
            assert.ok(LAUNCH_HOOK_TIMEOUT_MS > INSTALL_BUDGET_MS && LAUNCH_HOOK_TIMEOUT_MS < TIMER_MAX)
            assert.strict.deepStrictEqual(wpw.INSTALL_BUDGET_MS, INSTALL_BUDGET_MS)
            assert.strict.deepStrictEqual(wpw.LAUNCH_HOOK_TIMEOUT_MS, LAUNCH_HOOK_TIMEOUT_MS)
        })

        it('R-PW-BUDGET 02: 與Playwright原始碼一致(靜態抽取, 升版時轉紅): 啟動逾時預設等於LAUNCH_TIMEOUT_MS; 安裝目錄鎖之等候總和(後到者之上限)小於預算', function() {
            let src = fs.readFileSync(path.join(coreRoot, 'lib', 'coreBundle.js'), 'utf8')
            let m1 = src.match(/DEFAULT_PLAYWRIGHT_LAUNCH_TIMEOUT = ([0-9 *.e]+);/)
            assert.ok(m1, '抽不到DEFAULT_PLAYWRIGHT_LAUNCH_TIMEOUT(Playwright升版後寫法改變, 須重新核對常數推導)')
            //抽到之為乘式(如'3 * 60 * 1e3'), 逐項相乘(不用eval)
            assert.strict.deepStrictEqual(m1[1].split('*').map((v) => Number(v.trim())).reduce((a, b) => a * b, 1), LAUNCH_TIMEOUT_MS)
            //安裝目錄鎖: lock(registryDirectory, { retries: { retries: N, factor: F }, ... })之退避(retry套件預設minTimeout 1000ms、不隨機)
            let m2 = src.match(/releaseLock = await lock\(registryDirectory, \{\s*retries: \{[\s\S]*?retries: (\d+),\s*factor: ([0-9.]+)/)
            assert.ok(m2, '抽不到安裝目錄鎖之retries設定(Playwright升版後寫法改變, 須重新核對並行等候之推導)')
            let { retry } = require(path.join(coreRoot, 'lib', 'utilsBundle.js'))
            let waits = retry.timeouts({ retries: Number(m2[1]), factor: Number(m2[2]) })
            let total = waits.reduce((a, b) => a + b, 0)
            //後到者等候之上限(約469.5秒)須在單次預算內: 並行時之等候已含於預算, 最壞仍為1倍而非2倍
            assert.ok(total > 60000 && total < INSTALL_BUDGET_MS, String(total))
            assert.ok(Math.abs(total - 469532) < 1000, String(total))
        })

    })

    describe('budgetLeft(整體預算之剩餘)', function() {

        it('R-PW-BUDGET 03: 不限(0以下、非數字)回0; 其餘回剩餘毫秒, 耗盡者回1(不得變成0＝不限)', function() {
            for (let total of [0, -1, NaN, undefined, null]) {
                assert.strict.deepStrictEqual(budgetLeft(total, 1000, () => 5000), 0, String(total))
            }
            assert.strict.deepStrictEqual(budgetLeft(10000, 1000, () => 1000), 10000)
            assert.strict.deepStrictEqual(budgetLeft(10000, 1000, () => 4000), 7000)
            assert.strict.deepStrictEqual(budgetLeft(10000, 1000, () => 11000), 1)
            assert.strict.deepStrictEqual(budgetLeft(10000, 1000, () => 99999), 1)
            //牆鐘倒退(現在早於起算時刻): 不得超過整體預算(TIMER_MAX為預算時, 超過會被Node改成1毫秒而立即逾時)
            assert.strict.deepStrictEqual(budgetLeft(10000, 5000, () => 1000), 10000)
            assert.strict.deepStrictEqual(budgetLeft(TIMER_MAX, 5000, () => 1000), TIMER_MAX)
        })

    })

    describe('autoInstall之整體上限(launchWithInstall)', function() {

        //mk, launch依序取seq之結果(為Error則拋出); runInstall記錄每次之(kind, timeout)並令受控之時鐘前進該次安裝之耗時(cost[kind]毫秒);
        //時鐘為受控之假時鐘(起於1000), 不用真實Date.now(兩次取時刻跨過毫秒界線會使剩餘毫秒少1而偶發失敗), 且不依賴實作取時刻之次數與順序
        function mk(seq, cost = {}) {
            let calls = { install: [] }
            let i = 0
            let launch = async () => {
                let r = seq[Math.min(i, seq.length - 1)]
                i++
                if (r instanceof Error) {
                    throw r
                }
                return r
            }
            let clock = { t: 1000 }
            let deps = {
                platform: 'linux',
                now: () => clock.t,
                runInstall: async (kind, st, timeout) => {
                    calls.install.push([kind, timeout])
                    clock.t += cost[kind] || 0
                    return { kind }
                },
            }
            return { launch, deps, calls }
        }

        let stBase = (o = {}) => ({ fn: 'launchChromium', autoInstall: true, installDeps: false, funLog: null, onTrace: null, ...o })

        it('R-PW-BUDGET 04: 安裝以預算為上限交runInstall: 未給用INSTALL_BUDGET_MS、給了用其值、0表不限', async function() {
            for (let [st, expected] of [[stBase(), INSTALL_BUDGET_MS], [stBase({ installTimeout: 5000 }), 5000], [stBase({ installTimeout: 0 }), 0]]) {
                let { launch, deps, calls } = mk([errMissing(), 'browser'])
                assert.strict.deepStrictEqual(await launchWithInstall({ headless: true }, st, launch, deps), 'browser')
                assert.strict.deepStrictEqual(calls.install, [['headless-shell', expected]], JSON.stringify(st.installTimeout))
            }
        })

        it('R-PW-BUDGET 05: 受管瀏覽器與系統相依兩次安裝共用一個預算(第二次得剩餘毫秒); 預算耗盡者交1(逾時而非不限); 不限者兩次皆0', async function() {
            //第一次安裝耗3000毫秒 → 第二次(deps)得剩餘10000-3000
            let a = mk([errMissing(), errDeps(), 'browser'], { 'headless-shell': 3000 })
            await launchWithInstall({ headless: true }, stBase({ installDeps: true, installTimeout: 10000 }), a.launch, a.deps)
            assert.strict.deepStrictEqual(a.calls.install, [['headless-shell', 10000], ['deps', 7000]])
            //耗盡(第一次安裝耗99999毫秒): 交1
            let b = mk([errMissing(), errDeps(), 'browser'], { 'headless-shell': 99999 })
            await launchWithInstall({ headless: true }, stBase({ installDeps: true, installTimeout: 10000 }), b.launch, b.deps)
            assert.strict.deepStrictEqual(b.calls.install, [['headless-shell', 10000], ['deps', 1]])
            //不限
            let c = mk([errMissing(), errDeps(), 'browser'], { 'headless-shell': 99999 })
            await launchWithInstall({ headless: true }, stBase({ installDeps: true, installTimeout: 0 }), c.launch, c.deps)
            assert.strict.deepStrictEqual(c.calls.install, [['headless-shell', 0], ['deps', 0]])
            //只缺系統相依(瀏覽器已在): 預算自該次安裝起算, 取得完整預算
            let d = mk([errDeps(), 'browser'])
            await launchWithInstall({ headless: true }, stBase({ installDeps: true, installTimeout: 10000 }), d.launch, d.deps)
            assert.strict.deepStrictEqual(d.calls.install, [['deps', 10000]])
        })

        it('R-PW-BUDGET 06: 預設之真實上限: 安裝子行程(替身, 不結束)於恰15分鐘逾時——差1毫秒仍進行; 逾時即結束子行程樹(taskkill)並以E_INSTALL reject, reject於結束之後', async function() {
            mock.timers.enable({ apis: ['setTimeout'] })
            let { sp, calls } = fakeSpawn([{ hang: true }])
            let evs = []
            let st = stBase({ onTrace: (e) => evs.push(e.type) })
            let n = 0
            let launch = async () => {
                if (n++ === 0) {
                    throw errMissing()
                }
                return 'browser'
            }
            let deps = { platform: 'win32', now: () => 0, runInstall: (kind, s, timeout) => runInstall(kind, s, timeout, { spawn: sp, platform: 'win32' }) }
            let settled = null
            let pr = launchWithInstall({ headless: true }, st, launch, deps).then((v) => {
                settled = { ok: v }
            }, (err) => {
                settled = { err }
            })
            await until(() => evs.includes('install-start'))
            mock.timers.tick(INSTALL_BUDGET_MS - 1)
            await flush()
            assert.strict.deepStrictEqual(settled, null, '預算未盡不得逾時')
            assert.ok(!calls.some((c) => c.file && c.file.toLowerCase().includes('taskkill')))
            mock.timers.tick(1)
            await until(() => calls.some((c) => c.file && c.file.toLowerCase().includes('taskkill')))
            await flush()
            assert.strict.deepStrictEqual(settled, null, '須待子行程樹結束後才reject')
            mock.timers.tick(30)
            await pr
            assert.ok(settled.err && settled.err.code === 'E_INSTALL' && settled.err.message === 'browser installation timed out', String(settled.err && settled.err.message))
            assert.ok(calls.some((c) => c.taskkillClosed === true))
            assert.strict.deepStrictEqual(evs, ['install-start', 'install-fail'])
        })

        it('R-PW-BUDGET 07: installTimeout:0(明確給0)才不限: 同樣不結束之子行程於TIMER_MAX之假時間內不逾時', async function() {
            mock.timers.enable({ apis: ['setTimeout'] })
            let { sp, cps } = fakeSpawn([{ hang: true }])
            let evs = []
            let st = stBase({ installTimeout: 0, onTrace: (e) => evs.push(e.type) })
            let n = 0
            let launch = async () => {
                if (n++ === 0) {
                    throw errMissing()
                }
                return 'browser'
            }
            let deps = { platform: 'win32', now: () => 0, runInstall: (kind, s, timeout) => runInstall(kind, s, timeout, { spawn: sp, platform: 'win32' }) }
            let settled = null
            let pr = launchWithInstall({ headless: true }, st, launch, deps).then((v) => {
                settled = { ok: v }
            }, (err) => {
                settled = { err }
            })
            await until(() => evs.includes('install-start'))
            mock.timers.tick(TIMER_MAX)
            await flush()
            assert.strict.deepStrictEqual(settled, null)
            cps[0].emit('close', 0)
            await pr
            assert.strict.deepStrictEqual(settled, { ok: 'browser' })
        })

    })

    describe('ensureChromium之預設上限', function() {

        it('R-PW-BUDGET 08: opt.timeout未給即INSTALL_BUDGET_MS(恰15分鐘逾時, 差1毫秒仍進行); 明確給0才不限', async function() {
            mock.timers.enable({ apis: ['setTimeout'] })
            let a = fakeSpawn([{ hang: true }])
            let evs = []
            let settled = null
            let pr = ensureChromiumCore({ onTrace: (e) => evs.push(e.type) }, { spawn: a.sp, platform: 'win32' }).then((v) => {
                settled = { ok: v }
            }, (err) => {
                settled = { err }
            })
            await until(() => evs.includes('install-start'))
            mock.timers.tick(INSTALL_BUDGET_MS - 1)
            await flush()
            assert.strict.deepStrictEqual(settled, null)
            mock.timers.tick(1)
            await until(() => a.calls.some((c) => c.file && c.file.toLowerCase().includes('taskkill')))
            mock.timers.tick(30)
            await pr
            assert.ok(settled.err && settled.err.code === 'E_INSTALL' && settled.err.message === 'browser installation timed out')

            //明確給0: 不逾時
            let b = fakeSpawn([{ hang: true }])
            let evs2 = []
            let settled2 = null
            let pr2 = ensureChromiumCore({ timeout: 0, onTrace: (e) => evs2.push(e.type) }, { spawn: b.sp, platform: 'win32' }).then((v) => {
                settled2 = { ok: v }
            }, (err) => {
                settled2 = { err }
            })
            await until(() => evs2.includes('install-start'))
            mock.timers.tick(TIMER_MAX)
            await flush()
            assert.strict.deepStrictEqual(settled2, null)
            b.cps[0].emit('close', 0)
            await pr2
            assert.strict.deepStrictEqual(settled2, { ok: { kind: 'headless-shell' } })
        })

        it('R-PW-BUDGET 13: 改寫主檔(wpw)上之INSTALL_BUDGET_MS屬性不影響實際上限(內部採用installBudget.mjs之值)', async function() {
            mock.timers.enable({ apis: ['setTimeout'] })
            let save = wpw.INSTALL_BUDGET_MS
            wpw.INSTALL_BUDGET_MS = 1
            try {
                let a = fakeSpawn([{ hang: true }])
                let evs = []
                let settled = null
                let pr = ensureChromiumCore({ onTrace: (e) => evs.push(e.type) }, { spawn: a.sp, platform: 'win32' }).then((v) => {
                    settled = { ok: v }
                }, (err) => {
                    settled = { err }
                })
                await until(() => evs.includes('install-start'))
                mock.timers.tick(10000)
                await flush()
                assert.strict.deepStrictEqual(settled, null, '屬性被改成1毫秒仍不得逾時')
                a.cps[0].emit('close', 0)
                await pr
                assert.strict.deepStrictEqual(settled, { ok: { kind: 'headless-shell' } })
            }
            finally {
                wpw.INSTALL_BUDGET_MS = save
            }
        })

        it('R-PW-BUDGET 09: ensureChromium之兩個子行程(瀏覽器與Linux系統相依)共用一個預算(第二個之逾時為剩餘毫秒)', async function() {
            let delays = []
            let orig = globalThis.setTimeout
            globalThis.setTimeout = (fn, ms, ...rest) => {
                delays.push(ms)
                return orig(fn, ms, ...rest)
            }
            try {
                let a = fakeSpawn([{ code: 0 }, { code: 0 }])
                let t = [2000, 5000]
                let i = 0
                await ensureChromiumCore({ kind: 'chromium', installDeps: true, timeout: 20000 }, { spawn: a.sp, platform: 'linux', now: () => t[Math.min(i++, 1)] })
            }
            finally {
                globalThis.setTimeout = orig
            }
            //兩個安裝計時器: 20000與20000-3000; 另有KILL_WAIT等不在此路徑
            assert.strict.deepStrictEqual(delays.filter((v) => v >= 1000), [20000, 17000])
        })

    })

    describe('opt.installTimeout之檢測(R-PW-OPT; 自用鍵、不轉傳)', function() {

        function parse(v, extra = {}) {
            _resetWarned()
            let logs = []
            let st = parseLaunchOpt({ debug: true, funLog: (label, msg) => logs.push(msg), ...(v === undefined ? {} : { installTimeout: v }), ...extra }, 'launchChromium')
            return { v: st.installTimeout, logs }
        }

        it('R-PW-BUDGET 10: 未給或null→預設INSTALL_BUDGET_MS(無提示); 有效數字與數字字串(轉值後使用)、0、上限TIMER_MAX照收', function() {
            for (let u of [undefined, null]) {
                let r = u === undefined ? parse(undefined) : parse(null)
                assert.strict.deepStrictEqual(r.v, INSTALL_BUDGET_MS)
                assert.strict.deepStrictEqual(r.logs, [])
            }
            for (let [input, expected] of [[1, 1], [5000, 5000], [' 30 ', 30], ['1e3', 1000], [0, 0], ['0', 0], [TIMER_MAX, TIMER_MAX], [1.5, 1.5]]) {
                let r = parse(input)
                assert.strict.deepStrictEqual(r.v, expected, String(input))
                assert.strict.deepStrictEqual(r.logs, [], String(input))
            }
        })

        it('R-PW-BUDGET 11: 無效值(負數、NaN、Infinity、超過上限、布林、物件、陣列、空字串、非數字字串)→預設並以固定詞彙提示(不含傳入之值)', function() {
            let bads = [-1, NaN, Infinity, TIMER_MAX + 1, true, false, {}, [], '', 'abc', ' ', '1,000', Symbol('s'), () => {}]
            for (let b of bads) {
                let r = parse(b)
                assert.strict.deepStrictEqual(r.v, INSTALL_BUDGET_MS, String(typeof b))
                assert.strict.deepStrictEqual(r.logs, [`[w-playwright launchChromium] invalid opt.installTimeout: must be a valid number from 0 to 2147483647, using default ${INSTALL_BUDGET_MS}`], String(typeof b))
            }
        })

        it('R-PW-BUDGET 12: installTimeout為自用鍵, 不轉傳給Playwright(getChromiumLaunchOptions之輸出與兩入口之替身所收選項皆無此鍵)', async function() {
            let out = wpw.getChromiumLaunchOptions({ installTimeout: 1234, timeout: 99 })
            assert.strict.deepStrictEqual('installTimeout' in out, false)
            assert.strict.deepStrictEqual(out.timeout, 99)
            let seen = []
            let restore = wpw.setBrowserTypeForTest({
                launch: async (o) => {
                    seen.push(o)
                    return 'b'
                },
                launchPersistentContext: async (d, o) => {
                    seen.push(o)
                    return 'c'
                },
            })
            try {
                await wpw.launchChromium({ installTimeout: 1234 })
                await wpw.launchChromiumPersistent('', { installTimeout: 1234 })
            }
            finally {
                restore()
            }
            assert.strict.deepStrictEqual(seen.length, 2)
            for (let o of seen) {
                assert.strict.deepStrictEqual('installTimeout' in o, false)
            }
        })

    })

})
