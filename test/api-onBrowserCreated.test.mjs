import assert from 'assert'
import wpw from '../src/WPlaywright.mjs'
import { getHooks } from '../src/_launchCore.mjs'


//api-onBrowserCreated: 啟動後鉤子(R-PW-HOOK)之真瀏覽器驗證(本機已安裝之headless shell; 不下載)
//兩個入口(launchChromium、launchChromiumPersistent)各自經真BrowserType啟動, 鉤子各被呼叫一次, 且鉤子之效果(路由)真的作用於頁面;
//失敗時target已關閉; 與setBrowserTypeForTest之真next()正交(next()與next(o)兩種形式皆只套一次)
//測試起之瀏覽器皆於finally關閉


let HOOKED = 'hooked-by-w-playwright-test'

//routeAll, 對Browser之context或持久BrowserContext掛路由: 一律以固定頁面回應(無網路依賴; .invalid為保留之不可解析網域, 無鉤子時導覽必失敗)
function routeAll(ctx) {
    return ctx.route('**/*', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: `<title>${HOOKED}</title>` }))
}

//hookBrowser, 對Browser之鉤子: 包裝newContext使其產出之context掛路由(鉤子「就地對target動作」之典型)
function hookBrowser(b) {
    let orig = b.newContext.bind(b)
    b.newContext = async (o) => {
        let c = await orig(o)
        await routeAll(c)
        return c
    }
}

async function titleOfBrowser(b) {
    let c = await b.newContext()
    try {
        let p = await c.newPage()
        await p.goto('http://hook-test.invalid/', { timeout: 15000 })
        return await p.title()
    }
    finally {
        await c.close()
    }
}

async function titleOfContext(c) {
    let p = await c.newPage()
    await p.goto('http://hook-test.invalid/', { timeout: 15000 })
    return await p.title()
}


describe('api-onBrowserCreated', function() {

    this.timeout(120000)

    let restores = []
    let opened = []
    afterEach(async function() {
        for (let r of restores) {
            r()
        }
        restores = []
        for (let t of opened) {
            try {
                await t.close()
            }
            catch (err) {}
        }
        opened = []
        assert.strict.deepStrictEqual(getHooks().length, 0)
    })

    function reg(hook) {
        let r = wpw.onBrowserCreated(hook)
        restores.push(r)
        return r
    }

    //launchTracked, 啟動後立即登記以供afterEach關閉(斷言失敗或預期reject卻resolve時, 瀏覽器亦不殘留而使mocha懸置)
    async function launchTracked(persistent) {
        let t = persistent ? await wpw.launchChromiumPersistent('', { headless: true }) : await wpw.launchChromium({ headless: true })
        opened.push(t)
        return t
    }

    it('R-PW-HOOK 真launchChromium: 鉤子於回傳前呼叫一次(target為真Browser、info為{ fn, kind:browser }), 其路由效果作用於頁面; 無鉤子時同一導覽失敗(鑑別)', async function() {
        let seen = []
        //無鉤子(對照, 證明下方之HOOKED來自鉤子): 導覽至保留網域.invalid, 失敗或得到非HOOKED之頁面皆可(不依賴網路環境之DNS行為)
        let b0 = await wpw.launchChromium({ headless: true })
        opened.push(b0)
        let t0 = ''
        try {
            t0 = await titleOfBrowser(b0)
        }
        catch (err) {
            t0 = 'NAVIGATION-FAILED'
        }
        assert.notStrictEqual(t0, HOOKED)
        await b0.close()

        reg(async (target, info) => {
            seen.push({ target, info, connected: target.isConnected() })
            hookBrowser(target)
        })
        let b = await wpw.launchChromium({ headless: true })
        opened.push(b)
        assert.strict.deepStrictEqual(seen.length, 1)
        assert.ok(seen[0].target === b)
        assert.strict.deepStrictEqual(seen[0].connected, true)
        assert.strict.deepStrictEqual({ ...seen[0].info }, { fn: 'launchChromium', kind: 'browser' })
        assert.strict.deepStrictEqual(typeof b.newContext, 'function')
        assert.strict.deepStrictEqual(await titleOfBrowser(b), HOOKED)
        assert.strict.deepStrictEqual(seen.length, 1)
    })

    it('R-PW-HOOK 真launchChromiumPersistent: 鉤子呼叫一次(target為真持久BrowserContext、kind:persistent), 路由效果作用於頁面', async function() {
        let seen = []
        reg(async (target, info) => {
            seen.push({ target, info })
            await routeAll(target)
        })
        let c = await wpw.launchChromiumPersistent('', { headless: true })
        opened.push(c)
        assert.strict.deepStrictEqual(seen.length, 1)
        assert.ok(seen[0].target === c)
        assert.strict.deepStrictEqual({ ...seen[0].info }, { fn: 'launchChromiumPersistent', kind: 'persistent' })
        assert.strict.deepStrictEqual(typeof seen[0].target.newPage, 'function')
        assert.strict.deepStrictEqual(await titleOfContext(c), HOOKED)
    })

    it('R-PW-HOOK 真啟動時鉤子失敗: target已關閉(Browser之isConnected為false、持久context已觸發close), E_LAUNCH_HOOK', async function() {
        let kept = null
        reg(async (target) => {
            kept = target
            throw new Error('hook failed on purpose')
        })
        await assert.rejects(launchTracked(false), (err) => err.code === 'E_LAUNCH_HOOK' && err.message === 'browser launch hook failed')
        assert.ok(kept, '鉤子須收到真Browser')
        assert.strict.deepStrictEqual(kept.isConnected(), false, 'reject時Browser須已關閉')

        let closed = false
        for (let r of restores) {
            r()
        }
        restores = []
        reg(async (target) => {
            kept = target
            target.on('close', () => {
                closed = true
            })
            throw new Error('hook failed on purpose')
        })
        await assert.rejects(launchTracked(true), (err) => err.code === 'E_LAUNCH_HOOK')
        assert.strict.deepStrictEqual(closed, true, 'reject時持久context須已關閉(close事件已觸發)')
        assert.strict.deepStrictEqual(kept.pages().length, 0)
    })

    it('R-PW-HOOK 與setBrowserTypeForTest之真next()正交: next()與next(o)兩種形式, 兩入口皆只套鉤子一次(內層next(o)不另套)', async function() {
        for (let form of ['next()', 'next(o)']) {
            let seen = []
            let rHook = wpw.onBrowserCreated((target, info) => {
                seen.push(info.kind)
            })
            let fakeCalls = 0
            let rFake = wpw.setBrowserTypeForTest({
                launch: async (o, next) => {
                    fakeCalls++
                    return form === 'next()' ? next() : next({ headless: true })
                },
                launchPersistentContext: async (dir, o, next) => {
                    fakeCalls++
                    return form === 'next()' ? next() : next({ headless: true })
                },
            })
            try {
                let b = await wpw.launchChromium({ headless: true })
                opened.push(b)
                assert.strict.deepStrictEqual(typeof b.newContext, 'function', form)
                let c = await wpw.launchChromiumPersistent('', { headless: true })
                opened.push(c)
                assert.strict.deepStrictEqual(typeof c.newPage, 'function', form)
                assert.strict.deepStrictEqual(fakeCalls, 2, form)
                assert.strict.deepStrictEqual(seen, ['browser', 'persistent'], form)
            }
            finally {
                rFake()
                rHook()
                for (let t of opened) {
                    await t.close()
                }
                opened = []
            }
        }
    })

    it('R-PW-HOOK 疊放(真瀏覽器): 兩個鉤子依序皆生效, 還原其一後只剩另一個', async function() {
        let order = []
        let rA = reg(() => {
            order.push('A')
        })
        reg(async (target) => {
            order.push('B')
            hookBrowser(target)
        })
        let b = await wpw.launchChromium({ headless: true })
        opened.push(b)
        assert.strict.deepStrictEqual(order, ['A', 'B'])
        assert.strict.deepStrictEqual(await titleOfBrowser(b), HOOKED)
        rA()
        order.length = 0
        let b2 = await wpw.launchChromium({ headless: true })
        opened.push(b2)
        assert.strict.deepStrictEqual(order, ['B'])
    })

})
