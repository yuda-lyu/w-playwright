import path from 'path'
import { createRequire } from 'module'
import { chromium } from 'playwright-core'
import core from 'playwright-core/lib/coreBundle'
import pwDefaults from './pwDefaults.mjs'


//_pw, 本套件與playwright-core之唯一接點(內部): BrowserType、實裝版本、套件位置、Playwright之debugMode與瀏覽器目錄
//須先import 'playwright-core'(其index.js先載入lib/bootstrap)再取lib/coreBundle, 兩者為同一份模組實例(CJS快取)


let require = createRequire(import.meta.url)

//fpCorePkg, 本套件所依之playwright-core之package.json(與上方import同一份)
let fpCorePkg = require.resolve('playwright-core/package.json')

//pwState, 執行期狀態(內部; 測試以改寫coreVersion模擬版本不符, 測後還原)
let pwState = {
    coreVersion: String(require(fpCorePkg).version),
}

//coreRoot, playwright-core之套件根; cliPath為其CLI(package.json之bin)
let coreRoot = path.dirname(fpCorePkg)
let cliPath = path.join(coreRoot, 'cli.js')


/**
 * 依Playwright之getFromENV語意讀環境變數: 依序PWDEBUG、npm_config_pwdebug、npm_package_config_pwdebug
 */
function getEnvLikePw(name, env = process.env) {
    let v = env[name]
    if (v === undefined) {
        v = env[`npm_config_${name.toLowerCase()}`]
    }
    if (v === undefined) {
        v = env[`npm_package_config_${name.toLowerCase()}`]
    }
    return v
}


/**
 * 依Playwright之debugMode語意判斷PWDEBUG之值是否為inspector模式: 'console'、'0'、'false'、未給、空字串以外皆是
 */
function isInspectorValue(v) {
    if (v === undefined || v === null || v === '') {
        return false
    }
    v = String(v)
    if (v === 'console' || v === '0' || v === 'false') {
        return false
    }
    return true
}

//pwdebugAtLoad, 本模組載入時之PWDEBUG(Playwright亦於模組初始化時快取)
let pwdebugAtLoad = getEnvLikePw('PWDEBUG')


/**
 * Playwright實際採用之debugMode(其模組初始化時快取之值), 取不到時回''
 */
function getPwDebugMode() {
    try {
        return String(core.utils.debugMode())
    }
    catch (err) {
        return ''
    }
}


/**
 * Playwright實際採用之瀏覽器目錄(registryDirectory, 其模組初始化時依PLAYWRIGHT_BROWSERS_PATH決定之絕對路徑), 取不到時回''
 */
function getPwRegistryDirectory() {
    try {
        return String(core.registry.registryDirectory || '')
    }
    catch (err) {
        return ''
    }
}

//registryDirectoryAtLoad, 本模組載入時Playwright之瀏覽器目錄快照(安裝子行程以此傳入PLAYWRIGHT_BROWSERS_PATH, F22)
let registryDirectoryAtLoad = getPwRegistryDirectory()


/**
 * Playwright受管之headless shell執行檔路徑(無頭且未給通道時Playwright所用者; 不判存在), 取不到時回''
 */
function getManagedShellPath() {
    try {
        let e = core.registry.registry.findExecutable('chromium-headless-shell')
        return e ? String(e.executablePath() || '') : ''
    }
    catch (err) {
        return ''
    }
}


/**
 * 實裝playwright-core之版本是否等於內附表之版本
 */
function isTableMatch() {
    return pwState.coreVersion === pwDefaults.version
}


export {
    chromium,
    pwState,
    coreRoot,
    cliPath,
    getEnvLikePw,
    isInspectorValue,
    pwdebugAtLoad,
    getPwDebugMode,
    getPwRegistryDirectory,
    registryDirectoryAtLoad,
    getManagedShellPath,
    isTableMatch
}
