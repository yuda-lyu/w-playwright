import assert from 'assert'
import { runChild, cleanEnv } from './tools/runChild.mjs'


//api-lang: 啟動語系預設之真瀏覽器驗證(R-PW-LANG; R-PW-REAL; 排程第585項主控已定4)——headless shell(Chromium 159, revision 1255), 不經替身
//背景: Chromium 159不再繼承主機系統語系(應用程式語系預設en-US), generic字族(sans-serif)之字型與行高隨之改變;
//本套件於呼叫端未給--lang時補主機系統語系, 使 navigator.language 與 sans-serif之實際字型回到156(繼承主機)之行為
//量測: navigator.language、CDP CSS.getPlatformFontsForNode(實際用於sans-serif之拉丁字與中文字之字型)、行高; 於子行程執行(test/tools/langProbe.mjs; 隱藏視窗、無頭)
//鑑別力: 預設 vs 關閉(opt.lang:false) 之語系與字型必須不同(主機系統語系非en-US時); 關閉時為Chromium之預設en-US與其字型


//reHost, 本檔對主機系統語系之前提: 合語法
let reHost = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/

//reJheng, 微軟正黑體(CDP回傳之familyName為在地化名稱'微軟正黑體'; 英文為Microsoft JhengHei)
let reJheng = /微軟正黑體|JhengHei/i


describe('api-lang', function() {

    let r = null
    let out = ''
    let c = null

    before(async function() {
        this.timeout(600000)
        let x = await runChild('./test/tools/langProbe.mjs', [], cleanEnv(), 540000)
        r = x.result
        out = x.out
        c = r && r.cases
        if (r && r.version) {
            console.log(`    [api-lang] Chromium ${r.version}; 子行程之主機系統語系(Intl)=${r.hostLang}; ${r.platform}`)
        }
    })

    it('子行程完成, 各案皆啟動成功', function() {
        assert.ok(r, out)
        assert.strict.deepStrictEqual(r.error, undefined, r.error)
        assert.strict.deepStrictEqual(r.ok, true, out)
        for (let k of Object.keys(c)) {
            assert.strict.deepStrictEqual(c[k].error, undefined, `${k}: ${c[k].error}`)
        }
        for (let k of ['default', 'off', 'optEn', 'optJa', 'callerArgs', 'callerHost', 'persistentDefault', 'persistentOff', 'defaultCtxLocaleEn']) {
            assert.ok(c[k], `缺案 ${k}: 主機系統語系 ${r.hostLang} 不合語法?`)
        }
        assert.ok(reHost.test(r.hostLang), r.hostLang)
    })

    it('預設(未給lang): 與呼叫端自給--lang=<主機系統語系>等價(語系、sans-serif之拉丁字與中文字之字型、行高皆同)', function() {
        //spec(主控已定1): 未給時補主機系統語系, 恢復156繼承主機之行為
        assert.strict.deepStrictEqual(c.default, c.callerHost)
    })

    it('預設(未給lang): navigator.language為主機系統語系(Chromium可能正規化, 如ja-JP → ja)', function() {
        let host = r.hostLang
        let head = host.split('-')[0].toLowerCase()
        assert.ok(c.default.language.toLowerCase().startsWith(head), `${c.default.language} vs ${host}`)
        assert.ok(c.default.languages[0].toLowerCase().startsWith(head), JSON.stringify(c.default.languages))
        //主機為zh-TW(本機)時為原樣
        if (host === 'zh-TW') {
            assert.strict.deepStrictEqual(c.default.language, 'zh-TW')
        }
    })

    it('opt.lang:false(關閉): 回到Chromium 159之預設語系en-US, 與預設不同(鑑別力; 主機系統語系為en-US者無從區分, 略過並寫明)', function() {
        assert.strict.deepStrictEqual(c.off.language, 'en-US')
        if (r.hostLang.toLowerCase() === 'en-us') {
            this.skip()
        }
        //鑑別力: 預設與關閉之語系不同(證明預設確有作用, 非恰巧相同)
        assert.notStrictEqual(c.default.language, c.off.language)
    })

    it('opt.lang指定字串: en-US → en-US(不論主機語系); ja-JP → 日文系(Chromium正規化為ja)', function() {
        assert.strict.deepStrictEqual(c.optEn.language, 'en-US')
        assert.ok(c.optJa.language.toLowerCase().startsWith('ja'), c.optJa.language)
        assert.ok(c.optJa.languages[0].toLowerCase().startsWith('ja'), JSON.stringify(c.optJa.languages))
    })

    it('呼叫端args之--lang=en-US優先: 語系與字型同opt.lang:\'en-US\'(預設不另補)', function() {
        assert.strict.deepStrictEqual(c.callerArgs, c.optEn)
    })

    it('兩入口一致(接縫不用替身): 持久啟動之預設與關閉之結果同非持久啟動', function() {
        assert.strict.deepStrictEqual(c.persistentDefault, c.default)
        assert.strict.deepStrictEqual(c.persistentOff, c.off)
    })

    it('context之locale只改navigator.language, 不改字型與行高(預設啟動語系不變; 與主控已定2: 兩者作用不同)', function() {
        assert.strict.deepStrictEqual(c.defaultCtxLocaleEn.language, 'en-US')
        let a = { ...c.defaultCtxLocaleEn }
        let b = { ...c.default }
        delete a.language
        delete a.languages
        delete b.language
        delete b.languages
        assert.strict.deepStrictEqual(a, b)
    })

    it('Windows且主機系統語系為zh-TW(本機): 預設之sans-serif拉丁字與中文字皆為微軟正黑體; 關閉時拉丁字為Arial、中文字為Microsoft YaHei(與156/159之差異一致)', function() {
        if (r.platform !== 'win32' || r.hostLang !== 'zh-TW') {
            this.skip()
        }
        assert.ok(c.default.latFonts.length > 0 && c.default.latFonts.every((f) => reJheng.test(f)), JSON.stringify(c.default.latFonts))
        assert.ok(c.default.cjkFonts.length > 0 && c.default.cjkFonts.every((f) => reJheng.test(f)), JSON.stringify(c.default.cjkFonts))
        //關閉(鑑別力): 字型與預設不同
        assert.strict.deepStrictEqual(c.off.latFonts, ['Arial'])
        assert.strict.deepStrictEqual(c.off.cjkFonts, ['Microsoft YaHei'])
        //行高與寬度亦不同(14px之拉丁字: 預設19、關閉16)
        assert.notStrictEqual(c.default.lat[1], c.off.lat[1])
        assert.notStrictEqual(c.default.lat[0], c.off.lat[0])
    })

})
