import path from 'path'
import assert from 'assert'
import { EventEmitter } from 'events'
import { launchWithInstall, callReal } from '../src/_launchCore.mjs'
import { logonState } from '../src/_logonGuard.mjs'
import { ensureChromiumCore } from '../src/ensureChromium.mjs'
import { runInstall } from '../src/_install.mjs'
import { registryDirectoryAtLoad, cliPath } from '../src/_pw.mjs'
import { runChild, cleanEnv } from './tools/runChild.mjs'


//unit-ensureChromium: 安裝流程(自 w-package-tools-e2e test/unit-launchChromiumCore.test.mjs 移入並擴充; 設計§8.1)
//launch與安裝子行程皆以注入替身, 不下載、不啟動瀏覽器


//Playwright 1.64.1原文(lib/coreBundle.js): 缺少瀏覽器執行檔、Linux缺少系統相依(兩種訊息)
let errMissing = () => new Error('Executable doesn\'t exist at C:\\ms-playwright\\chromium_headless_shell-1248\\chrome-headless-shell.exe\nLooks like Playwright was just installed or updated.')
let errDeps = () => new Error('Host system is missing dependencies to run browsers.\nPlease install them with the following command:')
let errDeps2 = () => new Error('Missing system dependencies required to run browser chromium. Install them with: sudo npx playwright install-deps chromium')
let errOther = () => new Error('Target page, context or browser has been closed')


//mk, launch依序取seq之結果(為Error則拋出), 記錄launch之opt與安裝之種類
function mk(seq, { platform = 'win32', installFail = false } = {}) {
    let calls = { launch: [], install: [] }
    let i = 0
    let launch = async (o) => {
        calls.launch.push(o)
        let r = seq[Math.min(i, seq.length - 1)]
        i++
        if (r instanceof Error) {
            throw r
        }
        return r
    }
    let deps = {
        platform,
        runInstall: async (kind) => {
            calls.install.push(kind)
            if (installFail) {
                let e = new Error('browser installation failed with exit code 1')
                e.code = 'E_INSTALL'
                throw e
            }
            return { kind }
        },
    }
    return { launch, deps, calls }
}

let st0 = (o = {}) => ({ fn: 'launchChromium', autoInstall: true, installDeps: false, funLog: null, onTrace: null, ...o })


//fakeSpawn, 安裝子行程之替身: 記錄參數, 依plan結束(code)、發error、或不結束(hang)
function fakeSpawn(plans) {
    let calls = []
    let sp = (file, args, opt) => {
        let cp = new EventEmitter()
        cp.pid = 4321
        cp.stdout = new EventEmitter()
        cp.stderr = new EventEmitter()
        cp.kill = (sig) => {
            calls.push({ kill: sig })
        }
        calls.push({ file, args, opt })
        if (file.toLowerCase().endsWith('taskkill.exe') || file === 'taskkill') {
            //taskkill之結束延後(記錄其時點), 以驗證逾時之reject在其結束之後
            setTimeout(() => {
                calls.push({ taskkillClosed: true })
                cp.emit('close', 0)
            }, 30)
            return cp
        }
        let plan = plans.shift() || { code: 0 }
        setImmediate(() => {
            if (plan.out) {
                cp.stdout.emit('data', Buffer.from(plan.out))
            }
            if (plan.error) {
                cp.emit('error', new Error('spawn ENOENT'))
            }
            else if (!plan.hang) {
                cp.emit('close', plan.code)
            }
        })
        return cp
    }
    return { sp, calls }
}


describe('unit-ensureChromium', function() {

    describe('launchWithInstall(啟動時之自動安裝)', function() {

        it('瀏覽器已存在時直接啟動, 不安裝', async function() {
            let { launch, deps, calls } = mk(['browser'])
            assert.strict.deepStrictEqual(await launchWithInstall({ headless: true }, st0(), launch, deps), 'browser')
            assert.strict.deepStrictEqual(calls.install, [])
            assert.strict.deepStrictEqual(calls.launch.length, 1)
        })

        it('§4: autoInstall預設關 → 缺檔即E_BROWSER_MISSING, 不安裝', async function() {
            let { launch, deps, calls } = mk([errMissing()])
            await assert.rejects(launchWithInstall({ headless: true }, st0({ autoInstall: false }), launch, deps), (err) => err.code === 'E_BROWSER_MISSING')
            assert.strict.deepStrictEqual(calls.install, [])
        })

        it('缺檔且無頭(未給通道)時只安裝headless shell後再啟動一次', async function() {
            let { launch, deps, calls } = mk([errMissing(), 'browser'])
            assert.strict.deepStrictEqual(await launchWithInstall({ headless: true }, st0(), launch, deps), 'browser')
            assert.strict.deepStrictEqual(calls.install, ['headless-shell'])
            assert.strict.deepStrictEqual(calls.launch.length, 2)
        })

        it('缺檔且為有頭、channel為chromium或chrome-for-testing時安裝完整chromium', async function() {
            for (let o of [{ headless: false }, { headless: true, channel: 'chromium' }, { headless: true, channel: 'chrome-for-testing' }]) {
                let { launch, deps, calls } = mk([errMissing(), 'browser'])
                await launchWithInstall(o, st0(), launch, deps)
                assert.strict.deepStrictEqual(calls.install, ['chromium'], JSON.stringify(o))
            }
        })

        it('系統瀏覽器(channel:chrome)或自訂executablePath缺檔時不安裝 → E_LAUNCH', async function() {
            for (let o of [{ headless: true, channel: 'chrome' }, { headless: true, executablePath: 'C:\\x\\chrome.exe' }]) {
                let { launch, deps, calls } = mk([errMissing()])
                await assert.rejects(launchWithInstall(o, st0(), launch, deps), (err) => err.code === 'E_LAUNCH')
                assert.strict.deepStrictEqual(calls.install, [])
            }
        })

        it('安裝後仍缺檔時不重複安裝 → E_LAUNCH', async function() {
            let { launch, deps, calls } = mk([errMissing(), errMissing()])
            await assert.rejects(launchWithInstall({ headless: true }, st0(), launch, deps), (err) => err.code === 'E_LAUNCH')
            assert.strict.deepStrictEqual(calls.install.length, 1)
            assert.strict.deepStrictEqual(calls.launch.length, 2)
        })

        it('安裝失敗時拋出E_INSTALL, 不再啟動', async function() {
            let { launch, deps, calls } = mk([errMissing(), 'browser'], { installFail: true })
            await assert.rejects(launchWithInstall({ headless: true }, st0(), launch, deps), (err) => err.code === 'E_INSTALL')
            assert.strict.deepStrictEqual(calls.launch.length, 1)
        })

        it('Linux缺系統相依且installDeps時安裝相依一次後再啟動(兩種訊息)', async function() {
            for (let e of [errDeps(), errDeps2()]) {
                let { launch, deps, calls } = mk([e, 'browser'], { platform: 'linux' })
                assert.strict.deepStrictEqual(await launchWithInstall({ headless: true }, st0({ installDeps: true }), launch, deps), 'browser')
                assert.strict.deepStrictEqual(calls.install, ['deps'])
            }
        })

        it('§4: installDeps預設關 → Linux缺系統相依即E_LAUNCH, 不安裝', async function() {
            let { launch, deps, calls } = mk([errDeps()], { platform: 'linux' })
            await assert.rejects(launchWithInstall({ headless: true }, st0(), launch, deps), (err) => err.code === 'E_LAUNCH')
            assert.strict.deepStrictEqual(calls.install, [])
        })

        it('Linux全新環境: 先安裝瀏覽器, 再安裝系統相依, 最後啟動成功', async function() {
            let { launch, deps, calls } = mk([errMissing(), errDeps(), 'browser'], { platform: 'linux' })
            assert.strict.deepStrictEqual(await launchWithInstall({ headless: true }, st0({ installDeps: true }), launch, deps), 'browser')
            assert.strict.deepStrictEqual(calls.install, ['headless-shell', 'deps'])
            assert.strict.deepStrictEqual(calls.launch.length, 3)
        })

        it('非Linux缺系統相依時不安裝相依 → E_LAUNCH', async function() {
            let { launch, deps, calls } = mk([errDeps()], { platform: 'win32' })
            await assert.rejects(launchWithInstall({ headless: true }, st0({ installDeps: true }), launch, deps), (err) => err.code === 'E_LAUNCH')
            assert.strict.deepStrictEqual(calls.install, [])
        })

        it('install-deps後仍缺相依時不重複 → E_LAUNCH', async function() {
            let { launch, deps, calls } = mk([errDeps(), errDeps()], { platform: 'linux' })
            await assert.rejects(launchWithInstall({ headless: true }, st0({ installDeps: true }), launch, deps), (err) => err.code === 'E_LAUNCH')
            assert.strict.deepStrictEqual(calls.install.length, 1)
        })

        it('真啟動之每次嘗試(含自動安裝後之重試)皆先重讀登入守門: 安裝期間讀值變1 → 重試被拒E_LOGON_GUARD', async function() {
            let save = process.env.W_PLAYWRIGHT_LOGON_GUARD
            process.env.W_PLAYWRIGHT_LOGON_GUARD = '1'
            let reads = []
            let bad = 0
            logonState.read = async () => {
                reads.push(bad)
                return { ok: true, bad, locked: false }
            }
            let invokes = 0
            let invoke = async () => {
                invokes++
                throw errMissing()
            }
            let st = st0()
            let real = callReal(st, 'chromium', false, invoke)
            let ri = async () => {
                bad = 1 //安裝期間發生錯誤密碼
                return { kind: 'chromium' }
            }
            try {
                await assert.rejects(launchWithInstall({ headless: false }, st, real, { runInstall: ri, platform: 'win32' }), (err) => err.code === 'E_LOGON_GUARD')
            }
            finally {
                logonState.read = null
                if (save === undefined) {
                    delete process.env.W_PLAYWRIGHT_LOGON_GUARD
                }
                else {
                    process.env.W_PLAYWRIGHT_LOGON_GUARD = save
                }
            }
            assert.strict.deepStrictEqual(reads, [0, 1])
            assert.strict.deepStrictEqual(invokes, 1)
        })

        it('其他錯誤 → E_LAUNCH, 不安裝', async function() {
            let { launch, deps, calls } = mk([errOther()], { platform: 'linux' })
            await assert.rejects(launchWithInstall({ headless: true }, st0({ installDeps: true }), launch, deps), (err) => err.code === 'E_LAUNCH')
            assert.strict.deepStrictEqual(calls.install, [])
            assert.strict.deepStrictEqual(calls.launch.length, 1)
        })

    })

    describe('runInstall與ensureChromium(安裝子行程)', function() {

        it('子行程: process.execPath執行playwright-core之cli.js, windowsHide:true, --no-remove, PLAYWRIGHT_BROWSERS_PATH為載入時之瀏覽器目錄', async function() {
            let { sp, calls } = fakeSpawn([{ code: 0 }])
            let save = process.env.PLAYWRIGHT_BROWSERS_PATH
            process.env.PLAYWRIGHT_BROWSERS_PATH = 'C:\\changed-after-load'
            try {
                assert.strict.deepStrictEqual(await ensureChromiumCore({}, { spawn: sp, platform: 'win32' }), { kind: 'headless-shell' })
            }
            finally {
                if (save === undefined) {
                    delete process.env.PLAYWRIGHT_BROWSERS_PATH
                }
                else {
                    process.env.PLAYWRIGHT_BROWSERS_PATH = save
                }
            }
            assert.strict.deepStrictEqual(calls.length, 1)
            assert.strict.deepStrictEqual(calls[0].file, process.execPath)
            assert.strict.deepStrictEqual(calls[0].args, [cliPath, 'install', '--no-remove', '--only-shell', 'chromium'])
            assert.strict.deepStrictEqual(path.basename(cliPath), 'cli.js')
            assert.strict.deepStrictEqual(calls[0].opt.windowsHide, true)
            //F22: 以本模組載入時之瀏覽器目錄快照傳給子行程, 執行期改動不生效
            assert.ok(registryDirectoryAtLoad.length > 0)
            assert.strict.deepStrictEqual(calls[0].opt.env.PLAYWRIGHT_BROWSERS_PATH, registryDirectoryAtLoad)
        })

        it('F22(隔離行程): 載入時之PLAYWRIGHT_BROWSERS_PATH決定安裝子行程之目錄', async function() {
            this.timeout(60000)
            let fd = path.resolve('./test/_tmp/ensureChromium-browsersPath')
            let r = await runChild('./test/tools/envProbe.mjs', [`set:PLAYWRIGHT_BROWSERS_PATH=C:\\other`], cleanEnv({ PLAYWRIGHT_BROWSERS_PATH: fd }))
            assert.ok(r.result, r.out)
            assert.strict.deepStrictEqual(r.result.registryDirectoryAtLoad, fd)
            assert.strict.deepStrictEqual(r.result.installEnvBrowsersPath, fd)
        })

        it('F22(隔離行程): PLAYWRIGHT_BROWSERS_PATH為0、相對路徑時, 安裝子行程之目錄等於Playwright實際採用之絕對目錄', async function() {
            this.timeout(60000)
            for (let v of ['0', 'test/_tmp/ensureChromium-rel']) {
                let r = await runChild('./test/tools/envProbe.mjs', ['set:PLAYWRIGHT_BROWSERS_PATH=C:\\other'], cleanEnv({ PLAYWRIGHT_BROWSERS_PATH: v }))
                assert.ok(r.result, r.out)
                assert.ok(path.isAbsolute(r.result.pwRegistryDirectory), v)
                assert.strict.deepStrictEqual(r.result.installEnvBrowsersPath, r.result.pwRegistryDirectory, v)
                if (v === '0') {
                    assert.ok(r.result.pwRegistryDirectory.endsWith('.local-browsers'))
                }
            }
        })

        it('kind:chromium → --no-shell; Linux且installDeps → 另執行install-deps; 非Linux不執行', async function() {
            let a = fakeSpawn([{ code: 0 }, { code: 0 }])
            await ensureChromiumCore({ kind: 'chromium', installDeps: true }, { spawn: a.sp, platform: 'linux' })
            assert.strict.deepStrictEqual(a.calls.map((c) => c.args.slice(1)), [['install', '--no-remove', '--no-shell', 'chromium'], ['install-deps', 'chromium']])
            assert.ok(a.calls.every((c) => c.opt.windowsHide === true))
            let b = fakeSpawn([{ code: 0 }])
            await ensureChromiumCore({ installDeps: true }, { spawn: b.sp, platform: 'win32' })
            assert.strict.deepStrictEqual(b.calls.length, 1)
        })

        it('§4: installDeps預設關(Linux亦不執行install-deps)', async function() {
            let a = fakeSpawn([{ code: 0 }])
            await ensureChromiumCore({}, { spawn: a.sp, platform: 'linux' })
            assert.strict.deepStrictEqual(a.calls.length, 1)
        })

        it('離開碼非0 → E_INSTALL(含離開碼、不附子行程輸出、無cause), 輸出只交funLog', async function() {
            let { sp } = fakeSpawn([{ code: 1, out: 'Failed to install browsers\nError: SECRET-PROXY-URL' }])
            let logs = []
            let evs = []
            await assert.rejects(ensureChromiumCore({ funLog: (l, s, d) => logs.push({ l, s, d }), onTrace: (e) => evs.push(e) }, { spawn: sp, platform: 'win32' }), (err) => {
                assert.strict.deepStrictEqual(err.code, 'E_INSTALL')
                assert.strict.deepStrictEqual(err.message, 'browser installation failed with exit code 1')
                assert.strict.deepStrictEqual(err.cause, undefined)
                return true
            })
            assert.ok(logs.some((v) => v.l === 'install-output' && String(v.d).includes('SECRET-PROXY-URL')))
            assert.ok(logs.every((v) => Object.isFrozen(v.s)))
            assert.strict.deepStrictEqual(evs.map((e) => e.type), ['install-start', 'install-fail'])
            assert.strict.deepStrictEqual({ ...evs[1] }, { type: 'install-fail', kind: 'headless-shell', exitCode: 1 })
        })

        it('子行程無法啟動(error事件) → E_INSTALL', async function() {
            let { sp } = fakeSpawn([{ error: true }])
            await assert.rejects(ensureChromiumCore({}, { spawn: sp, platform: 'win32' }), (err) => err.code === 'E_INSTALL' && err.message === 'browser installation failed to start')
        })

        it('onTrace: install-start、install-done(凍結); 回調拋錯與rejection不影響安裝', async function() {
            let evs = []
            let a = fakeSpawn([{ code: 0 }])
            await ensureChromiumCore({ onTrace: (e) => evs.push(e) }, { spawn: a.sp, platform: 'win32' })
            assert.strict.deepStrictEqual(evs.map((e) => ({ ...e })), [{ type: 'install-start', kind: 'headless-shell' }, { type: 'install-done', kind: 'headless-shell' }])
            assert.ok(evs.every((e) => Object.isFrozen(e)))
            let b = fakeSpawn([{ code: 0 }])
            assert.strict.deepStrictEqual(await ensureChromiumCore({
                onTrace: () => {
                    throw new Error('x')
                }
            }, { spawn: b.sp, platform: 'win32' }), { kind: 'headless-shell' })
            let c = fakeSpawn([{ code: 0 }])
            assert.strict.deepStrictEqual(await ensureChromiumCore({
                onTrace: async () => {
                    throw new Error('y')
                }
            }, { spawn: c.sp, platform: 'win32' }), { kind: 'headless-shell' })
        })

        it('逾時(數字字串轉值後使用, K4): 以taskkill /T /F結束子行程樹(windowsHide)並E_INSTALL', async function() {
            let { sp, calls } = fakeSpawn([{ hang: true }])
            let evs = []
            await assert.rejects(ensureChromiumCore({ timeout: ' 30 ', onTrace: (e) => evs.push(e) }, { spawn: sp, platform: 'win32' }), (err) => err.code === 'E_INSTALL' && err.message === 'browser installation timed out')
            let tk = calls.find((c) => c.file && (c.file.toLowerCase().endsWith('taskkill.exe') || c.file === 'taskkill'))
            assert.ok(tk, JSON.stringify(calls))
            assert.strict.deepStrictEqual(tk.args, ['/pid', '4321', '/T', '/F'])
            assert.strict.deepStrictEqual(tk.opt.windowsHide, true)
            assert.strict.deepStrictEqual(evs.map((e) => e.type), ['install-start', 'install-fail'])
            //reject於taskkill結束之後(子行程樹已結束才回報)
            assert.ok(calls.some((c) => c.taskkillClosed === true))
            //Windows不以detached起(否則另開主控台)
            assert.strict.deepStrictEqual(calls[0].opt.detached, false)
        })

        it('逾時(非Windows): 子行程以detached起(行程群組之首), 逾時以process.kill(-pid, SIGKILL)結束整個群組', async function() {
            let { sp, calls } = fakeSpawn([{ hang: true }])
            let kills = []
            let kill = (pid, sig) => kills.push([pid, sig])
            await assert.rejects(runInstall('deps', { onTrace: null, funLog: null }, 20, { spawn: sp, platform: 'linux', kill }), (err) => err.code === 'E_INSTALL' && err.message === 'browser installation timed out')
            assert.strict.deepStrictEqual(calls[0].opt.detached, true)
            assert.strict.deepStrictEqual(kills, [[-4321, 'SIGKILL']])
        })

        it('逾時(非Windows)且群組結束失敗時退而結束子行程本身', async function() {
            let { sp, calls } = fakeSpawn([{ hang: true }])
            let kill = () => {
                throw new Error('ESRCH')
            }
            await assert.rejects(runInstall('headless-shell', { onTrace: null, funLog: null }, 20, { spawn: sp, platform: 'linux', kill }), (err) => err.code === 'E_INSTALL')
            assert.ok(calls.some((c) => c.kill === 'SIGKILL'))
        })

    })

})
