import assert from 'assert'
import pwDefaults from '../src/pwDefaults.mjs'
import wpw from '../src/WPlaywright.mjs'
import { parseLaunchOpt, mergeParsed, fallbackOptions } from '../src/getChromiumLaunchOptions.mjs'
import { defDisStr, defEnStr, simulatePwCmdline, findSwitches, effectiveFeatures, guardEffective } from './tools/cmdline.mjs'


//unit-mergeFeatures: 合併演算法(設計§3.1)與失效模式F4~F8、F16~F20之單元測試; 不啟動瀏覽器
//每條斷言註明對應之設計句


let g = (opt) => wpw.getChromiumLaunchOptions(opt)
let GUARD = pwDefaults.guardFeatures[0]

//assertOneGuardedDisable, 設計§3.1第8步「輸出args＝呼叫端其餘args＋〔enable〕＋合併disable(恆為最後一個元素)」與約束4「只能一串」
function assertOneGuardedDisable(out, env = process.env) {
    let dis = findSwitches(out.args, 'disable-features')
    assert.strict.deepStrictEqual(dis.length, 1, 'args 內恰一個 --disable-features')
    assert.strict.deepStrictEqual(out.args[out.args.length - 1], dis[0], '合併之 disable 為 args 最後一個元素')
    let cmd = simulatePwCmdline(out, env)
    assert.strict.deepStrictEqual(findSwitches(cmd, 'disable-features').length, 1, '經 ignoreDefaultArgs 過濾後整個命令列恰一串')
    assert.strict.deepStrictEqual(guardEffective(effectiveFeatures(cmd, 'disable-features')), true, '生效之 disable ⊇ 內附表預設 ∪ 守門')
}


describe('unit-mergeFeatures', function() {

    let saveLegacy
    before(function() {
        saveLegacy = process.env.PLAYWRIGHT_LEGACY_SCREENSHOT
        delete process.env.PLAYWRIGHT_LEGACY_SCREENSHOT
    })
    after(function() {
        if (saveLegacy === undefined) {
            delete process.env.PLAYWRIGHT_LEGACY_SCREENSHOT
        }
        else {
            process.env.PLAYWRIGHT_LEGACY_SCREENSHOT = saveLegacy
        }
    })

    it('未給opt: 恰一串disable居末且含內附表每項與守門, ignore含預設串(§3.1第5、8、9步)', function() {
        let out = g()
        assertOneGuardedDisable(out)
        //§3.1第5步: disable＝內附表預設＋守門
        assert.strict.deepStrictEqual(out.args, ['--disable-features=' + [...pwDefaults.disableFeatures, GUARD].join(',')])
        //§3.1第9步: ignoreDefaultArgs＝預設disable串
        assert.strict.deepStrictEqual(out.ignoreDefaultArgs, [defDisStr()])
        //§7: headless預設true
        assert.strict.deepStrictEqual(out.headless, true)
    })

    it('F4: 大小寫、單一連字號、無值、多個之功能開關變體一律吸收為一串', function() {
        let out = g({ args: ['--DISABLE-FEATURES=Zeta', '-disable-features=Alpha,Beta', '--disable-features', '--Disable-Features=Gamma', '--lang=en-US'] })
        assertOneGuardedDisable(out)
        //§3.1第3步: 所有功能開關之原項自args移除; 第5步: 呼叫端項排序、去重後接於守門之後
        assert.strict.deepStrictEqual(out.args, ['--lang=en-US', '--disable-features=' + [...pwDefaults.disableFeatures, GUARD, 'Alpha', 'Beta', 'Gamma', 'Zeta'].join(',')])
    })

    it('F4: 前後空白之開關使args整鍵無效(§3.1第2步), 守門照加', function() {
        for (let a of [' --disable-features=A', '--disable-features=A ', '--lang=en ']) {
            let out = g({ args: [a, '--proxy-server=x'] })
            //§3.1第2步: 任一元素不符 → 整鍵[](呼叫端其餘參數一併捨棄)
            assert.strict.deepStrictEqual(out.args, ['--disable-features=' + [...pwDefaults.disableFeatures, GUARD].join(',')], a)
            assertOneGuardedDisable(out)
        }
    })

    it('F5: --、\'-- \'、--single-argument(大小寫與連字號不拘)、非-開頭使args整鍵無效, 守門照加', function() {
        //含頭尾NEL(U+0085; Chromium於Windows修剪之, JS之trim不修剪): '--\u0085'於Chromium即成'--'(2026-11-13 headless shell實測啟動失敗)
        let bads = ['--', '-- ', '--single-argument', '--SINGLE-ARGUMENT', '-single-argument', '---single-argument=x', 'about:blank', '/disable-features=X', '', '--\u0085', '-- \u0085', '\u0085--', '--single-argument\u0085', '-- ', '--　']
        for (let a of bads) {
            let out = g({ args: ['--lang=en-US', a] })
            assert.strict.deepStrictEqual(out.args.length, 1, JSON.stringify(a))
            assertOneGuardedDisable(out)
        }
    })

    it('F5: 非字串元素使args整鍵無效', function() {
        for (let a of [1, null, undefined, true, {}, [], new String('--x')]) { // eslint-disable-line no-new-wrappers
            let out = g({ args: ['--lang=en-US', a] })
            assert.strict.deepStrictEqual(out.args.length, 1)
            assertOneGuardedDisable(out)
        }
    })

    it('F6: ignoreDefaultArgs為true視為未給[](K3)', function() {
        let out = g({ ignoreDefaultArgs: true })
        //§7: ignoreDefaultArgs之true不收 → []; 合併後ignore只有預設串
        assert.strict.deepStrictEqual(out.ignoreDefaultArgs, [defDisStr()])
        assertOneGuardedDisable(out)
    })

    it('F7: 呼叫端ignore項與本套件之串相同或為功能開關樣式者剔除', function() {
        let merged = g().args[0]
        let out = g({ ignoreDefaultArgs: [merged, '--disable-features=X', '--DISABLE-FEATURES=' + GUARD, ' --enable-features=Y', '--mute-audio'] })
        //§3.1第4、9步: 功能開關樣式之ignore項剔除, 其餘(--mute-audio)保留
        assert.strict.deepStrictEqual(out.ignoreDefaultArgs, ['--mute-audio', defDisStr()])
        assert.strict.deepStrictEqual(out.ignoreDefaultArgs.indexOf(out.args[out.args.length - 1]), -1, '本套件之串不在ignore內')
        assertOneGuardedDisable(out)
    })

    it('F8: 呼叫端enable守門功能(含*前綴、<試驗、:參數)者剔除', function() {
        for (let it of [GUARD, '*' + GUARD, GUARD + '<Trial', GUARD + ':p/1']) {
            let out = g({ args: ['--enable-features=Foo,' + it] })
            let en = findSwitches(out.args, 'enable-features')
            //§3.1第6步: 剔除功能名屬守門者
            assert.strict.deepStrictEqual(en, ['--enable-features=CDPScreenshotNewSurface,Foo'], it)
            assertOneGuardedDisable(out)
        }
    })

    it('原則3: enable與呼叫端disable同名者剔除(衝突收嚴)', function() {
        let out = g({ args: ['--disable-features=Foo', '--enable-features=Foo:p/1,Bar'] })
        assert.strict.deepStrictEqual(findSwitches(out.args, 'enable-features'), ['--enable-features=CDPScreenshotNewSurface,Bar'])
        assertOneGuardedDisable(out)
    })

    it('F16: 功能項含非ASCII使args整鍵無效', function() {
        for (let a of ['--disable-features=Tránslate', '--enable-features=功能', '--disable-features=A,Ｂ']) {
            let out = g({ args: ['--lang=en-US', a] })
            assert.strict.deepStrictEqual(out.args.length, 1, a)
            assertOneGuardedDisable(out)
        }
    })

    it('F17: 開關含換行等控制字元使args整鍵無效', function() {
        for (let a of ['--disable-features=A\nB', '--disable-features=A\r', '--lang=en\tUS', '--x=\x00', '--x=\x7f', '--lang=en\u0085', '--x=\x80', '--x=\x9f']) {
            let out = g({ args: ['--lang=en-US', a] })
            assert.strict.deepStrictEqual(out.args.length, 1, JSON.stringify(a))
            assertOneGuardedDisable(out)
        }
    })

    it('F16/F17: 功能項語法不符(含=、空白、只有前綴)使args整鍵無效', function() {
        for (let a of ['--disable-features=A=B', '--disable-features=A B', '--disable-features=*', '--disable-features=<x']) {
            let out = g({ args: ['--lang=en-US', a] })
            assert.strict.deepStrictEqual(out.args.length, 1, a)
        }
    })

    it('F18: 合併串恰等於預設串時不加ignore、不另附(以假想之未來內附表驗證disable; 現行表驗證enable)', function() {
        //假想未來之Playwright預設已含守門功能, 且呼叫端無額外項
        let tb = { ...pwDefaults, disableFeatures: [...pwDefaults.disableFeatures, GUARD] }
        let st = parseLaunchOpt({}, 'test')
        let { out } = mergeParsed(st, process.env, tb)
        //§3.1第7步: 合併之disable串與內附表預設串完全相同 → 不加ignore、不另附
        assert.strict.deepStrictEqual(out.args, [])
        assert.strict.deepStrictEqual(out.ignoreDefaultArgs, [])
        //enable: 呼叫端給與預設完全相同之enable → 不加ignore、不另附
        let out2 = g({ args: ['--enable-features=CDPScreenshotNewSurface'] })
        assert.strict.deepStrictEqual(findSwitches(out2.args, 'enable-features'), [])
        assert.strict.deepStrictEqual(out2.ignoreDefaultArgs, [defDisStr()])
        let cmd = simulatePwCmdline(out2)
        assert.strict.deepStrictEqual(findSwitches(cmd, 'enable-features'), [defEnStr()])
    })

    it('§3.1第4步: 呼叫端ignore含預設disable串 → 不放內附表預設, 守門照放', function() {
        let out = g({ ignoreDefaultArgs: [defDisStr()], args: ['--disable-features=Foo'] })
        assert.strict.deepStrictEqual(out.args, ['--disable-features=' + GUARD + ',Foo'])
        assert.strict.deepStrictEqual(out.ignoreDefaultArgs, [defDisStr()])
        let cmd = simulatePwCmdline(out)
        assert.strict.deepStrictEqual(findSwitches(cmd, 'disable-features').length, 1)
        assert.strict.deepStrictEqual(effectiveFeatures(cmd, 'disable-features').has(GUARD), true)
    })

    it('§3.1第4步: 呼叫端ignore含預設enable串 → 去掉預設enable', function() {
        let out = g({ ignoreDefaultArgs: [defEnStr()] })
        assert.strict.deepStrictEqual(findSwitches(out.args, 'enable-features'), [])
        assert.strict.deepStrictEqual(out.ignoreDefaultArgs, [defDisStr(), defEnStr()])
        let cmd = simulatePwCmdline(out)
        assert.strict.deepStrictEqual(findSwitches(cmd, 'enable-features'), [])
        assertOneGuardedDisable(out)
    })

    it('PLAYWRIGHT_LEGACY_SCREENSHOT未設: 呼叫端enable併入預設enable並忽略預設enable串', function() {
        let out = g({ args: ['--enable-features=Foo'] })
        assert.strict.deepStrictEqual(findSwitches(out.args, 'enable-features'), ['--enable-features=CDPScreenshotNewSurface,Foo'])
        assert.strict.deepStrictEqual(out.ignoreDefaultArgs, [defDisStr(), defEnStr()])
        let cmd = simulatePwCmdline(out)
        assert.strict.deepStrictEqual(findSwitches(cmd, 'enable-features').length, 1)
    })

    it('PLAYWRIGHT_LEGACY_SCREENSHOT已設: 無預設enable, 呼叫端enable單獨一串、不忽略預設enable', function() {
        process.env.PLAYWRIGHT_LEGACY_SCREENSHOT = '1'
        try {
            let out = g({ args: ['--enable-features=Foo'] })
            //§2.2: 依呼叫時之PLAYWRIGHT_LEGACY_SCREENSHOT計算enable預設
            assert.strict.deepStrictEqual(findSwitches(out.args, 'enable-features'), ['--enable-features=Foo'])
            assert.strict.deepStrictEqual(out.ignoreDefaultArgs, [defDisStr()])
            let cmd = simulatePwCmdline(out)
            assert.strict.deepStrictEqual(findSwitches(cmd, 'enable-features'), ['--enable-features=Foo'])
            assertOneGuardedDisable(out)
        }
        finally {
            delete process.env.PLAYWRIGHT_LEGACY_SCREENSHOT
        }
    })

    it('F19: getPlaywrightInfo之陣列為深凍結之複本, 改動不影響合併器', function() {
        let info = wpw.getPlaywrightInfo()
        assert.throws(() => {
            info.defaultDisableFeatures.push('X')
        }, TypeError)
        assert.throws(() => {
            info.guardFeatures[0] = 'X'
        }, TypeError)
        //每一層皆凍結(最外層、三個陣列、systemChrome)
        for (let v of [info, info.defaultDisableFeatures, info.defaultEnableFeatures, info.guardFeatures, info.systemChrome]) {
            assert.strict.deepStrictEqual(Object.isFrozen(v), true)
        }
        assert.throws(() => {
            info.defaultEnableFeatures.push('X')
        }, TypeError)
        assert.throws(() => {
            info.systemChrome.path = 'X'
        }, TypeError)
        assert.throws(() => {
            info.tableMatch = false
        }, TypeError)
        //每次為新複本
        assert.notStrictEqual(wpw.getPlaywrightInfo(), info)
        assert.notStrictEqual(wpw.getPlaywrightInfo().guardFeatures, info.guardFeatures)
        assert.strict.deepStrictEqual(g().args[0].endsWith(',' + GUARD), true)
        assert.strict.deepStrictEqual(wpw.getPlaywrightInfo().defaultEnableFeatures, [...pwDefaults.enableFeatures])
    })

    it('V9: 深凍結之輸入不被改寫', function() {
        let opt = Object.freeze({ args: Object.freeze(['--disable-features=A', '--lang=en']), ignoreDefaultArgs: Object.freeze(['--mute-audio']), headless: false })
        let before = JSON.stringify(opt)
        let out = g(opt)
        assert.strict.deepStrictEqual(JSON.stringify(opt), before)
        assert.notStrictEqual(out.args, opt.args)
        assert.notStrictEqual(out.ignoreDefaultArgs, opt.ignoreDefaultArgs)
    })

    it('原則3: 呼叫端停用預設enable之功能(不論有無給--enable-features、或只給無值者) → 預設enable亦剔除, 命令列不留同名衝突', function() {
        for (let args of [['--disable-features=CDPScreenshotNewSurface'], ['--disable-features=CDPScreenshotNewSurface', '--enable-features'], ['--enable-features=', '--disable-features=CDPScreenshotNewSurface']]) {
            let out = g({ args })
            let cmd = simulatePwCmdline(out)
            assert.strict.deepStrictEqual(effectiveFeatures(cmd, 'enable-features').has('CDPScreenshotNewSurface'), false, JSON.stringify(args))
            assert.strict.deepStrictEqual(out.ignoreDefaultArgs, [defDisStr(), defEnStr()], JSON.stringify(args))
            assertOneGuardedDisable(out)
        }
    })

    it('§3.1第3、5步: 有效之*前綴、<試驗、:參數後綴原樣保留; 逗號空項去除; 同名不同後綴依完整字串排序(與順序無關)', function() {
        let a = g({ args: ['--disable-features=Zed:p/1,,*Alpha, Beta<Trial.G ,'] })
        assert.strict.deepStrictEqual(a.args, ['--disable-features=' + [...pwDefaults.disableFeatures, GUARD, '*Alpha', 'Beta<Trial.G', 'Zed:p/1'].join(',')])
        let b = g({ args: ['--disable-features=Foo<B,Foo<A'] })
        let c = g({ args: ['--disable-features=Foo<A', '--disable-features=Foo<B'] })
        assert.strict.deepStrictEqual(b.args, c.args)
        assert.ok(b.args[0].endsWith(',Foo<A,Foo<B'))
    })

    it('F8/原則3之提示: debug時對守門功能與disable衝突之enable剔除各提示一次(固定詞彙、不含值)', function() {
        let logs = []
        let opt = { debug: true, funLog: (l, s) => logs.push([l, s]), args: ['--disable-features=SECRETX', '--enable-features=SECRETX,' + GUARD + ',SECRETY'] }
        g(opt)
        g(opt)
        let msgs = logs.map((v) => v[1])
        assert.ok(msgs.includes('[w-playwright getChromiumLaunchOptions] enable-features items for guarded features were removed'), JSON.stringify(msgs))
        assert.ok(msgs.includes('[w-playwright getChromiumLaunchOptions] enable-features items also given in disable-features were removed'), JSON.stringify(msgs))
        assert.strict.deepStrictEqual(msgs.length, new Set(msgs).size)
        assert.ok(msgs.every((m) => !m.includes('SECRET')))
    })

    it('呼叫端enable之項與Playwright預設disable同名(如Translate): 行為不變(Chromium以停用為準), debug時提示', function() {
        let logs = []
        let out = g({ debug: true, funLog: (l, s) => logs.push(s), args: ['--enable-features=Translate'] })
        assert.strict.deepStrictEqual(findSwitches(out.args, 'enable-features'), ['--enable-features=CDPScreenshotNewSurface,Translate'])
        assert.ok(logs.includes('[w-playwright getChromiumLaunchOptions] enable-features items also in the default disable-features have no effect'), JSON.stringify(logs))
        assertOneGuardedDisable(out)
    })

    it('Playwright全域預設啟動選項不得蓋過檢查過之channel、executablePath: 輸出恆有此兩鍵(未給為undefined)', function() {
        let out = g()
        assert.strict.deepStrictEqual(Object.prototype.hasOwnProperty.call(out, 'channel'), true)
        assert.strict.deepStrictEqual(Object.prototype.hasOwnProperty.call(out, 'executablePath'), true)
        //模擬playwright-core用戶端之{ ...this._playwright._defaultLaunchOptions, ...options }(coreBundle.js:64822)
        let merged = { ...{ channel: 'chrome', executablePath: 'C:\\x\\chrome.exe', headless: false }, ...out }
        assert.strict.deepStrictEqual([merged.channel, merged.executablePath, merged.headless], [undefined, undefined, true])
    })

    it('fallbackOptions(合併內部缺陷時之保底): 恰一串含守門、ignore預設串、不含呼叫端之任何輸入', function() {
        let out = fallbackOptions()
        assertOneGuardedDisable(out)
        assert.strict.deepStrictEqual(out.ignoreDefaultArgs, [defDisStr()])
        assert.strict.deepStrictEqual([out.channel, out.executablePath, out.headless], [undefined, undefined, true])
    })

    it('原則2: 同組輸入不同順序之輸出開關字串相同', function() {
        let a = g({ args: ['--disable-features=B,A', '--enable-features=Y,X', '--disable-features=C'] })
        let b = g({ args: ['--disable-features=C', '--enable-features=X', '--disable-features=A,B', '--enable-features=Y'] })
        assert.strict.deepStrictEqual(findSwitches(a.args, 'disable-features'), findSwitches(b.args, 'disable-features'))
        assert.strict.deepStrictEqual(findSwitches(a.args, 'enable-features'), findSwitches(b.args, 'enable-features'))
        assert.strict.deepStrictEqual(a.ignoreDefaultArgs, b.ignoreDefaultArgs)
    })

    it('--disable-blink-features等非功能開關不動', function() {
        let out = g({ args: ['--disable-blink-features=AutomationControlled', '--enable-blink-features=X'] })
        assert.strict.deepStrictEqual(out.args.slice(0, 2), ['--disable-blink-features=AutomationControlled', '--enable-blink-features=X'])
        assertOneGuardedDisable(out)
    })

    it('呼叫端disable重複預設或守門者不重複', function() {
        let out = g({ args: ['--disable-features=Translate,' + GUARD + ',Translate'] })
        assert.strict.deepStrictEqual(out.args, ['--disable-features=' + [...pwDefaults.disableFeatures, GUARD].join(',')])
    })

    it('§3.1第10步: ignoreAllDefaultArgs、自用鍵、__testHook*不轉傳, 其餘鍵原樣轉傳(V7、V8)', function() {
        let env = { A: '1' }
        let proxy = { server: 'http://127.0.0.1:1' }
        let out = g({ ignoreAllDefaultArgs: true, autoInstall: true, installDeps: true, debug: false, funLog: () => {}, onTrace: () => {}, __testHookSeleniumRemoteURL: 'http://x', __testHookBeforeCreateBrowser: () => {}, timeout: 1234, env, proxy, slowMo: 5 })
        for (let k of ['ignoreAllDefaultArgs', 'autoInstall', 'installDeps', 'debug', 'funLog', 'onTrace', '__testHookSeleniumRemoteURL', '__testHookBeforeCreateBrowser']) {
            assert.strict.deepStrictEqual(Object.prototype.hasOwnProperty.call(out, k), false, k)
        }
        assert.strict.deepStrictEqual(out.timeout, 1234)
        assert.strict.deepStrictEqual(out.env, env)
        assert.strict.deepStrictEqual(out.proxy, proxy)
        assert.strict.deepStrictEqual(out.slowMo, 5)
    })

    it('getChromiumLaunchOptions永不拋錯且每次回新物件', function() {
        let a = g()
        let b = g()
        assert.notStrictEqual(a, b)
        assert.notStrictEqual(a.args, b.args)
        for (let v of [1, 'x', true, [], () => {}, new Date(), new Map(), Symbol('s'), 10n]) {
            assert.doesNotThrow(() => g(v))
            assert.strict.deepStrictEqual(g(v), g(), String(typeof v))
        }
    })

})
