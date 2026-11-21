import path from 'path'
import assert from 'assert'
import pwDefaults from '../src/pwDefaults.mjs'
import { runChild, cleanEnv } from './tools/runChild.mjs'
import { defEnStr, findSwitches, effectiveFeatures, guardEffective } from './tools/cmdline.mjs'


//api-pwDrift: 漂移測試(設計§8.2)——以headless shell實際啟動之命令列比對內附表與合併結果(F1、F2、F3); 接線不用替身
//安全前提: 子行程環境刪除PWDEBUG、SELENIUM_REMOTE_URL、SELENIUM_REMOTE_CAPABILITIES; 每次啟動以executablePath釘在headless shell(啟動前斷言檔名)
//Playwright升版時本測試轉紅並印出實際清單與靜態抽取之結果, 依之人工更新src/pwDefaults.mjs


let GUARD = pwDefaults.guardFeatures[0]

function valueOf(sw) {
    let i = sw.indexOf('=')
    return i >= 0 ? sw.slice(i + 1).split(',') : []
}


describe('api-pwDrift', function() {

    let r = null
    let out = ''

    before(async function() {
        this.timeout(600000)
        //DEBUG=pw:browser: Playwright之<launching>紀錄寫至stderr, 供子行程擷取持久啟動之命令列
        //W_PLAYWRIGHT_LOGON_GUARD=1: 萬一有非headless shell之啟動, 先讀錯誤次數(此子行程內經本套件之啟動皆應為headless shell)
        let x = await runChild('./test/tools/pwDriftProbe.mjs', [], cleanEnv({ DEBUG: 'pw:browser', W_PLAYWRIGHT_LOGON_GUARD: '1' }), 540000)
        r = x.result
        out = x.out
    })

    it('呼叫端給功能開關與「不要預設enable」之ignore時, 真命令列disable與enable各恰一串(§3.1第4～9步)', function() {
        let args = r.callerCase.args
        let dis = findSwitches(args, 'disable-features')
        let en = findSwitches(args, 'enable-features')
        assert.strict.deepStrictEqual(dis, [r.callerCase.expectedDis])
        assert.ok(dis[0].endsWith(',' + GUARD + ',WpwX'))
        assert.strict.deepStrictEqual(en, ['--enable-features=WpwY'])
        assert.ok(args.indexOf('--lang=en-US') >= 0)
    })

    it('語系預設(R-PW-LANG; 真命令列): 未給 → 恰一個--lang=<子行程之主機系統語系>; 呼叫端args有--lang → 原樣、恰一個; opt.lang字串 → 之; opt.lang:false → 無; 基準(未合併)無--lang', function() {
        let host = r.hostLang
        //前提: 子行程之主機系統語系合語法(否則「補」與「不補」無從區分)
        assert.ok(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/.test(host), host)
        //基準: Playwright本身不帶--lang(升版若改為自帶, 本案轉紅, 合併規則須重議)
        assert.strict.deepStrictEqual(findSwitches(r.baseline, 'lang'), [])
        assert.strict.deepStrictEqual(findSwitches(r.langCases.default.args, 'lang'), ['--lang=' + host])
        assert.strict.deepStrictEqual(findSwitches(r.langCases.caller.args, 'lang'), ['--lang=en-US'])
        assert.strict.deepStrictEqual(findSwitches(r.langCases.opt.args, 'lang'), ['--lang=ja-JP'])
        assert.strict.deepStrictEqual(findSwitches(r.langCases.off.args, 'lang'), [])
        //不破壞守門: 各案命令列之disable皆恰一串且守門生效
        for (let k of Object.keys(r.langCases)) {
            let a = r.langCases[k].args
            assert.strict.deepStrictEqual(findSwitches(a, 'disable-features').length, 1, k)
            assert.strict.deepStrictEqual(guardEffective(effectiveFeatures(a, 'disable-features')), true, k)
        }
    })

    it('Playwright全域預設啟動選項之executablePath不蓋過本套件之選項(仍起headless shell)', function() {
        assert.strict.deepStrictEqual(r.defaultsCase.error, undefined, JSON.stringify(r.defaultsCase))
        assert.ok(r.defaultsCase.line.startsWith(r.shellExe), r.defaultsCase.line.slice(0, 120))
    })

    it('PLAYWRIGHT_LEGACY_SCREENSHOT已設(隔離行程): 基準之enable只省略enableLegacyOmit之項(1.65.1起餘項仍給); 合併後enable仍恰一串(預設餘項＋呼叫端項)、disable恰一串', async function() {
        this.timeout(120000)
        let x = await runChild('./test/tools/pwDriftProbe.mjs', ['legacy'], cleanEnv({ PLAYWRIGHT_LEGACY_SCREENSHOT: '1' }), 110000)
        assert.ok(x.result, x.out)
        assert.strict.deepStrictEqual(x.result.ok, true, x.result.error)
        //真命令列之預設enable＝內附表扣除enableLegacyOmit(R-PW-TABLE、R-PW-MERGE 07)
        let defEn = defEnStr({ [pwDefaults.enableLegacyEnv]: '1' })
        assert.ok(defEn.startsWith('--enable-features='), defEn)
        assert.strict.deepStrictEqual(findSwitches(x.result.baseline, 'enable-features'), [defEn])
        assert.strict.deepStrictEqual(findSwitches(x.result.baseline, 'disable-features').length, 1)
        //合併: 預設餘項與呼叫端項併為單獨一串, 不得與Playwright預設之enable並存兩串
        assert.strict.deepStrictEqual(findSwitches(x.result.merged, 'enable-features'), [defEn + ',WpwY'])
        assert.strict.deepStrictEqual(findSwitches(x.result.merged, 'disable-features'), [x.result.expectedDis])
    })

    it('子行程完成且只起headless shell', function() {
        assert.ok(r, out)
        assert.strict.deepStrictEqual(r.error, undefined, r.error)
        assert.strict.deepStrictEqual(r.ok, true)
        assert.ok(['chrome-headless-shell.exe', 'chrome-headless-shell'].indexOf(path.basename(r.shellExe).toLowerCase()) >= 0)
    })

    it('未合併之基準: Playwright預設恰一個--disable-features且與內附表逐項相同; enable亦同(F1)', function() {
        let dis = findSwitches(r.baseline, 'disable-features')
        let en = findSwitches(r.baseline, 'enable-features')
        let msg = `實際disable: ${JSON.stringify(dis)}\n靜態抽取: ${JSON.stringify(r.staticDisable)}\n實際enable: ${JSON.stringify(en)}\n→ 依此更新src/pwDefaults.mjs(並確認版本)`
        assert.strict.deepStrictEqual(dis.length, 1, msg)
        assert.strict.deepStrictEqual(valueOf(dis[0]), [...pwDefaults.disableFeatures], msg)
        assert.strict.deepStrictEqual(en.length, 1, msg)
        assert.strict.deepStrictEqual(valueOf(en[0]), [...pwDefaults.enableFeatures], msg)
        //靜態抽取與實際啟動參數一致(設計§1.2)
        assert.strict.deepStrictEqual(r.staticDisable, [...pwDefaults.disableFeatures], msg)
    })

    it('合併後之矩陣(headless是/否 × 非持久/持久 × channel 不給/chrome/msedge/chromium): 恰一個--disable-features、為本套件之串、位於預設開關之後; --enable-features至多一個(F2、F3)', function() {
        assert.strict.deepStrictEqual(r.matrix.length, 16)
        for (let m of r.matrix) {
            let tag = JSON.stringify({ headless: m.headless, persistent: m.persistent, channel: m.channel })
            let dis = findSwitches(m.args, 'disable-features')
            assert.strict.deepStrictEqual(dis.length, 1, tag)
            assert.strict.deepStrictEqual(dis[0], m.expected, tag)
            assert.strict.deepStrictEqual(guardEffective(effectiveFeatures(m.args, 'disable-features')), true, tag)
            let iDis = m.args.indexOf(dis[0])
            for (let d of ['--disable-field-trial-config', '--disable-extensions', '--no-sandbox']) {
                let i = m.args.indexOf(d)
                assert.ok(i >= 0 && i < iDis, `${tag} ${d}`)
            }
            assert.ok(findSwitches(m.args, 'enable-features').length <= 1, tag)
            //R-PW-LANG: 16格(含持久啟動)之真命令列皆恰一個--lang=<主機系統語系>
            assert.strict.deepStrictEqual(findSwitches(m.args, 'lang'), ['--lang=' + r.hostLang], tag)
            assert.strict.deepStrictEqual(m.args.indexOf('--headless') >= 0, m.headless, tag)
        }
    })

    it('接線: wpw.launchChromium()與wpw.launchChromiumPersistent(\'\')真啟動headless shell, 命令列恰一串且含守門', function() {
        assert.strict.deepStrictEqual(r.wiring.length, 2)
        for (let w of r.wiring) {
            assert.ok(w.line.startsWith(r.shellExe), w.fn)
            let args = w.line.slice(r.shellExe.length).trim().split(' ')
            let dis = findSwitches(args, 'disable-features')
            assert.strict.deepStrictEqual(dis.length, 1, w.fn)
            assert.strict.deepStrictEqual(guardEffective(effectiveFeatures(args, 'disable-features')), true, w.fn)
            //R-PW-LANG(兩入口一致、真命令列): 預設啟動之命令列恰一個--lang=<主機系統語系>
            assert.strict.deepStrictEqual(findSwitches(args, 'lang'), ['--lang=' + r.hostLang], w.fn)
        }
        assert.strict.deepStrictEqual(r.wiring[0].width, 120)
    })

    it('setBrowserTypeForTest之next(): 以同一份合併後選項真啟動(替身改寫不影響); next(o)對o重走合併', function() {
        assert.strict.deepStrictEqual(r.next.seen.length, 1)
        assert.ok(r.next.seen[0].endsWith(',' + GUARD))
        for (let [line, extra] of [[r.next.line1, null], [r.next.line2, 'WpwNextProbe']]) {
            assert.ok(line.startsWith(r.shellExe), line.slice(0, 120))
            let args = line.slice(r.shellExe.length).trim().split(' ')
            let dis = findSwitches(args, 'disable-features')
            assert.strict.deepStrictEqual(dis.length, 1)
            let set = effectiveFeatures(args, 'disable-features')
            assert.strict.deepStrictEqual(guardEffective(set), true)
            if (extra) {
                assert.strict.deepStrictEqual(set.has(extra), true)
            }
            //R-PW-LANG: next()與next(o)(重走完整流程)之真命令列皆恰一個--lang=<主機系統語系>
            assert.strict.deepStrictEqual(findSwitches(args, 'lang'), ['--lang=' + r.hostLang])
        }
    })

})
