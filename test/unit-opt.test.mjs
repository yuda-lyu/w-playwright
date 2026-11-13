import assert from 'assert'
import wpw from '../src/WPlaywright.mjs'
import pwDefaults from '../src/pwDefaults.mjs'
import { EventEmitter } from 'events'
import { parseLaunchOpt } from '../src/getChromiumLaunchOptions.mjs'
import { ensureChromiumCore } from '../src/ensureChromium.mjs'
import { parseTimer, isB1, isS1, isO1, ARRAY_MAX, _resetWarned } from '../src/_check.mjs'


//unit-opt: 設計§7輸入宣告表之V24矩陣(對齊dspec輸入參數之檢測機制之同名種類: O1、B1、S1、S2、S3、F1、A3、N2'timer')
//K3: opt之非預期輸入視為未給、改用預設; opt.debug時以固定詞彙提示(不含值, K9、V20), 同函數同鍵同原因每行程一次


let g = (opt) => wpw.getChromiumLaunchOptions(opt)
let P = (opt) => parseLaunchOpt(opt, 'test')

//V24第2項: 布林類之輸入矩陣
let BOOL_IN = [true, false, 'true', 'false', 'TRUE', 1, 0, '1', 'y', 'n', '', null, undefined]


describe('unit-opt', function() {

    beforeEach(function() {
        _resetWarned()
    })

    it('O1: opt本身非一般物件(陣列、Date、Map、類別實例、函數、原始值)視為未給; null、undefined、{}取預設', function() {
        class C {}
        let def = JSON.stringify(g())
        for (let v of [1, 'x', true, [], new Date(), new Map(), new C(), () => {}, null, undefined, {}, Object.create(null)]) {
            assert.strict.deepStrictEqual(JSON.stringify(g(v)), def)
        }
        assert.strict.deepStrictEqual(isO1(Object.create(null)), true)
        assert.strict.deepStrictEqual(isO1(Object.create({})), false)
    })

    it('O1: 已撤銷之Proxy、存取拋錯之opt視為無效, 不拋錯', function() {
        let rv = Proxy.revocable({ args: ['--x'] }, {})
        rv.revoke()
        assert.strict.deepStrictEqual(JSON.stringify(g(rv.proxy)), JSON.stringify(g()))
        let p = new Proxy({}, {
            ownKeys() {
                throw new Error('x')
            },
        })
        assert.strict.deepStrictEqual(JSON.stringify(g(p)), JSON.stringify(g()))
    })

    it('V11: 每個鍵只讀一次(存取器計讀次數＝1, 含launchChromium之完整流程)', async function() {
        let n = 0
        let opt = {
            get args() {
                n++
                return ['--lang=en-US']
            },
        }
        g(opt)
        assert.strict.deepStrictEqual(n, 1)
        n = 0
        let restore = wpw.setBrowserTypeForTest({ launch: async () => 'b' })
        try {
            await wpw.launchChromium(opt)
        }
        finally {
            restore()
        }
        assert.strict.deepStrictEqual(n, 1)
    })

    it('V11: 存取器拋錯之鍵視為無效改用預設, 其他鍵照常', function() {
        let opt = {
            get args() {
                throw new Error('x')
            },
            headless: false,
        }
        let out = g(opt)
        assert.strict.deepStrictEqual(out.headless, false)
        assert.strict.deepStrictEqual(out.args.length, 1)
    })

    it('B1: headless只收true/false, 其餘取預設true', function() {
        for (let v of BOOL_IN) {
            let exp = v !== false
            assert.strict.deepStrictEqual(g({ headless: v }).headless, exp, String(v))
        }
    })

    it('B1: autoInstall、installDeps只收true/false, 其餘取預設false', function() {
        for (let k of ['autoInstall', 'installDeps']) {
            for (let v of BOOL_IN) {
                assert.strict.deepStrictEqual(P({ [k]: v })[k], v === true, `${k} ${String(v)}`)
            }
        }
    })

    it('B1: debug非布林視為false(不提示)', function() {
        for (let v of BOOL_IN) {
            assert.strict.deepStrictEqual(P({ debug: v }).debug, v === true, String(v))
        }
    })

    it('S3: channel只收1.64.1之Chromium通道全集, 其餘視為未給', function() {
        for (let c of pwDefaults.channels) {
            assert.strict.deepStrictEqual(g({ channel: c }).channel, c)
        }
        assert.strict.deepStrictEqual(pwDefaults.channels.length, 10)
        for (let v of ['Chrome', 'bidi-chromium', 'bidi-chrome', 'chromium-headless-shell', 'chromium-tip-of-tree', 'firefox', '', ' chrome', 1, true, {}, new String('chrome')]) { // eslint-disable-line no-new-wrappers
            //視為未給: 值為undefined(鍵恆在, 以蓋過Playwright之全域預設)
            assert.strict.deepStrictEqual(g({ channel: v }).channel, undefined, String(v))
        }
    })

    it('S1: executablePath只收非空原始字串, 其餘視為未給', function() {
        assert.strict.deepStrictEqual(g({ executablePath: 'C:\\x\\chrome.exe' }).executablePath, 'C:\\x\\chrome.exe')
        for (let v of ['', 1, true, {}, [], new String('C:\\x')]) { // eslint-disable-line no-new-wrappers
            assert.strict.deepStrictEqual(g({ executablePath: v }).executablePath, undefined, String(v))
        }
        assert.strict.deepStrictEqual(isS1(new String('x')), false) // eslint-disable-line no-new-wrappers
    })

    it('A3: args非陣列(字串、物件、類陣列、true)視為[](守門照加)', function() {
        for (let v of ['--lang=en', { 0: '--x', length: 1 }, true, 1]) {
            let out = g({ args: v })
            assert.strict.deepStrictEqual(out.args.length, 1, String(v))
            assert.ok(out.args[0].startsWith('--disable-features='))
        }
    })

    it('A3: ignoreDefaultArgs元素須為非空字串, 否則整鍵視為[]', function() {
        for (let v of [[''], [1], ['--a', null], 'x', true]) {
            assert.strict.deepStrictEqual(P({ ignoreDefaultArgs: v }).ignoreRaw, [], JSON.stringify(v))
        }
        assert.strict.deepStrictEqual(P({ ignoreDefaultArgs: ['--mute-audio'] }).ignoreRaw, ['--mute-audio'])
    })

    it('F1: funLog、onTrace非函數視為未給', function() {
        for (let v of [1, 'f', {}, [], true]) {
            let st = P({ funLog: v, onTrace: v })
            assert.strict.deepStrictEqual(st.funLog, null)
            assert.strict.deepStrictEqual(st.onTrace, null)
        }
    })

    it('N2 timer: 有效數字(含數字字串轉值, K4), 0~2147483647; 其餘無效(V24第1項)', function() {
        let ok = [[0, 0], [1000, 1000], [' 1000 ', 1000], ['1e3', 1000], ['2147483647', 2147483647], [0.5, 0.5], ['.5', 0.5]]
        for (let [v, e] of ok) {
            assert.strict.deepStrictEqual(parseTimer(v), { ok: true, v: e }, String(v))
        }
        let bad = ['-', 'NP', '', '0x10', null, undefined, true, 'true', NaN, Infinity, 'Infinity', 10n, 2147483648, -1, new Number(5), {}, [], '1,000', '１２３'] // eslint-disable-line no-new-wrappers
        for (let v of bad) {
            assert.strict.deepStrictEqual(parseTimer(v).ok, false, String(v))
        }
    })

    it('S3: findSystemChrome之channel無效改用預設', function() {
        assert.strict.deepStrictEqual(wpw.findSystemChrome({ channel: 'firefox' }), wpw.findSystemChrome())
        assert.strict.deepStrictEqual(isB1(1), false)
    })

    it('S3: ensureChromium之kind無效改用預設headless-shell(安裝子行程替身)並以固定詞彙提示', async function() {
        for (let v of ['chrome', 'Chromium', '', 1, true, {}, 'headless_shell']) {
            _resetWarned()
            let calls = []
            let logs = []
            let sp = (file, args, opt) => {
                calls.push(args)
                let cp = new EventEmitter()
                cp.pid = 1
                cp.stdout = new EventEmitter()
                cp.stderr = new EventEmitter()
                setImmediate(() => cp.emit('close', 0))
                return cp
            }
            let r = await ensureChromiumCore({ kind: v, debug: true, funLog: (l, s) => logs.push(s) }, { spawn: sp, platform: 'win32' })
            assert.strict.deepStrictEqual(r, { kind: 'headless-shell' }, String(v))
            assert.strict.deepStrictEqual(calls[0].slice(1), ['install', '--no-remove', '--only-shell', 'chromium'])
            assert.strict.deepStrictEqual(logs, ['[w-playwright ensureChromium] invalid opt.kind: must be one of \'headless-shell\', \'chromium\', using default \'headless-shell\''])
        }
    })

    it('A3: 陣列之length非0~ARRAY_MAX之整數(Proxy回Infinity等)視為無效改用預設, 不懸置', function() {
        for (let len of [Infinity, -1, 1.5, ARRAY_MAX + 1, NaN]) {
            let p = new Proxy([], {
                get(t, k) {
                    if (k === 'length') {
                        return len
                    }
                    return '--x'
                },
            })
            let out = g({ args: p, ignoreDefaultArgs: p })
            assert.strict.deepStrictEqual(out.args.length, 1, String(len))
            assert.strict.deepStrictEqual(out.ignoreDefaultArgs.length, 1, String(len))
        }
    })

    it('K9: 讀取拋錯之未宣告鍵以固定詞彙提示(不含鍵名)並不轉傳', function() {
        let logs = []
        let opt = { debug: true, funLog: (l, s) => logs.push(s) }
        Object.defineProperty(opt, 'SECRET_KEY_NAME', {
            enumerable: true,
            get() {
                throw new Error('x')
            },
        })
        let out = g(opt)
        assert.strict.deepStrictEqual('SECRET_KEY_NAME' in out, false)
        assert.strict.deepStrictEqual(logs, ['[w-playwright getChromiumLaunchOptions] an opt key that could not be read was removed'])
    })

    it('K3+debug: 每個因非預期而改用預設之鍵皆以固定詞彙提示(funLog), 不含傳入之值; 每行程一次', function() {
        let logs = []
        let funLog = (label, safe) => logs.push([label, safe])
        let opt = { debug: true, funLog, headless: 'SECRET-1', channel: 'SECRET-2', executablePath: '', autoInstall: 'SECRET-3', installDeps: 1, args: 'SECRET-4', ignoreDefaultArgs: true, onTrace: 'SECRET-5', ignoreAllDefaultArgs: true, __testHookX: 1 }
        g(opt)
        let msgs = logs.map((v) => v[1])
        let exp = [
            '[w-playwright getChromiumLaunchOptions] invalid opt.onTrace: must be a function, using default none',
            '[w-playwright getChromiumLaunchOptions] invalid opt.headless: must be a boolean, using default true',
            `[w-playwright getChromiumLaunchOptions] invalid opt.channel: must be one of ${pwDefaults.channels.map((v) => `'${v}'`).join(', ')}, using default none`,
            '[w-playwright getChromiumLaunchOptions] invalid opt.executablePath: must be a non-empty string, using default none',
            '[w-playwright getChromiumLaunchOptions] invalid opt.autoInstall: must be a boolean, using default false',
            '[w-playwright getChromiumLaunchOptions] invalid opt.installDeps: must be a boolean, using default false',
            '[w-playwright getChromiumLaunchOptions] invalid opt.args: must be an array of valid switch strings, using default []',
            '[w-playwright getChromiumLaunchOptions] invalid opt.ignoreDefaultArgs: must be an array of non-empty strings, using default []',
            '[w-playwright getChromiumLaunchOptions] opt.ignoreAllDefaultArgs is not supported and was removed',
            '[w-playwright getChromiumLaunchOptions] opt keys starting with __testHook are not supported and were removed',
        ]
        assert.strict.deepStrictEqual(msgs, exp)
        assert.ok(logs.every((v) => v[0] === 'warn'))
        assert.ok(msgs.every((m) => !m.includes('SECRET')))
        //同函數同鍵同原因每行程一次
        g(opt)
        assert.strict.deepStrictEqual(logs.length, exp.length)
    })

    it('K3: debug為false時不提示', function() {
        let logs = []
        g({ debug: false, funLog: (...a) => logs.push(a), headless: 'x', channel: 1 })
        g({ funLog: (...a) => logs.push(a), headless: 'x' })
        assert.strict.deepStrictEqual(logs, [])
    })

    it('debug提示無funLog時走console.warn', function() {
        let save = console.warn
        let got = []
        console.warn = (s) => got.push(s)
        try {
            g({ debug: true, headless: 'x' })
        }
        finally {
            console.warn = save
        }
        assert.strict.deepStrictEqual(got, ['[w-playwright getChromiumLaunchOptions] invalid opt.headless: must be a boolean, using default true'])
    })

    it('funLog拋錯或回rejected Promise不影響結果', function() {
        let out1 = g({
            debug: true,
            headless: 'x',
            funLog: () => {
                throw new Error('x')
            }
        })
        let out2 = g({
            debug: true,
            channel: 'x',
            funLog: async () => {
                throw new Error('y')
            }
        })
        assert.strict.deepStrictEqual(out1.headless, true)
        assert.strict.deepStrictEqual(out2.channel, undefined)
    })

    it('launchChromiumPersistent之userDataDir(S2, 可空): 非字串(含包裝物件)即reject E_ARG; 字串放行', async function() {
        for (let v of [undefined, null, 1, true, {}, [], new String('C:\\x')]) { // eslint-disable-line no-new-wrappers
            await assert.rejects(wpw.launchChromiumPersistent(v, {}), (err) => err.code === 'E_ARG', String(v))
        }
        let restore = wpw.setBrowserTypeForTest({ launch: async () => 'b', launchPersistentContext: async (d) => 'c:' + d })
        try {
            assert.strict.deepStrictEqual(await wpw.launchChromiumPersistent('', {}), 'c:')
            assert.strict.deepStrictEqual(await wpw.launchChromiumPersistent('C:\\abs\\dir'), 'c:C:\\abs\\dir')
        }
        finally {
            restore()
        }
    })

})
