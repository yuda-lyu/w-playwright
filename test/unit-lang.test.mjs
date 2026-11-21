import assert from 'assert'
import pwDefaults from '../src/pwDefaults.mjs'
import wpw from '../src/WPlaywright.mjs'
import { parseLaunchOpt, mergeParsed, fallbackOptions } from '../src/getChromiumLaunchOptions.mjs'
import { _resetWarned } from '../src/_check.mjs'
import { defDisStr, simulatePwCmdline, findSwitches, effectiveFeatures, guardEffective } from './tools/cmdline.mjs'
import { setSysLang, setSysLangThrow, setNoIntl } from './tools/sysLang.mjs'


//unit-lang: 啟動語系預設(R-PW-LANG; 排程第585項): Chromium 159起不再繼承主機系統語系(應用程式語系預設en-US, generic字族隨之改變),
//本套件於呼叫端未給--lang時, 命令列補恰一個--lang=<主機系統語系>(Intl.DateTimeFormat().resolvedOptions().locale), 呼叫端可覆寫(args、opt.lang)或關閉(opt.lang:false); 不啟動瀏覽器
//真瀏覽器之語系與字型實測見api-lang; 真命令列見api-pwDrift
//每條斷言註明對應之規則(R-PW-LANG 01~09, 見sgud/rule/rulebook.md)與派工之〈主控已定〉


let g = (opt) => wpw.getChromiumLaunchOptions(opt)
let GUARD = pwDefaults.guardFeatures[0]
let DIS = () => '--disable-features=' + [...pwDefaults.disableFeatures, GUARD].join(',')

//langs, 命令列中開關名為lang之元素(去前置-、不分大小寫、取=之前)
let langs = (args) => findSwitches(args, 'lang')

//assertGuarded, 不變式(R-PW-MERGE 01): 命令列恰一個disable居末, 守門生效, 且不因lang而破壞
function assertGuarded(out) {
    let dis = findSwitches(out.args, 'disable-features')
    assert.strict.deepStrictEqual(dis.length, 1, 'args 內恰一個 --disable-features')
    assert.strict.deepStrictEqual(out.args[out.args.length - 1], dis[0], '合併之 disable 仍為 args 最後一個元素')
    let cmd = simulatePwCmdline(out)
    assert.strict.deepStrictEqual(findSwitches(cmd, 'disable-features').length, 1)
    assert.strict.deepStrictEqual(guardEffective(effectiveFeatures(cmd, 'disable-features')), true)
}


describe('unit-lang', function() {

    let saveLegacy
    let saveGuard
    let restore = null

    //patch, 設定Intl之取代並於afterEach還原
    let patch = (fn) => {
        restore = fn
    }

    before(function() {
        saveLegacy = process.env.PLAYWRIGHT_LEGACY_SCREENSHOT
        saveGuard = process.env.W_PLAYWRIGHT_LOGON_GUARD
        delete process.env.PLAYWRIGHT_LEGACY_SCREENSHOT
        delete process.env.W_PLAYWRIGHT_LOGON_GUARD
    })
    after(function() {
        if (saveLegacy === undefined) {
            delete process.env.PLAYWRIGHT_LEGACY_SCREENSHOT
        }
        else {
            process.env.PLAYWRIGHT_LEGACY_SCREENSHOT = saveLegacy
        }
        if (saveGuard !== undefined) {
            process.env.W_PLAYWRIGHT_LOGON_GUARD = saveGuard
        }
    })
    beforeEach(function() {
        _resetWarned()
    })
    afterEach(function() {
        if (restore) {
            restore()
            restore = null
        }
    })


    describe('預設: 補主機系統語系(R-PW-LANG 01; 主控已定1)', function() {

        it('未給opt.lang且args無--lang: 命令列恰一個--lang=<Intl之值>(真Intl, 預期值由測試自Intl取得)', function() {
            let host = Intl.DateTimeFormat().resolvedOptions().locale
            //前提: 主機之Intl回傳合語法之語系(否則本案無從區分「補」與「不補」)
            assert.ok(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/.test(host), host)
            for (let opt of [undefined, null, {}, { headless: true }]) {
                let out = g(opt)
                assert.strict.deepStrictEqual(langs(out.args), ['--lang=' + host], JSON.stringify(opt))
                assertGuarded(out)
            }
        })

        it('Intl回傳各種合語法之語系: 原樣補入(大小寫不改), args＝[--lang, 合併disable], ignoreDefaultArgs不受影響', function() {
            for (let v of ['zh-TW', 'en-US', 'ja-JP', 'zh-Hant-TW', 'en-001', 'es-419', 'sr-Latn-RS', 'de', 'fil', 'EN-us']) {
                patch(setSysLang(v))
                let out = g()
                assert.strict.deepStrictEqual(out.args, ['--lang=' + v, DIS()], v)
                assert.strict.deepStrictEqual(out.ignoreDefaultArgs, [defDisStr()], v)
                assertGuarded(out)
                restore()
                restore = null
            }
        })

        it('位置(R-PW-LANG 05): 置於呼叫端其餘args之後、enable與合併disable之前; disable恆為最後一個元素', function() {
            patch(setSysLang('zh-TW'))
            let out = g({ args: ['--foo=1', '--enable-features=Foo', '--disable-features=Bar', '--bar'] })
            assert.strict.deepStrictEqual(out.args, [
                '--foo=1',
                '--bar',
                '--lang=zh-TW',
                '--enable-features=' + [...pwDefaults.enableFeatures, 'Foo'].join(','),
                '--disable-features=' + [...pwDefaults.disableFeatures, GUARD, 'Bar'].join(','),
            ])
            assertGuarded(out)
        })

        it('輸出與輸入順序無關(原則2): 同組args不同順序, lang之位置與值相同', function() {
            patch(setSysLang('zh-TW'))
            let a = g({ args: ['--foo', '--bar=1'] })
            let b = g({ args: ['--bar=1', '--foo'] })
            assert.strict.deepStrictEqual(langs(a.args), ['--lang=zh-TW'])
            assert.strict.deepStrictEqual(langs(b.args), ['--lang=zh-TW'])
            assert.strict.deepStrictEqual(a.args.indexOf('--lang=zh-TW'), 2)
            assert.strict.deepStrictEqual(b.args.indexOf('--lang=zh-TW'), 2)
        })

        it('args整鍵無效(被視為[])時呼叫端之--lang一併捨棄, 改補預設(沿用args之K3語意, R-PW-MERGE 03)', function() {
            patch(setSysLang('zh-TW'))
            let out = g({ args: ['--lang=en-US', 'about:blank'] })
            assert.strict.deepStrictEqual(out.args, ['--lang=zh-TW', DIS()])
        })

        it('不改寫呼叫端輸入(深凍結之opt、args)', function() {
            patch(setSysLang('zh-TW'))
            let opt = Object.freeze({ lang: 'ja-JP', args: Object.freeze(['--foo']) })
            let before = JSON.stringify(opt)
            let out = g(opt)
            assert.strict.deepStrictEqual(JSON.stringify(opt), before)
            assert.strict.deepStrictEqual(langs(out.args), ['--lang=ja-JP'])
            assert.notStrictEqual(out.args, opt.args)
        })

        it('每次呼叫重新取得系統語系(不快取): 前後兩次呼叫之間Intl改變即反映', function() {
            patch(setSysLang('zh-TW'))
            assert.strict.deepStrictEqual(langs(g().args), ['--lang=zh-TW'])
            restore()
            patch(setSysLang('fr-FR'))
            assert.strict.deepStrictEqual(langs(g().args), ['--lang=fr-FR'])
        })

    })


    describe('取不到系統語系: 不補, 不寫死任何語系(R-PW-LANG 02; 主控已定1)', function() {

        let mutes = [
            ['建構式拋錯', () => setSysLangThrow('ctor')],
            ['resolvedOptions拋錯', () => setSysLangThrow('resolved')],
            ['全域Intl不存在', () => setNoIntl()],
            ['locale為空字串', () => setSysLang('')],
            ['locale為undefined', () => setSysLang(undefined)],
            ['locale為null', () => setSysLang(null)],
            ['locale為數字', () => setSysLang(123)],
            ['locale為物件', () => setSysLang({})],
            ['locale含底線(不合語法)', () => setSysLang('zh_TW')],
            ['locale含空白', () => setSysLang('zh TW')],
            ['locale含換行', () => setSysLang('zh-TW\n--no-sandbox')],
            ['locale含逗號(多語系)', () => setSysLang('zh-TW,en-US')],
            ['locale僅單字母', () => setSysLang('z')],
            ['locale結尾連字號', () => setSysLang('zh-')],
            ['locale過長', () => setSysLang('a'.repeat(40))],
            ['locale含非ASCII', () => setSysLang('中文')],
        ]

        for (let [name, mk] of mutes) {
            it(`${name}: 命令列無--lang, 其餘輸出與無此功能時相同`, function() {
                patch(mk())
                let out = g()
                assert.strict.deepStrictEqual(langs(out.args), [], name)
                assert.strict.deepStrictEqual(out.args, [DIS()], name)
                assert.strict.deepStrictEqual(out.ignoreDefaultArgs, [defDisStr()], name)
                assertGuarded(out)
            })
        }

        it('取不到時, 呼叫端之args與opt.lang照常運作', function() {
            patch(setSysLang(''))
            assert.strict.deepStrictEqual(g({ args: ['--lang=en-US'] }).args, ['--lang=en-US', DIS()])
            assert.strict.deepStrictEqual(g({ lang: 'ja-JP' }).args, ['--lang=ja-JP', DIS()])
            assert.strict.deepStrictEqual(g({ lang: false }).args, [DIS()])
        })

    })


    describe('呼叫端優先: args已含--lang者原樣保留、不補(R-PW-LANG 03; 主控已定2)', function() {

        let spellings = ['--lang=en-US', '-lang=en-US', '--LANG=en-US', '--Lang=zh-CN', '--lang', '--lang=', '--lang=en-US,fr']

        for (let sp of spellings) {
            it(`${JSON.stringify(sp)}: 原樣保留且全命令列恰此一個lang開關, 位置不變`, function() {
                patch(setSysLang('zh-TW'))
                let out = g({ args: ['--foo', sp, '--bar'] })
                assert.strict.deepStrictEqual(langs(out.args), [sp])
                assert.strict.deepStrictEqual(out.args, ['--foo', sp, '--bar', DIS()])
                assertGuarded(out)
            })
        }

        it('呼叫端給了兩個--lang: 原樣保留(不歸併、不再補第三個)', function() {
            patch(setSysLang('zh-TW'))
            let out = g({ args: ['--lang=en-US', '--lang=ja-JP'] })
            assert.strict.deepStrictEqual(out.args, ['--lang=en-US', '--lang=ja-JP', DIS()])
        })

        it('與功能開關並存: lang保留於原位, 功能開關仍歸併為恰一串', function() {
            patch(setSysLang('zh-TW'))
            let out = g({ args: ['--disable-features=Foo', '--lang=en-US', '--enable-features=Bar'] })
            assert.strict.deepStrictEqual(langs(out.args), ['--lang=en-US'])
            assert.strict.deepStrictEqual(out.args[0], '--lang=en-US')
            assertGuarded(out)
        })

        it('呼叫端給Playwright之context選項locale不影響本項(兩者作用不同; 主控已定2)', function() {
            patch(setSysLang('zh-TW'))
            let out = g({ locale: 'en-US' })
            assert.strict.deepStrictEqual(langs(out.args), ['--lang=zh-TW'])
            assert.strict.deepStrictEqual(out.locale, 'en-US', 'locale仍原樣轉傳給Playwright')
        })

    })


    describe('opt.lang: 指定或關閉(R-PW-LANG 04、07; 主控已定2)', function() {

        it('給語系字串: 以之取代系統語系, 不讀系統語系', function() {
            patch(setSysLangThrow('ctor'))
            let out = g({ lang: 'en-US' })
            assert.strict.deepStrictEqual(out.args, ['--lang=en-US', DIS()])
            assertGuarded(out)
        })

        it('lang:false: 關閉, 命令列無--lang(系統語系可得時亦不補)', function() {
            patch(setSysLang('zh-TW'))
            let out = g({ lang: false })
            assert.strict.deepStrictEqual(out.args, [DIS()])
            assertGuarded(out)
        })

        it('lang:false 而args有--lang: 呼叫端之--lang原樣保留(關閉只代表不補)', function() {
            patch(setSysLang('zh-TW'))
            let out = g({ lang: false, args: ['--lang=en-US'] })
            assert.strict.deepStrictEqual(out.args, ['--lang=en-US', DIS()])
        })

        it('opt.lang為字串而args已有--lang: args優先(opt.lang不採用), 全命令列恰一個lang', function() {
            patch(setSysLang('zh-TW'))
            let out = g({ lang: 'ja-JP', args: ['--lang=en-US'] })
            assert.strict.deepStrictEqual(langs(out.args), ['--lang=en-US'])
            let out2 = g({ lang: 'en-US', args: ['--LANG=ja-JP'] })
            assert.strict.deepStrictEqual(langs(out2.args), ['--LANG=ja-JP'])
        })

        let invalids = [
            ['true', true], ['空字串', ''], ['空白', ' '], ['數字0', 0], ['數字1', 1], ['物件', {}], ['陣列', ['en-US']], ['函數', () => {}],
            ['底線', 'zh_TW'], ['含空白', 'zh TW'], ['前後空白', ' zh-TW '], ['結尾換行', 'zh-TW\n'], ['單字母', 'z'], ['首字連字號', '-zh'], ['連續連字號', 'zh--TW'],
            ['逗號', 'zh-TW,en'], ['分號', 'zh-TW;q=0.9'], ['等號', 'zh=TW'], ['含開關', 'zh-TW --no-sandbox'], ['非ASCII', '中文'], ['過長', 'a'.repeat(40)], ['字串false', 'false'],
        ]
        for (let [name, v] of invalids) {
            it(`opt.lang無效(${name}): 視為未給, 改用系統語系(K3), 輸出與未給相同`, function() {
                patch(setSysLang('zh-TW'))
                let out = g({ lang: v })
                assert.strict.deepStrictEqual(out.args, ['--lang=zh-TW', DIS()])
                assertGuarded(out)
            })
        }

        it('opt.lang為null、undefined: 視為未給(取系統語系)', function() {
            patch(setSysLang('zh-TW'))
            for (let v of [null, undefined]) {
                assert.strict.deepStrictEqual(g({ lang: v }).args, ['--lang=zh-TW', DIS()])
            }
        })

        it('opt.lang不轉傳給Playwright(自用鍵); 其餘未宣告之鍵仍原樣轉傳', function() {
            patch(setSysLang('zh-TW'))
            for (let v of ['en-US', false, 'bad value']) {
                let out = g({ lang: v, timeout: 5 })
                assert.strict.deepStrictEqual('lang' in out, false, String(v))
                assert.strict.deepStrictEqual(out.timeout, 5)
            }
        })

        it('V11: opt.lang只讀一次(存取器計讀次數＝1)', function() {
            let n = 0
            let opt = {
                get lang() {
                    n++
                    return 'en-US'
                },
            }
            g(opt)
            assert.strict.deepStrictEqual(n, 1)
        })

        it('opt.lang之存取拋錯: 視為無效, 不拋錯, 改用系統語系', function() {
            patch(setSysLang('zh-TW'))
            let opt = {
                get lang() {
                    throw new Error('x')
                },
            }
            assert.strict.deepStrictEqual(g(opt).args, ['--lang=zh-TW', DIS()])
        })

    })


    describe('提示(opt.debug; 固定詞彙、不含值; R-PW-OPT)', function() {

        it('opt.lang無效: V19格式之提示, 不含傳入之值; 同函數同鍵同原因每行程一次', function() {
            patch(setSysLang('zh-TW'))
            let logs = []
            let funLog = (label, safe) => logs.push([label, safe])
            g({ debug: true, funLog, lang: 'SECRET-LANG VALUE' })
            g({ debug: true, funLog, lang: 'SECRET-LANG VALUE' })
            assert.strict.deepStrictEqual(logs, [['warn', '[w-playwright getChromiumLaunchOptions] invalid opt.lang: must be a locale string such as \'en-US\' or false, using default the system language']])
            assert.strict.deepStrictEqual(JSON.stringify(logs).indexOf('SECRET'), -1)
        })

        it('opt.lang為字串而args已有--lang: 提示opt.lang不採用(固定詞彙)', function() {
            patch(setSysLang('zh-TW'))
            let logs = []
            g({ debug: true, funLog: (label, safe) => logs.push([label, safe]), lang: 'ja-JP', args: ['--lang=en-US'] })
            assert.strict.deepStrictEqual(logs, [['warn', '[w-playwright getChromiumLaunchOptions] opt.lang is ignored because args already contains a --lang switch']])
        })

        it('合法之用法(未給、字串、false、args有--lang而opt.lang未給或為false)不提示; 未開debug不提示', function() {
            patch(setSysLang('zh-TW'))
            let logs = []
            let funLog = (label, safe) => logs.push([label, safe])
            g({ debug: true, funLog })
            g({ debug: true, funLog, lang: 'en-US' })
            g({ debug: true, funLog, lang: false })
            g({ debug: true, funLog, args: ['--lang=en-US'] })
            g({ debug: true, funLog, lang: false, args: ['--lang=en-US'] })
            g({ funLog, lang: 'ja-JP', args: ['--lang=en-US'] })
            g({ funLog, lang: 'bad value' })
            assert.strict.deepStrictEqual(logs, [])
        })

    })


    describe('兩入口與getChromiumLaunchOptions一致(R-PW-LANG 06; R-PW-ORDER)', function() {

        //capture, 以替身取得兩入口實際交給BrowserType之選項
        async function viaEntries(opt) {
            let seen = []
            let rs = wpw.setBrowserTypeForTest({
                launch: async (o) => {
                    seen.push({ fn: 'launchChromium', o })
                    return 'b'
                },
                launchPersistentContext: async (dir, o) => {
                    seen.push({ fn: 'launchChromiumPersistent', o })
                    return 'c'
                },
            })
            try {
                await wpw.launchChromium(opt)
                await wpw.launchChromiumPersistent('', opt)
            }
            finally {
                rs()
            }
            return seen
        }

        let cases = [
            ['未給', undefined],
            ['空物件', {}],
            ['args有--lang', { args: ['--lang=en-US', '--foo'] }],
            ['lang:false', { lang: false }],
            ['lang字串', { lang: 'en-GB' }],
            ['lang無效', { lang: 'bad value' }],
            ['lang字串＋其餘args與enable', { lang: 'ja-JP', args: ['--foo', '--enable-features=A'] }],
            ['lang:false＋args有--lang', { lang: false, args: ['--LANG=zh-CN'] }],
        ]

        for (let [name, opt] of cases) {
            for (let host of ['zh-TW', '']) {
                it(`${name}(系統語系${host === '' ? '取不到' : host}): launchChromium、launchChromiumPersistent與getChromiumLaunchOptions之args相同`, async function() {
                    patch(setSysLang(host))
                    let want = g(opt).args
                    let seen = await viaEntries(opt)
                    assert.strict.deepStrictEqual(seen.length, 2, '替身確被兩入口呼叫(接縫不空過)')
                    assert.strict.deepStrictEqual(seen[0].o.args, want, seen[0].fn)
                    assert.strict.deepStrictEqual(seen[1].o.args, want, seen[1].fn)
                    //全命令列之lang開關至多一個(各案皆至多給一個)
                    assert.ok(langs(want).length <= 1, JSON.stringify(want))
                    for (let s of seen) {
                        assert.strict.deepStrictEqual('lang' in s.o, false, '自用鍵不轉傳')
                    }
                })
            }
        }

        it('預設(系統語系zh-TW): 兩入口之替身皆收到恰一個--lang=zh-TW', async function() {
            patch(setSysLang('zh-TW'))
            let seen = await viaEntries(undefined)
            assert.strict.deepStrictEqual(seen.length, 2)
            for (let s of seen) {
                assert.strict.deepStrictEqual(langs(s.o.args), ['--lang=zh-TW'], s.fn)
                assertGuarded(s.o)
            }
        })

        it('合併後之回調改了PLAYWRIGHT_LEGACY_SCREENSHOT → 重新合併後(finalGate)--lang仍恰一個、位置與守門不變(兩入口)', async function() {
            patch(setSysLang('zh-TW'))
            let seen = []
            let rs = wpw.setBrowserTypeForTest({
                launch: async (o) => {
                    seen.push(o)
                    return 'b'
                },
                launchPersistentContext: async (dir, o) => {
                    seen.push(o)
                    return 'c'
                },
            })
            let opt = {
                args: ['--enable-features=Foo'],
                onTrace: (e) => {
                    if (e.type === 'launch-options') {
                        process.env.PLAYWRIGHT_LEGACY_SCREENSHOT = '1'
                    }
                },
            }
            try {
                await wpw.launchChromium(opt)
                await wpw.launchChromiumPersistent('', opt)
            }
            finally {
                rs()
                delete process.env.PLAYWRIGHT_LEGACY_SCREENSHOT
            }
            assert.strict.deepStrictEqual(seen.length, 2)
            for (let o of seen) {
                assert.strict.deepStrictEqual(langs(o.args), ['--lang=zh-TW'])
                assert.strict.deepStrictEqual(o.args[o.args.length - 1].startsWith('--disable-features='), true)
                assert.strict.deepStrictEqual(findSwitches(o.args, 'enable-features').length, 1)
            }
        })

        it('保底輸出(內部缺陷時)只含守門, 不含--lang(R-PW-MERGE 09); mergeParsed之info.nArgs含--lang', function() {
            patch(setSysLang('zh-TW'))
            assert.strict.deepStrictEqual(langs(fallbackOptions().args), [])
            let r = mergeParsed(parseLaunchOpt({}, 'test'))
            assert.strict.deepStrictEqual(r.info.nArgs, 2)
            assert.strict.deepStrictEqual(r.out.args.length, 2)
        })

    })


    describe('getPlaywrightInfo().systemLang(R-PW-LANG 08; 主控已定3)', function() {

        it('呈現本套件將採用之主機系統語系(同一取得來源); 取不到為空字串; 深凍結', function() {
            patch(setSysLang('ja-JP'))
            let info = wpw.getPlaywrightInfo()
            assert.strict.deepStrictEqual(info.systemLang, 'ja-JP')
            assert.strict.deepStrictEqual(Object.isFrozen(info), true)
            restore()
            patch(setSysLang(''))
            assert.strict.deepStrictEqual(wpw.getPlaywrightInfo().systemLang, '')
            restore()
            patch(setSysLangThrow('ctor'))
            assert.strict.deepStrictEqual(wpw.getPlaywrightInfo().systemLang, '')
        })

        it('未patch時等於真Intl之值, 且與getChromiumLaunchOptions預設補入者一致', function() {
            let host = Intl.DateTimeFormat().resolvedOptions().locale
            assert.strict.deepStrictEqual(wpw.getPlaywrightInfo().systemLang, host)
            assert.strict.deepStrictEqual(langs(g().args), ['--lang=' + wpw.getPlaywrightInfo().systemLang])
        })

    })

})
