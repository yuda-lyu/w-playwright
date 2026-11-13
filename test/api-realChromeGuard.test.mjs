import assert from 'assert'
import pwDefaults from '../src/pwDefaults.mjs'
import wpw from '../src/WPlaywright.mjs'
import readBadPassword from './tools/readBadPassword.mjs'
import { runChild, cleanEnv } from './tools/runChild.mjs'


//api-realChromeGuard: 真Chrome＋本套件參數之守門驗證(設計§8.3、§3.4)
//斷言: 經本套件合併參數啟動真Chrome一次, chrome://version之「指令列變化版本」(生效之覆寫)之disable集合 ⊇ 內附表預設 ∪ 守門功能, 且錯誤密碼次數前後增量0
//條件: win32、系統有Chrome、錯誤次數可讀且為0; 不符即skip並寫明原因(略過不算通過, 設計§8.5)
//對照(只起headless shell, 不啟動真Chrome): 證明同一判準對未合併之命令列會判為失敗
//執行期登入守門於真啟動之子行程開啟(W_PLAYWRIGHT_LOGON_GUARD=1), 並同時驗證其真讀取放行


let MUST = [...pwDefaults.disableFeatures, ...pwDefaults.guardFeatures]

//guardOk, 本測試之判準: 生效之disable集合⊇內附表預設∪守門
function guardOk(list) {
    let s = new Set((list || []).map((v) => String(v).replace(/^\*/, '').split(/[<:]/)[0]))
    return MUST.every((f) => s.has(f))
}


describe('api-realChromeGuard', function() {

    it('對照(只起headless shell): 未合併之預設缺守門、只另給守門一串使預設全失效 → 判準為false; 合併後為true', async function() {
        this.timeout(120000)
        let x = await runChild('./test/tools/guardProbe.mjs', ['control'], cleanEnv())
        assert.ok(x.result, x.out)
        assert.strict.deepStrictEqual(x.result.error, undefined, x.result.error)
        //對照一: Playwright預設(不合併)沒有守門功能
        assert.strict.deepStrictEqual(guardOk(x.result.rawDefault), false)
        assert.strict.deepStrictEqual(x.result.rawDefault.indexOf(pwDefaults.guardFeatures[0]), -1)
        //對照二: 另給一串只取最後一串, Playwright預設全失效(事件紀錄:72)
        assert.strict.deepStrictEqual(guardOk(x.result.rawGuardOnly), false)
        assert.strict.deepStrictEqual(x.result.rawGuardOnly, [pwDefaults.guardFeatures[0]])
        //合併後
        assert.strict.deepStrictEqual(guardOk(x.result.merged), true)
    })

    it('真Chrome＋本套件參數(無頭, channel:chrome): 生效之disable ⊇ 內附表∪守門, 錯誤次數增量0', async function() {
        this.timeout(180000)
        if (process.platform !== 'win32') {
            this.skip() //非Windows: 本症狀(LogonUser)限Windows
        }
        if (!wpw.findSystemChrome({ channel: 'chrome' })) {
            this.skip() //系統未安裝Google Chrome
        }
        let b0 = await readBadPassword()
        if (!b0.ok || b0.bad !== 0) {
            this.skip() //錯誤次數不可讀或非0: 不啟動(試跑紀律; 等其歸零後再跑)
        }
        let x = null
        let b1 = null
        try {
            //子行程逾時即結束其整個行程樹(含瀏覽器); 子行程開啟執行期登入守門
            x = await runChild('./test/tools/guardProbe.mjs', ['real', 'chrome'], cleanEnv({ W_PLAYWRIGHT_LOGON_GUARD: '1' }), 170000)
        }
        finally {
            //父行程於子行程結束後(不論成敗)再讀一次
            b1 = await readBadPassword()
        }
        assert.ok(x.result, x.out)
        let r = x.result
        console.log(`    [api-realChromeGuard] Chrome ${r.browserVersion || '?'} (系統版本資料夾 ${wpw.getPlaywrightInfo().systemChrome.version || '?'}); before=${JSON.stringify(r.before)} after=${JSON.stringify(r.after)} parentAfter=${JSON.stringify(b1)}`)
        assert.strict.deepStrictEqual([b1.ok, b1.bad], [true, 0], '父行程於子行程結束後之讀取')
        assert.strict.deepStrictEqual(x.timedOut, false)
        assert.strict.deepStrictEqual(r.error, undefined, r.error)
        assert.strict.deepStrictEqual(r.aborted, undefined, r.aborted)
        assert.strict.deepStrictEqual(r.ok, true)
        //§3.4: 解#variations-cmd-section之base64 JSON(生效之覆寫), disable集合⊇內附表預設∪守門
        assert.ok(Array.isArray(r.variationsDisable), JSON.stringify(r.variations))
        assert.strict.deepStrictEqual(guardOk(r.variationsDisable), true, JSON.stringify(r.variationsDisable))
        //命令列恰一個--disable-features
        assert.strict.deepStrictEqual(r.cmdDisableCount, 1)
        //錯誤次數前後增量0(觀察窗至少一讀, 且每讀皆成功並為0)
        assert.strict.deepStrictEqual(r.before.bad, 0)
        assert.strict.deepStrictEqual(r.after.allOkZero, true, JSON.stringify(r.after))
        assert.strict.deepStrictEqual(r.after.max, 0, JSON.stringify(r.after))
    })

})
