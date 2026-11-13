import assert from 'assert'
import wpw from '../src/WPlaywright.mjs'
import pwDefaults from '../src/pwDefaults.mjs'
import { pwState } from '../src/_pw.mjs'
import { runChild, cleanEnv } from './tools/runChild.mjs'


//unit-env: 會使守門失效之環境(F14 PWDEBUG inspector、F15 SELENIUM_REMOTE_URL)與版本不符(F1 E_PW_VERSION)之拒絕; 一律以替身, 不啟動瀏覽器
//設計§2.2: 兩個啟動入口之順序一致(①解析opt → ②環境檢查 → ③版本檢查 → …); 拒絕時替身launch呼叫0次


let ENV_KEYS = ['PWDEBUG', 'npm_config_pwdebug', 'npm_package_config_pwdebug', 'SELENIUM_REMOTE_URL', 'W_PLAYWRIGHT_LOGON_GUARD']

//withFake, 設定計數替身並執行兩個入口, 回{ codes, calls, traces }
async function runBoth(opt = {}) {
    let calls = 0
    let traces = []
    let restore = wpw.setBrowserTypeForTest({
        launch: async () => {
            calls++
            return 'browser'
        },
        launchPersistentContext: async () => {
            calls++
            return 'context'
        },
    })
    let codes = []
    try {
        let o = { ...opt, onTrace: (ev) => traces.push(ev) }
        for (let f of [() => wpw.launchChromium(o), () => wpw.launchChromiumPersistent('', o)]) {
            try {
                codes.push('OK:' + await f())
            }
            catch (err) {
                codes.push(err.code)
            }
        }
    }
    finally {
        restore()
    }
    return { codes, calls, traces }
}


describe('unit-env', function() {

    let saved = {}
    beforeEach(function() {
        for (let k of ENV_KEYS) {
            saved[k] = process.env[k]
            delete process.env[k]
        }
    })
    afterEach(function() {
        for (let k of ENV_KEYS) {
            if (saved[k] === undefined) {
                delete process.env[k]
            }
            else {
                process.env[k] = saved[k]
            }
        }
    })

    it('乾淨環境: 兩入口皆呼叫替身各一次', async function() {
        let r = await runBoth({})
        assert.strict.deepStrictEqual(r.codes, ['OK:browser', 'OK:context'])
        assert.strict.deepStrictEqual(r.calls, 2)
    })

    it('F14: PWDEBUG為inspector值(1、inspector、true、任意非空)於呼叫時 → E_ENV, 替身0次', async function() {
        for (let v of ['1', 'inspector', 'true', 'x']) {
            process.env.PWDEBUG = v
            let r = await runBoth({})
            assert.strict.deepStrictEqual(r.codes, ['E_ENV', 'E_ENV'], v)
            assert.strict.deepStrictEqual(r.calls, 0, v)
            //§7 onTrace事件env-reject
            assert.strict.deepStrictEqual(r.traces.filter((e) => e.type === 'env-reject').map((e) => e.env), ['PWDEBUG', 'PWDEBUG'])
        }
    })

    it('F14: PWDEBUG為console、0、false、空字串非inspector模式 → 照常', async function() {
        for (let v of ['console', '0', 'false', '']) {
            process.env.PWDEBUG = v
            let r = await runBoth({})
            assert.strict.deepStrictEqual(r.codes, ['OK:browser', 'OK:context'], v)
        }
    })

    it('F14: npm_config_pwdebug、npm_package_config_pwdebug(Playwright之getFromENV亦讀) → E_ENV', async function() {
        for (let k of ['npm_config_pwdebug', 'npm_package_config_pwdebug']) {
            process.env[k] = '1'
            let r = await runBoth({})
            assert.strict.deepStrictEqual(r.codes, ['E_ENV', 'E_ENV'], k)
            assert.strict.deepStrictEqual(r.calls, 0)
            delete process.env[k]
        }
    })

    it('F14: 載入時PWDEBUG=1、呼叫前刪除(Playwright於載入時快取) → E_ENV(隔離行程)', async function() {
        this.timeout(60000)
        let r = await runChild('./test/tools/envProbe.mjs', ['delete:PWDEBUG'], cleanEnv({ PWDEBUG: '1' }))
        assert.ok(r.result, r.out)
        assert.strict.deepStrictEqual(r.result.codes, ['E_ENV', 'E_ENV'])
        assert.strict.deepStrictEqual(r.result.calls, 0)
    })

    it('對照: 載入時無PWDEBUG之隔離行程照常(證明上案之拒絕來自載入時之值)', async function() {
        this.timeout(60000)
        let r = await runChild('./test/tools/envProbe.mjs', [], cleanEnv())
        assert.ok(r.result, r.out)
        assert.strict.deepStrictEqual(r.result.codes, ['OK:browser', 'OK:context'])
        assert.strict.deepStrictEqual(r.result.calls, 2)
    })

    it('F14: playwright-core先以PWDEBUG=1載入、刪除後才載入本套件(隔離行程) → 以Playwright實際之debugMode拒絕E_ENV', async function() {
        this.timeout(60000)
        let r = await runChild('./test/tools/envProbeLate.mjs', [], cleanEnv({ PWDEBUG: '1' }))
        assert.ok(r.result, r.out)
        assert.strict.deepStrictEqual(r.result.codes, ['E_ENV', 'E_ENV'])
        assert.strict.deepStrictEqual(r.result.calls, 0)
        //對照: 同一程序而PWDEBUG未設 → 照常
        let r2 = await runChild('./test/tools/envProbeLate.mjs', [], cleanEnv())
        assert.ok(r2.result, r2.out)
        assert.strict.deepStrictEqual(r2.result.codes, ['OK:browser', 'OK:context'])
    })

    it('F14: 載入時npm_config_pwdebug=1、npm_package_config_pwdebug=1(呼叫前刪除; 隔離行程) → E_ENV', async function() {
        this.timeout(60000)
        for (let k of ['npm_config_pwdebug', 'npm_package_config_pwdebug']) {
            let r = await runChild('./test/tools/envProbe.mjs', [`delete:${k}`], cleanEnv({ [k]: '1' }))
            assert.ok(r.result, r.out)
            assert.strict.deepStrictEqual(r.result.codes, ['E_ENV', 'E_ENV'], k)
            assert.strict.deepStrictEqual(r.result.calls, 0, k)
        }
    })

    it('F14: 載入後才設PWDEBUG(隔離行程) → E_ENV', async function() {
        this.timeout(60000)
        let r = await runChild('./test/tools/envProbe.mjs', ['set:PWDEBUG=1'], cleanEnv())
        assert.ok(r.result, r.out)
        assert.strict.deepStrictEqual(r.result.codes, ['E_ENV', 'E_ENV'])
        assert.strict.deepStrictEqual(r.result.calls, 0)
    })

    it('F15: SELENIUM_REMOTE_URL有值 → E_ENV(兩入口一致), 替身0次', async function() {
        process.env.SELENIUM_REMOTE_URL = 'http://127.0.0.1:4444'
        let r = await runBoth({})
        assert.strict.deepStrictEqual(r.codes, ['E_ENV', 'E_ENV'])
        assert.strict.deepStrictEqual(r.calls, 0)
        assert.strict.deepStrictEqual(r.traces.filter((e) => e.type === 'env-reject').map((e) => e.env), ['SELENIUM_REMOTE_URL', 'SELENIUM_REMOTE_URL'])
    })

    it('E_ENV之訊息為固定詞彙(不含環境變數之值)', async function() {
        process.env.SELENIUM_REMOTE_URL = 'http://user:SECRET@host:4444'
        let msg = ''
        try {
            await wpw.launchChromium()
        }
        catch (err) {
            msg = err.message
            assert.strict.deepStrictEqual(err.code, 'E_ENV')
            assert.strict.deepStrictEqual(err.cause, undefined)
        }
        assert.strict.deepStrictEqual(msg, 'unsupported environment: SELENIUM_REMOTE_URL')
    })

    it('F1: playwright-core實裝版本≠內附表 → E_PW_VERSION, 替身0次(兩入口)', async function() {
        let save = pwState.coreVersion
        pwState.coreVersion = '1.65.0'
        try {
            let r = await runBoth({})
            assert.strict.deepStrictEqual(r.codes, ['E_PW_VERSION', 'E_PW_VERSION'])
            assert.strict.deepStrictEqual(r.calls, 0)
            let ev = r.traces.filter((e) => e.type === 'version-reject')
            assert.strict.deepStrictEqual(ev.length, 2)
            assert.strict.deepStrictEqual([ev[0].coreVersion, ev[0].tableVersion], ['1.65.0', pwDefaults.version])
            //§2.3: 版本號不是秘密, 可附
            try {
                await wpw.launchChromium()
            }
            catch (err) {
                assert.strict.deepStrictEqual(err.message, `playwright-core version 1.65.0 does not match the bundled defaults table ${pwDefaults.version}`)
            }
            //getPlaywrightInfo之tableMatch同步反映
            assert.strict.deepStrictEqual(wpw.getPlaywrightInfo().tableMatch, false)
        }
        finally {
            pwState.coreVersion = save
        }
        assert.strict.deepStrictEqual(wpw.getPlaywrightInfo().tableMatch, true)
    })

    it('順序: 環境檢查先於版本檢查', async function() {
        let save = pwState.coreVersion
        pwState.coreVersion = '1.65.0'
        process.env.PWDEBUG = '1'
        try {
            let r = await runBoth({})
            assert.strict.deepStrictEqual(r.codes, ['E_ENV', 'E_ENV'])
        }
        finally {
            pwState.coreVersion = save
        }
    })

    it('順序: launchChromiumPersistent之userDataDir非字串 → E_ARG先於環境檢查, 且為reject非同步throw', async function() {
        process.env.PWDEBUG = '1'
        let p = null
        assert.doesNotThrow(() => {
            p = wpw.launchChromiumPersistent(1, {})
        })
        await assert.rejects(p, (err) => err.code === 'E_ARG' && err.message === 'invalid userDataDir: must be a string')
    })

})
