import pwDefaults from '../../src/pwDefaults.mjs'
import { switchName } from '../../src/getChromiumLaunchOptions.mjs'


//cmdline, 測試用之命令列輔助: 預設串、模擬Playwright之組參數與ignoreDefaultArgs精確過濾、取生效之disable集合


/**
 * 內附表之預設disable串
 */
function defDisStr() {
    return '--disable-features=' + pwDefaults.disableFeatures.join(',')
}


/**
 * 內附表之預設enable串(依環境變數PLAYWRIGHT_LEGACY_SCREENSHOT, 為空回'')
 */
function defEnStr(env = process.env) {
    return env[pwDefaults.enableLegacyEnv] ? '' : '--enable-features=' + pwDefaults.enableFeatures.join(',')
}


/**
 * 模擬Playwright 1.64.1之組參數(chromiumSwitches之代表項＋預設disable/enable＋使用者args, 再以ignoreDefaultArgs精確過濾整串)
 * 真實之命令列由api-pwDrift以headless shell實證, 此處只供單元測試斷言合併器之輸出
 */
function simulatePwCmdline(out, env = process.env) {
    let en = defEnStr(env)
    let arr = [
        '--disable-field-trial-config',
        '--disable-extensions',
        defDisStr(),
        en, //Playwright於PLAYWRIGHT_LEGACY_SCREENSHOT時放''
        '--allow-pre-commit-input',
        '--no-sandbox',
        ...out.args,
    ]
    let ig = Array.isArray(out.ignoreDefaultArgs) ? out.ignoreDefaultArgs : []
    return arr.filter((a) => ig.indexOf(a) < 0).filter((a) => a !== '')
}


/**
 * 命令列中開關名為name之元素(依Chromium之辨識: 去前置-、不分大小寫、取=之前)
 */
function findSwitches(arr, name) {
    return arr.filter((a) => typeof a === 'string' && a.startsWith('-') && switchName(a) === name)
}


/**
 * 生效之功能集合: Chromium對同名開關只取最後一個(事件紀錄:62-73), 回其項目集合
 */
function effectiveFeatures(arr, name) {
    let sws = findSwitches(arr, name)
    if (sws.length === 0) {
        return new Set()
    }
    let last = sws[sws.length - 1]
    let i = last.indexOf('=')
    let v = i >= 0 ? last.slice(i + 1) : ''
    return new Set(v.split(',').map((t) => t.trim()).filter((t) => t !== ''))
}


/**
 * 守門是否生效: 生效之disable集合⊇內附表預設∪守門功能
 */
function guardEffective(set) {
    return [...pwDefaults.disableFeatures, ...pwDefaults.guardFeatures].every((f) => set.has(f))
}


export {
    defDisStr,
    defEnStr,
    simulatePwCmdline,
    findSwitches,
    effectiveFeatures,
    guardEffective
}
