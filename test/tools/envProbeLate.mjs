import 'playwright-core'


//envProbeLate, 供unit-env以子行程執行: 先載入playwright-core(此時之PWDEBUG由其快取), 再刪除環境變數, 最後才載入本套件
//用以證明: 本套件載入時已看不到PWDEBUG, 仍以Playwright實際採用之debugMode拒絕; 不啟動任何瀏覽器(一律替身)
//最後一行輸出'RESULT <json>'

delete process.env.PWDEBUG
delete process.env.npm_config_pwdebug
delete process.env.npm_package_config_pwdebug

let { default: wpw } = await import('../../src/WPlaywright.mjs')

let calls = 0
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
let r = { codes: [] }
try {
    for (let f of [() => wpw.launchChromium(), () => wpw.launchChromiumPersistent('', {})]) {
        try {
            r.codes.push('OK:' + await f())
        }
        catch (err) {
            r.codes.push(err.code || 'NOCODE')
        }
    }
}
finally {
    restore()
}
r.calls = calls
console.log('RESULT ' + JSON.stringify(r))
