import core from 'playwright-core/lib/coreBundle'
import wpw from '../../src/WPlaywright.mjs'
import { registryDirectoryAtLoad } from '../../src/_pw.mjs'
import { getInstallEnv } from '../../src/_install.mjs'


//envProbe, 供unit-env、unit-ensureChromium以子行程執行(隔離行程: 載入時之環境變數不同); 不啟動任何瀏覽器(一律替身)
//用法: node test/tools/envProbe.mjs [delete:<環境變數>]... ; 最後一行輸出'RESULT <json>'

for (let a of process.argv.slice(2)) {
    if (a.startsWith('delete:')) {
        delete process.env[a.slice(7)]
    }
    else if (a.startsWith('set:')) {
        let s = a.slice(4)
        let i = s.indexOf('=')
        process.env[s.slice(0, i)] = s.slice(i + 1)
    }
}

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

let r = { codes: [], calls: 0, registryDirectoryAtLoad, installEnvBrowsersPath: getInstallEnv().PLAYWRIGHT_BROWSERS_PATH, pwRegistryDirectory: String(core.registry.registryDirectory) }
try {
    for (let f of [() => wpw.launchChromium({ channel: 'chrome' }), () => wpw.launchChromiumPersistent('', {})]) {
        try {
            let v = await f()
            r.codes.push('OK:' + v)
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
